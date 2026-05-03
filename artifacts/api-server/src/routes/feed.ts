import { Router } from "express";

const router = Router();

// ── Reddit Atom helpers ───────────────────────────────────────────────────────

function unescapeHtmlEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#32;/g, " ")
    .replace(/&#39;/g, "'");
}

// Domains that are unlikely to have useful og:images for article thumbnails
const SKIP_THUMBNAIL_DOMAINS = [
  "xcancel.com", "twitter.com", "x.com",
  "imgur.com", "ibb.co", "i.redd.it", "preview.redd.it",
  "old.reddit.com", "www.reddit.com", "redd.it",
  // Instagram + Meta CDNs hard-block hotlinking — the URL works in a browser
  // session but returns 403/expired-signature when loaded from another origin.
  "instagram.com", "cdninstagram.com", "fbcdn.net",
  // TikTok CDNs similarly use signed URLs that expire quickly.
  "tiktok.com", "tiktokcdn.com",
  // Cloudflare-protected sites that return 403 to server-side fetches regardless of
  // User-Agent (TLS/JA3 fingerprinting). Skipping the og:image fetch lets the client
  // fall back to RAWG instead of waiting for a guaranteed-failure round-trip.
  "gamespot.com",
];

function isSkippableThumbnailDomain(url: string): boolean {
  return SKIP_THUMBNAIL_DOMAINS.some(d => url.includes(d));
}

// If an og:image we resolved is itself hosted on a hotlink-blocked CDN, treat it as a miss
// so the client can fall back to RAWG instead of rendering a broken image.
function isHotlinkBlockedImageUrl(url: string): boolean {
  return /(?:cdninstagram\.com|fbcdn\.net|tiktokcdn\.com|scontent[\w-]*\.)/i.test(url);
}

// Extract YouTube video ID from common URL formats (handles all watch/live/embed/shorts paths,
// youtu.be short links, m.youtube.com mobile, and ?v=ID query-string variants).
function extractYouTubeVideoId(url: string): string | null {
  // Standard path forms
  const pathMatch = url.match(
    /(?:youtu\.be\/|(?:m\.|www\.)?youtube\.com\/(?:watch\?[^"'\s]*v=|live\/|embed\/|shorts\/|v\/))([A-Za-z0-9_-]{11})/,
  );
  if (pathMatch?.[1]) return pathMatch[1];
  // Bare ?v= anywhere in a youtube.com URL
  if (/(?:^|\/\/)(?:m\.|www\.)?youtube\.com\b/.test(url)) {
    const vMatch = url.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    if (vMatch?.[1]) return vMatch[1];
  }
  return null;
}

// Parse Reddit Atom XML server-side: returns a map of redditThreadUrl → best source URL for thumbnail
function extractRedditExternalLinks(atomXml: string): Map<string, string> {
  const map = new Map<string, string>();
  const entryMatches = [...atomXml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];

  for (const [, entryXml] of entryMatches) {
    const threadUrl = entryXml.match(/<link[^>]+href="([^"]+)"/)?.[1];
    if (!threadUrl || !threadUrl.includes("reddit.com")) continue;

    const contentEncoded = entryXml.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1];
    if (!contentEncoded) continue;

    const contentHtml = unescapeHtmlEntities(contentEncoded);
    const allHrefs = [...contentHtml.matchAll(/href="(https?:\/\/[^"]+)"/g)].map(m => m[1]);

    // 1. STRONG priority: any YouTube video link anywhere in the post — gives us a guaranteed
    //    high-quality thumbnail directly from img.youtube.com (no og:image fetch needed).
    const youtubeUrl = allHrefs.find(h => extractYouTubeVideoId(h) !== null);
    if (youtubeUrl) {
      map.set(threadUrl, youtubeUrl);
      continue;
    }

    // 2. Link post: dedicated [link] anchor pointing to the source article
    const linkAnchorMatch = contentHtml.match(
      /href="(https?:\/\/(?!(?:www\.)?reddit\.com|(?:\w+\.)?redd\.it)[^"]+)"[^>]*>\[link\]/,
    );
    if (linkAnchorMatch?.[1] && !isSkippableThumbnailDomain(linkAnchorMatch[1])) {
      map.set(threadUrl, linkAnchorMatch[1]);
      continue;
    }

    // 3. Self-post: first useful external link (news article, etc.)
    const firstUseful = allHrefs.find(h => {
      if (h.includes("reddit.com") || h.includes("redd.it")) return false;
      if (isSkippableThumbnailDomain(h)) return false;
      return true;
    });
    if (firstUseful) {
      map.set(threadUrl, firstUseful);
    }
  }

  return map;
}

