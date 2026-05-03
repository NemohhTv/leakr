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
];

function isSkippableThumbnailDomain(url: string): boolean {
  return SKIP_THUMBNAIL_DOMAINS.some(d => url.includes(d));
}

// Extract YouTube video ID from common URL formats
function extractYouTubeVideoId(url: string): string | null {
  const m = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|live\/|embed\/|shorts\/))([A-Za-z0-9_-]{11})/,
  );
  return m?.[1] ?? null;
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

    // 1. Link post: dedicated [link] anchor pointing to the source article
    const linkAnchorMatch = contentHtml.match(
      /href="(https?:\/\/(?!(?:www\.)?reddit\.com|(?:\w+\.)?redd\.it)[^"]+)"[^>]*>\[link\]/,
    );
    if (linkAnchorMatch?.[1] && !isSkippableThumbnailDomain(linkAnchorMatch[1])) {
      map.set(threadUrl, linkAnchorMatch[1]);
      continue;
    }

    // 2. Self-post: scan body for first useful external link (YouTube, news articles, etc.)
    const allHrefs = [...contentHtml.matchAll(/href="(https?:\/\/[^"]+)"/g)].map(m => m[1]);
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
  return fetchOgImage(url).catch(() => null);
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

// ── Reddit: r/GamingLeaksAndRumours (enriched JSON — hot + new combined) ─────
router.get("/feed/reddit-enriched", async (req, res) => {
  try {
    const [hotData, newData] = await Promise.all([
      buildRedditEnrichedResponse("https://www.reddit.com/r/GamingLeaksAndRumours/hot.rss?limit=5"),
      buildRedditEnrichedResponse("https://www.reddit.com/r/GamingLeaksAndRumours/new.rss?limit=25"),
    ]);
    const xml = mergeAtomFeeds(hotData.xml, newData.xml);
    const thumbnails = { ...newData.thumbnails, ...hotData.thumbnails };
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=900");
    res.json({ xml, thumbnails });
  } catch (err) {
    req.log.error({ err }, "Reddit enriched feed failed");
    res.status(500).json({ error: "Failed to fetch Reddit enriched feed" });
  }
});

// ── Reddit: r/gamingnews (enriched JSON) ─────────────────────────────────────
router.get("/feed/gamingnews-enriched", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query["limit"]) || 25, 50);
    const data = await buildRedditEnrichedResponse(
      `https://www.reddit.com/r/gamingnews/top.rss?limit=${limit}&t=day`,
    );
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=900");
    res.json(data);
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

    // Read full text — og:image is always in <head>, usually in the first 20KB
    const html = (await res.text()).slice(0, 25_000);

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

// ── RAWG image proxy (keeps API key server-side) ─────────────────────────────
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

  // Aggressive scrub to isolate game name
  const scrubbed = rawQuery
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
    res.status(400).json({ error: "Query too noisy to resolve" });
    return;
  }

  try {
    // Significant words from the original query for relevance check
  const queryWords = new Set(
    scrubbed
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2 && !["the", "and", "for", "with", "from", "that", "this", "are", "was", "has", "its", "not", "but"].includes(w)),
  );

  // Require a game result to share enough key words with the query.
  // For multi-word queries (2+ key words), need 2 matching words to prevent
  // "Black Desert Online" matching a search for "Crimson Desert".
  function isRelevant(gameName: string): boolean {
    if (queryWords.size === 0) return false;
    const gameWords = new Set(
      gameName
        .toLowerCase()
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
      url.searchParams.set("page_size", "5");
      url.searchParams.set("search_exact", "false");
      url.searchParams.set("exclude_additions", "true"); // No DLCs / expansions
      url.searchParams.set("ordering", "-added");        // Most added = most popular

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

        // Require meaningful community traction to avoid obscure / mismatched results
        if ((best.ratings_count ?? 0) > 50) {
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

    if (!bestResult) {
      res.status(404).json({ error: "No suitable image found" });
      return;
    }

    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json({
      image: bestResult.background_image,
      name: bestResult.name,
      slug: bestResult.slug,
    });
  } catch (err) {
    req.log.error({ err }, "RAWG API request failed");
    res.status(500).json({ error: "RAWG request failed" });
  }
});

export default router;