// Get the best available thumbnail for an article URL:
// - YouTube → direct CDN thumbnail (no API key needed, always works)
//   Uses hqdefault (480x360) which is reliably available for all videos.
//   maxresdefault only exists for HD videos and returns 404 otherwise.
// - Everything else → fetch og:image from the page
async function getArticleThumbnail(url: string): Promise<string | null> {
  const ytId = extractYouTubeVideoId(url);
  if (ytId) {
    return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
  }
  const og = await fetchOgImage(url).catch(() => null);
  if (og && isHotlinkBlockedImageUrl(og)) return null;
  return og;
}

async function buildRedditEnrichedResponse(
  subredditUrl: string,
): Promise<{ xml: string; thumbnails: Record<string, string> }> {
  const response = await fetch(subredditUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Leakr/1.0; +https://leakr.gg)",
      Accept: "application/atom+xml, application/xml, text/xml, */*",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) throw new Error(`Reddit fetch failed: ${response.status}`);

  const xml = await response.text();
  const linkMap = extractRedditExternalLinks(xml);

  const entries = [...linkMap.entries()];
  const images = await Promise.all(entries.map(([, extUrl]) => getArticleThumbnail(extUrl)));

  const thumbnails: Record<string, string> = {};
  entries.forEach(([threadUrl], i) => {
    const img = images[i];
    if (img) thumbnails[threadUrl] = img;
  });

  return { xml, thumbnails };
}

// Merge two Atom XML feeds into one by combining <entry> elements, deduplicating by thread URL
function mergeAtomFeeds(xml1: string, xml2: string): string {
  const headerEnd = xml1.indexOf("<entry>");
  const header = headerEnd >= 0 ? xml1.substring(0, headerEnd) : xml1.replace("</feed>", "");
  const extract = (xml: string) => [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => m[0]);
  const seen = new Set<string>();
  const all: string[] = [];
  for (const entry of [...extract(xml1), ...extract(xml2)]) {
    const url = entry.match(/<link[^>]+href="([^"]+)"/)?.[1];
    if (url && !seen.has(url)) { seen.add(url); all.push(entry); }
  }
  return header + all.join("\n") + "\n</feed>";
}

// ── Reddit: r/GamingLeaksAndRumours (top-week 5 + new 5) ─────────────────────
router.get("/feed/reddit-enriched", async (req, res) => {
  try {
    const [topData, newData] = await Promise.all([
      buildRedditEnrichedResponse("https://www.reddit.com/r/GamingLeaksAndRumours/top.rss?limit=5&t=week"),
      buildRedditEnrichedResponse("https://www.reddit.com/r/GamingLeaksAndRumours/new.rss?limit=5"),
    ]);
    const xml = mergeAtomFeeds(topData.xml, newData.xml);
    const thumbnails = { ...newData.thumbnails, ...topData.thumbnails };
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=900");
    res.json({ xml, thumbnails });
  } catch (err) {
    req.log.error({ err }, "Reddit enriched feed failed");
    res.status(500).json({ error: "Failed to fetch Reddit enriched feed" });
  }
});

// ── Reddit: r/GamingNews (top-week 5 + new 5) ────────────────────────────────
router.get("/feed/gamingnews-enriched", async (req, res) => {
  try {
    const [topData, newData] = await Promise.all([
      buildRedditEnrichedResponse("https://www.reddit.com/r/gamingnews/top.rss?limit=5&t=week"),
      buildRedditEnrichedResponse("https://www.reddit.com/r/gamingnews/new.rss?limit=5"),
    ]);
    const xml = mergeAtomFeeds(topData.xml, newData.xml);
    const thumbnails = { ...newData.thumbnails, ...topData.thumbnails };
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=900");
    res.json({ xml, thumbnails });
  } catch (err) {
    req.log.error({ err }, "GamingNews enriched feed failed");
    res.status(500).json({ error: "Failed to fetch GamingNews enriched feed" });
  }
});

// ── RSS: IGN Gaming ───────────────────────────────────────────────────────────
router.get("/feed/ign", async (req, res) => {
  try {
    const response = await fetch("https://feeds.ign.com/ign/games-all", {
      headers: {
        "User-Agent": "Leakr/1.0 News Aggregator",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      res.status(response.status).json({ error: "Failed to fetch IGN feed" });
      return;
    }

    const xml = await response.text();
    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Cache-Control", "public, max-age=900");
    res.send(xml);
  } catch (err) {
    req.log.error({ err }, "IGN feed fetch failed");
    res.status(500).json({ error: "Failed to fetch IGN feed" });
  }
});

// ── og:image cache (server-side, keyed by article URL) ───────────────────────
const ogImageCache: Map<string, string | null> = new Map();
const OG_CACHE_TTL = 30 * 60 * 1000; // 30 min
const ogImageTimestamps: Map<string, number> = new Map();

async function fetchOgImage(articleUrl: string): Promise<string | null> {
  const now = Date.now();
  const ts = ogImageTimestamps.get(articleUrl) ?? 0;
  if (ogImageCache.has(articleUrl) && now - ts < OG_CACHE_TTL) {
    return ogImageCache.get(articleUrl) ?? null;
  }

  try {
    const res = await fetch(articleUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Leakr/1.0; +https://leakr.gg)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) { ogImageCache.set(articleUrl, null); return null; }

    // Read enough HTML to reliably reach og:image. Many WordPress sites (tech4gamers,
    // gameinformer, etc.) inject lots of analytics/preload tags before og:image, pushing
    // it past 25KB. 60KB covers the vast majority while keeping memory bounded.
    const html = (await res.text()).slice(0, 60_000);

    // Match both attribute orders: property="og:image" content="..." and vice versa
    const match =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

    const image = match?.[1]?.trim() ?? null;
    ogImageCache.set(articleUrl, image);
    ogImageTimestamps.set(articleUrl, now);
    return image;
  } catch {
    ogImageCache.set(articleUrl, null);
    ogImageTimestamps.set(articleUrl, now);
    return null;
  }
}

// ── RSS: Insider Gaming (enriched JSON with og:images) ────────────────────────
router.get("/feed/insider-enriched", async (req, res) => {
  try {
    const response = await fetch("https://insider-gaming.com/feed/", {
      headers: {
        "User-Agent": "Leakr/1.0 News Aggregator",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      res.status(response.status).json({ error: "Failed to fetch Insider Gaming feed" });
      return;
    }

    const xml = await response.text();

    // Parse article URLs from RSS XML — exclude channel homepage links (path must have slug)
    const urlMatches = [...xml.matchAll(/<link>\s*(https?:\/\/insider-gaming\.com\/[a-z0-9][^<\s]{5,})\s*<\/link>/gi)];
    const articleUrls = [...new Set(urlMatches.map(m => m[1].trim()).filter(u => !u.endsWith("insider-gaming.com/")))];

    // Fetch og:images in parallel with a 6-second total budget
    const images = await Promise.all(
      articleUrls.map(url => fetchOgImage(url).catch(() => null)),
    );

    // Build url → image map
    const thumbnailMap: Record<string, string> = {};
    articleUrls.forEach((url, i) => {
      const img = images[i];
      if (img) thumbnailMap[url] = img;
    });

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=900");
    res.json({ xml, thumbnails: thumbnailMap });
  } catch (err) {
    req.log.error({ err }, "Insider Gaming feed fetch failed");
    res.status(500).json({ error: "Failed to fetch Insider Gaming feed" });
  }
});

// ── RSS: Video Games Chronicle (VGC) ─────────────────────────────────────────
router.get("/feed/vgc", async (req, res) => {
  try {
    const response = await fetch("https://www.videogameschronicle.com/feed/", {
      headers: {
        "User-Agent": "Leakr/1.0 News Aggregator",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      res.status(response.status).json({ error: "Failed to fetch VGC feed" });
      return;
    }

    const xml = await response.text();
    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Cache-Control", "public, max-age=900");
    res.send(xml);
  } catch (err) {
    req.log.error({ err }, "VGC feed fetch failed");
    res.status(500).json({ error: "Failed to fetch VGC feed" });
  }
});

// ── RSS: Gameranx ────────────────────────────────────────────────────────────
router.get("/feed/gameranx", async (req, res) => {
  try {
    const response = await fetch("https://gameranx.com/feed/", {
      headers: {
        "User-Agent": "Leakr/1.0 News Aggregator",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      res.status(response.status).json({ error: "Failed to fetch Gameranx feed" });
      return;
    }

    const xml = await response.text();
    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Cache-Control", "public, max-age=900");
    res.send(xml);
  } catch (err) {
    req.log.error({ err }, "Gameranx feed fetch failed");
    res.status(500).json({ error: "Failed to fetch Gameranx feed" });
  }
});

// ── RAWG image proxy (keeps API key server-side) ─────────────────────────────
// Server-side cache + in-flight dedupe. Client also caches in localStorage, but the
// server cache is shared across users — so the very first user to view a popular
// article pays the n-gram fan-out cost ONCE, and every subsequent user (and every
// other user across any browser) gets a cache hit. The in-flight map ensures that
// if 50 cards mount simultaneously and request the same title, only ONE RAWG fan-out
// runs and the other 49 await its promise.
type RawgImageResult = { image: string; name: string; slug: string } | { error: string; status: number };
interface RawgCacheEntry { result: RawgImageResult; ts: number; }
const RAWG_CACHE = new Map<string, RawgCacheEntry>();
const RAWG_INFLIGHT = new Map<string, Promise<RawgImageResult>>();
const RAWG_POSITIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RAWG_NEGATIVE_TTL_MS = 6 * 60 * 60 * 1000;       // 6 hours
const RAWG_CACHE_MAX_ENTRIES = 5000;                   // soft cap to bound memory

function rawgCacheGet(key: string): RawgImageResult | null {
  const entry = RAWG_CACHE.get(key);
  if (!entry) return null;
  const isPositive = "image" in entry.result;
  const ttl = isPositive ? RAWG_POSITIVE_TTL_MS : RAWG_NEGATIVE_TTL_MS;
  if (Date.now() - entry.ts > ttl) {
    RAWG_CACHE.delete(key);
    return null;
  }
  return entry.result;
}

function rawgCacheSet(key: string, result: RawgImageResult): void {
  // Naive size cap — if the map gets too big, drop the oldest 10% of entries.
  // Map iteration order is insertion order, so the first entries are the oldest.
  if (RAWG_CACHE.size >= RAWG_CACHE_MAX_ENTRIES) {
    const dropCount = Math.floor(RAWG_CACHE_MAX_ENTRIES * 0.1);
    let dropped = 0;
    for (const k of RAWG_CACHE.keys()) {
      RAWG_CACHE.delete(k);
      if (++dropped >= dropCount) break;
    }
  }
  RAWG_CACHE.set(key, { result, ts: Date.now() });
}

router.get("/rawg/image", async (req, res) => {
  const rawQuery = req.query["q"];
  if (!rawQuery || typeof rawQuery !== "string") {
    res.status(400).json({ error: "Missing query parameter 'q'" });
    return;
  }

  const apiKey = process.env["RAWG_API_KEY"];
  if (!apiKey) {
    res.status(500).json({ error: "RAWG API key not configured" });
    return;
  }

  // Cache key: lowercased + collapsed-whitespace raw query. Same article title from
  // two slightly different feeds resolves identically.
  const cacheKey = rawQuery.toLowerCase().replace(/\s+/g, " ").trim();

  // 1) Cache hit?
  const cached = rawgCacheGet(cacheKey);
  if (cached) {
    if ("image" in cached) {
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.json(cached);
    } else {
      res.status(cached.status).json({ error: cached.error });
    }
    return;
  }

  // 2) In-flight dedupe — if another request is already resolving this exact title,
  // await its result instead of starting a parallel fan-out.
  const inflight = RAWG_INFLIGHT.get(cacheKey);
  if (inflight) {
    const result = await inflight;
    if ("image" in result) {
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.json(result);
    } else {
      res.status(result.status).json({ error: result.error });
    }
    return;
  }

  // Reddit-style "[Studio Name, developers of X]: real headline" posts —
  // the game name is in the headline AFTER the bracket. Drop the bracketed prefix entirely.
  // REQUIRE the trailing colon — that's the signal the bracket is attribution, not the game
  // title itself (e.g. "[The Witcher 4] new trailer" must NOT be stripped).
  const debracketed = rawQuery.replace(/^\s*\[[^\]]{1,200}\]\s*:\s*/, "");

  // Aggressive scrub to isolate game name
  const scrubbed = debracketed
    // Remove developer-attribution phrases common in Reddit bracket-style posts
    .replace(/\b(developer|studio|studios|creators?|publisher|publishers?|team|subsidiary)\s+(of|behind|for|from)\s+(the\s+)?(famous|popular|renowned|legendary|beloved|iconic|classic)?\s*/gi, "")
    .replace(/,?\s*developers?\s+of\s+(the\s+)?(famous|popular|renowned|legendary|beloved|iconic|classic)?\s*/gi, " ")
    .replace(
      /\b(leak(ed)?|rumou?r(ed)?|confirm(ed)?|official(ly)?|reveal(ed)?|trailer|datamine[d]?|report(ed)?|insider|exclusive|breaking|update|patch|dlc|expansion|season\s*\d+|episode\s*\d+|chapter\s*\d+|part\s*\d+|v\d+(\.\d+)*|\d{4}|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|monday|tuesday|wednesday|thursday|friday|saturday|sunday|according|sources|says?|allegedly|reportedly|analyst|suggests?|hints?|teases?|upcoming|new|next|latest|sequel|prequel|remaster|remake|reboot|announcement|announced|releases?|launching|launch|arrives?|coming|featured|could|might|would|should|will|won[''']t|isn[''']t|aren[''']t|hasn[''']t|haven[''']t|didn[''']t|doesn[''']t|can[''']t|franchise|studios?|publishers?|developers?)\b/gi,
      "",
    )
    .replace(/[^a-z0-9\s:]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!scrubbed || scrubbed.length < 2) {
    const result: RawgImageResult = { error: "Query too noisy to resolve", status: 400 };
    rawgCacheSet(cacheKey, result);
    res.status(400).json({ error: result.error });
    return;
  }

  // Register an in-flight promise so concurrent requests for the same title coalesce.
  let resolveInflight!: (r: RawgImageResult) => void;
  const inflightPromise = new Promise<RawgImageResult>(r => { resolveInflight = r; });
  RAWG_INFLIGHT.set(cacheKey, inflightPromise);
  const finalize = (result: RawgImageResult): void => {
    rawgCacheSet(cacheKey, result);
    resolveInflight(result);
    RAWG_INFLIGHT.delete(cacheKey);
  };

  // Publisher / platform fallback: when a title only mentions a publisher or platform
  // (e.g. "Gamespot: PlayStation spokesperson on DRM"), there's no specific game to look up.
  // Map these to a flagship first-party title so we still return a representative cover.
  const PUBLISHER_FALLBACKS: Array<{ pattern: RegExp; fallbackQuery: string }> = [
    { pattern: /\b(playstation studios|playstation|sony interactive|sony)\b/i, fallbackQuery: "god of war" },
    { pattern: /\b(xbox game studios|xbox|microsoft gaming|microsoft)\b/i, fallbackQuery: "halo infinite" },
    { pattern: /\b(nintendo)\b/i, fallbackQuery: "zelda tears of the kingdom" },
    { pattern: /\b(take[\s-]?two|take[\s-]?two interactive|rockstar(\s+games)?|2k(\s+games)?)\b/i, fallbackQuery: "grand theft auto vi" },
    { pattern: /\b(valve(\s+(corporation|software))?)\b/i, fallbackQuery: "counter-strike 2" },
    { pattern: /\b(ubisoft(\s+(entertainment|montreal))?)\b/i, fallbackQuery: "assassin's creed" },
  ];
  // Only apply the fallback when EXACTLY ONE publisher is mentioned. If a title mentions
  // multiple ("Sony and Microsoft comment on..."), there's no single right flagship to pick,
  // so we skip the fallback and let the normal search path decide.
  const publisherMatches = PUBLISHER_FALLBACKS.filter(p => p.pattern.test(rawQuery));
  const publisherFallback = publisherMatches.length === 1 ? publisherMatches[0]!.fallbackQuery : null;

  try {
    // Unicode-safe word normalizer: strips diacritics so "Pokémon" → "pokemon",
  // "Final Fantasy XIV: Endwalker" → matches across diacritic-stripped variants.
  const normalizeWord = (s: string): string =>
    s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  // Significant words from the original query for relevance check.
  // The "generic" list strips words that appear in tons of game names AND tons of article
  // titles (e.g. "video game studio") — they create false positives like
  // "Ghostbusters: The Video Game" matching a Ubisoft layoffs article.
  const STOP_WORDS = new Set([
    "the", "and", "for", "with", "from", "that", "this", "are", "was", "has", "its", "not", "but",
    // generic words that match too many titles
    "video", "game", "games", "online", "world", "year", "years", "time", "times", "story",
    "edition", "definitive", "remastered", "deluxe", "ultimate", "complete", "collection",
    "new", "latest", "next", "hits", "history", "players", "people", "play", "playing",
  ]);
  const queryWords = new Set(
    normalizeWord(scrubbed)
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w)),
  );

  // Require a game result to share enough key words with the query.
  // For multi-word queries (2+ key words), need 2 matching words to prevent
  // "Black Desert Online" matching a search for "Crimson Desert".
  function isRelevant(gameName: string): boolean {
    if (queryWords.size === 0) return false;
    const gameWords = new Set(
      normalizeWord(gameName)
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(w => w.length > 2),
    );
    let matchCount = 0;
    for (const w of queryWords) {
      if (gameWords.has(w)) matchCount++;
    }
    // If every word of the game name appears in the query it's a definite match
    if (gameWords.size > 0 && [...gameWords].every(w => queryWords.has(w))) return true;
    // Short game names (1 word) only need 1 match — handles "[Dev]: game info" style titles
    const required = (queryWords.size >= 2 && gameWords.size >= 2) ? 2 : 1;
    return matchCount >= required;
  }

  // Strategy: try full scrubbed query then first 4 words — but never drop below 3 meaningful words
  const words = scrubbed.split(" ").filter(w => w.length > 0);
  const queries = [
    scrubbed,
    words.length > 4 ? words.slice(0, 4).join(" ") : null,
  ].filter((q): q is string => q !== null && q.trim().length >= 3);

    let bestResult: { background_image: string; name: string; slug: string; ratings_count?: number } | null = null;

    for (const query of queries) {
      const url = new URL("https://api.rawg.io/api/games");
      url.searchParams.set("key", apiKey);
      url.searchParams.set("search", query);
      url.searchParams.set("page_size", "10");
      url.searchParams.set("search_exact", "false");
      // Use RAWG's default relevance ranking. Previously we set ordering=-added (most-played)
      // which made noisy long titles return GTA V / Witcher 3 / Portal 2 regardless of what
      // the article was actually about — none would survive the isRelevant filter and we'd
      // fall through to the publisher fallback. Relevance ordering surfaces the actually-
      // referenced game (e.g. "Team Fortress 2" for a TF2 article) within the top results.
      // Also no exclude_additions=true — RAWG mis-classifies "Counter-Strike 2" as an addition.
      // The isRelevant word-overlap filter + 50-rating floor are strong enough to reject DLCs.

      const response = await fetch(url.toString(), {
        headers: { "User-Agent": "Leakr/1.0" },
        signal: AbortSignal.timeout(6000),
      });

      if (!response.ok) continue;

      const data = (await response.json()) as {
        results?: Array<{
          background_image?: string;
          name?: string;
          slug?: string;
          ratings_count?: number;
          metacritic?: number;
        }>;
      };

      // Only keep candidates with a real image AND name relevance to the query
      const candidates = (data.results ?? []).filter(
        r =>
          r.background_image &&
          !r.background_image.includes("media/screenshots") &&
          r.name &&
          isRelevant(r.name),
      );

      if (candidates.length > 0) {
        // Prefer games with community traction
        const best = candidates.reduce((a, b) =>
          (b.ratings_count ?? 0) > (a.ratings_count ?? 0) ? b : a,
        );

        // Require some community traction to avoid obscure / mismatched results.
        // Lowered from 50→10 so legitimate smaller titles like Crimson Desert (19 ratings)
        // resolve. The isRelevant word-overlap filter is doing the heavy lifting on quality.
        if ((best.ratings_count ?? 0) > 10) {
          bestResult = {
            background_image: best.background_image!,
            name: best.name!,
            slug: best.slug!,
            ratings_count: best.ratings_count,
          };
          break;
        }
      }
    }

    // ── N-gram phrase extraction (future-proof title matching) ────────────────
    // The full-title search above can fail when the actual game name is buried inside a
    // long noisy headline (e.g. "...the scrapped Team Fortress 2 iteration..."). RAWG's
    // relevance score gets diluted across all the noise words and the right game falls
    // off the result page. Solution: slide 2-, 3-, and 4-word windows across the scrubbed
    // title and search RAWG for each — the actual game name almost always appears as one
    // of these windows. Run them in parallel to keep latency low. This means we don't have
    // to hand-maintain a list of every game/franchise in existence.
    if (!bestResult) {
      const allWords = scrubbed.split(/\s+/).filter(w => w.length > 0);
      const alreadyTried = new Set(queries.map(q => q.toLowerCase()));
      const STOP_PHRASE_WORDS = new Set([...STOP_WORDS, "his", "her", "him", "she", "have", "had", "who", "what", "when", "where", "why", "how"]);
      const phrases: string[] = [];
      // Longer windows are more specific — try 4-word, then 3-word, then 2-word.
      for (const size of [4, 3, 2]) {
        for (let i = 0; i + size <= allWords.length; i++) {
          const window = allWords.slice(i, i + size).join(" ");
          const lc = window.toLowerCase();
          if (alreadyTried.has(lc)) continue;
          alreadyTried.add(lc);
          // Skip windows that are entirely stop words / noise — they'd just match popular
          // games on irrelevant words ("the new" → matches everything).
          const hasContentWord = window.split(" ").some(w => !STOP_PHRASE_WORDS.has(w.toLowerCase()) && w.length > 2);
          if (!hasContentWord) continue;
          phrases.push(window);
        }
      }
      // Cap the number of parallel calls to bound RAWG load. 8 is plenty in practice
      // — the actual game name surfaces in one of the first few windows for any sane title.
      const PHRASE_CALL_BUDGET = 8;
      const targetedPhrases = phrases.slice(0, PHRASE_CALL_BUDGET);
      if (targetedPhrases.length > 0) {
        req.log.info({ rawQuery, phrases: targetedPhrases }, "RAWG n-gram phrase search");
        const phraseResults = await Promise.all(
          targetedPhrases.map(async (phrase) => {
            try {
              const phraseUrl = new URL("https://api.rawg.io/api/games");
              phraseUrl.searchParams.set("key", apiKey);
              phraseUrl.searchParams.set("search", phrase);
              phraseUrl.searchParams.set("page_size", "5");
              phraseUrl.searchParams.set("search_exact", "false");
              const phraseResp = await fetch(phraseUrl.toString(), {
                headers: { "User-Agent": "Leakr/1.0" },
                signal: AbortSignal.timeout(6000),
              });
              if (!phraseResp.ok) return [];
              const phraseData = (await phraseResp.json()) as {
                results?: Array<{ background_image?: string; name?: string; slug?: string; ratings_count?: number }>;
              };
              return (phraseData.results ?? []).filter(
                r =>
                  r.background_image &&
                  !r.background_image.includes("media/screenshots") &&
                  r.name &&
                  r.slug &&
                  isRelevant(r.name),
              );
            } catch {
              return [];
            }
          }),
        );
        // Across every phrase's candidates, pick the highest-rated game. This naturally
        // surfaces "Team Fortress 2" (2940 ratings) over "Fortress Forever" (1 rating)
        // because the full-title isRelevant check ensures every candidate is on-topic.
        const allCandidates = phraseResults.flat();
        if (allCandidates.length > 0) {
          const phraseBest = allCandidates.reduce((a, b) =>
            (b.ratings_count ?? 0) > (a.ratings_count ?? 0) ? b : a,
          );
          if ((phraseBest.ratings_count ?? 0) > 10) {
            bestResult = {
              background_image: phraseBest.background_image!,
              name: phraseBest.name!,
              slug: phraseBest.slug!,
              ratings_count: phraseBest.ratings_count,
            };
          }
        }
      }
    }

    // Publisher / platform fallback: if no specific game matched but the title mentions
    // a publisher/platform, search RAWG for a representative flagship game.
    if (!bestResult && publisherFallback) {
      // NOTE: search_exact=true returns 0 results for many flagship titles whose canonical
      // RAWG name contains roman numerals/hyphens/apostrophes (e.g. "Grand Theft Auto VI",
      // "Counter-Strike 2"). Use fuzzy search and rely on the strict word-overlap filter
      // below + the highest ratings_count to land on the actual flagship.
      const fbWords = new Set(
        normalizeWord(publisherFallback).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2),
      );
      const fbUrl = new URL("https://api.rawg.io/api/games");
      fbUrl.searchParams.set("key", apiKey);
      fbUrl.searchParams.set("search", publisherFallback);
      fbUrl.searchParams.set("page_size", "20");
      // Do NOT set exclude_additions=true — RAWG mis-classifies "Counter-Strike 2" as an
      // addition and drops it from results. Do NOT set ordering=-added — that buries newer
      // flagships (GTA VI, CS2) under their older, more-played predecessors. Use RAWG's
      // default relevance score, which puts the canonical-name match at the top.
      req.log.info({ rawQuery, publisherFallback, fbWords: [...fbWords] }, "RAWG publisher fallback");
      const fbResp = await fetch(fbUrl.toString(), {
        headers: { "User-Agent": "Leakr/1.0" },
        signal: AbortSignal.timeout(6000),
      });
      if (fbResp.ok) {
        const fbData = (await fbResp.json()) as {
          results?: Array<{ background_image?: string; name?: string; slug?: string; ratings_count?: number }>;
        };
        const fbCandidates = (fbData.results ?? []).filter(r => {
          if (!r.background_image || r.background_image.includes("media/screenshots")) return false;
          if (!r.name || !r.slug) return false;
          const nameWords = new Set(
            normalizeWord(r.name).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2),
          );
          // Require every word of the fallback query to appear in the game name
          return [...fbWords].every(w => nameWords.has(w));
        });
        if (fbCandidates.length > 0) {
          // Prefer an EXACT name match over the most-rated, so a fallback for
          // "grand theft auto vi" returns GTA VI specifically — not GTA V just because
          // it has 1000x more ratings.
          const normalizedFallback = normalizeWord(publisherFallback)
            .replace(/[^a-z0-9\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          const exactMatch = fbCandidates.find(r => {
            const normalizedName = normalizeWord(r.name!)
              .replace(/[^a-z0-9\s]/g, " ")
              .replace(/\s+/g, " ")
              .trim();
            return normalizedName === normalizedFallback;
          });
          const fbBest = exactMatch ?? fbCandidates.reduce((a, b) =>
            (b.ratings_count ?? 0) > (a.ratings_count ?? 0) ? b : a,
          );
          bestResult = {
            background_image: fbBest.background_image!,
            name: fbBest.name!,
            slug: fbBest.slug!,
            ratings_count: fbBest.ratings_count,
          };
        }
      }
    }

    if (!bestResult) {
      finalize({ error: "No suitable image found", status: 404 });
      res.status(404).json({ error: "No suitable image found" });
      return;
    }

    const successResult: RawgImageResult = {
      image: bestResult.background_image,
      name: bestResult.name,
      slug: bestResult.slug,
    };
    finalize(successResult);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json(successResult);
  } catch (err) {
    req.log.error({ err }, "RAWG API request failed");
    // Transient errors (network/timeout/5xx) are NOT cached — we want to retry on next
    // request. Just clear the in-flight slot so a retry isn't blocked.
    resolveInflight({ error: "RAWG request failed", status: 500 });
    RAWG_INFLIGHT.delete(cacheKey);
    res.status(500).json({ error: "RAWG request failed" });
  }
});

export default router;
