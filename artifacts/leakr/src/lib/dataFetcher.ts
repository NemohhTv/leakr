import { IntelItem, IntelSource } from "../types";
import { analyzeTierAndPlausibility } from "./tierEngine";

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

// ── Source domain blocklist (Kotaku, Polygon, PC Gamer) ──────────────────────
const BLOCKED_SOURCE_DOMAINS = [
  "kotaku.com",
  "polygon.com",
  "pcgamer.com",
  "pc-gamer.com",
];

function isBlockedSourceUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return BLOCKED_SOURCE_DOMAINS.some(d => host === d || host.endsWith("." + d));
  } catch {
    return false;
  }
}

// ── Content guard: filter out non-gaming / guide content ─────────────────────
const NON_GAMING_TITLE_PATTERNS: RegExp[] = [
  /NYT Connections/i,
  /Connections Hints/i,
  /Connections Answers/i,
  /\bConnections\b.{0,10}#\d+/i,
  /Wordle (Answer|Hint|Solution)/i,
  /\bWordle\b.{0,8}#\d+/i,
  /Crossword (Answer|Hint|Clue)/i,
  /Daily (Puzzle|Hint|Answer)/i,
  /Puzzle Answer(s)? for/i,
  /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[, ]+May/i,
  /Hints Today.{0,20}#\d+/i,
  /Answers for (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i,
  /Box Office/i,
  /Movie Review/i,
  /TV Show Review/i,
  /Episode Recap/i,
  /Season \d+ Episode/i,
  // Podcast / audio content
  /\bpodcast\b/i,
  /\bepisode \d+\b/i,
  /\bep\.?\s*\d+\b/i,
  // Opinion / editorial pieces (not news)
  /^opinion[:\s—–]/i,
  /^editorial[:\s—–]/i,
  /\bopinion piece\b/i,
  /^(the )?(case for|case against)\b/i,
  /^(here's why|let's talk about)\b/i,
  // Deals / commerce articles (not news)
  /\bbest deals?\b.{0,25}(today|this week|of the day)\b/i,
  /\bdeals (today|of the day|this week)\b/i,
  /today['''`]?s (best )?deals\b/i,
  /\bgame deals? (today|this week|of the day)\b/i,
  /\bcheapest games?\b/i,
  // Movie / film content that isn't about the game itself
  /\bmario (movie|film)\b/i,
  /\bsonic (movie|film)\b/i,
  /\bpokemon (movie|film)\b/i,
  /\bin \w+ movies?\b/i,
  /\bfilm adaptation\b/i,
  /\bmovie (sequel|casting|script|premiere|box office)\b/i,
  /\b(mario|zelda|sonic|pokemon|kirby)\s+movie\b/i,
];

const NON_GAMING_CATEGORIES = new Set([
  "guides", "wordle", "crossword", "puzzle", "hints",
  "movies", "tv", "film", "streaming", "new york times",
]);

// Words that indicate a title has meaningful news content (not just a bare game name)
const NEWS_SIGNAL_WORDS = [
  // Confirmation / announcement
  "confirmed", "confirms", "confirm", "official", "officially",
  "announced", "announces", "announcement", "reveals", "revealed", "reveal",
  // Leaks
  "leaked", "leak", "leaks", "datamined", "datamine",
  // Reports / rumors
  "report", "reportedly", "rumor", "rumour", "sources", "source",
  "according to", "insider",
  // Media / events
  "trailer", "gameplay", "screenshot", "footage", "dlc", "expansion",
  "showcase", "direct", "state of play", "event",
  // Status updates
  "update", "patch", "hotfix", "release", "releases", "releasing",
  "launches", "launch", "launching", "coming", "arrives", "out now",
  "free", "available", "discount", "sale",
  // Context qualifiers
  "sequel", "remake", "remaster", "prequel", "spin-off", "spinoff",
  "new", "next", "first", "exclusive", "cancelled", "delayed",
  "review", "preview", "hands-on",
  // Attributed speech
  "says", "said", "explains", "explains", "hints", "teases", "claims",
  "denies", "responds", "addresses",
  // Specifics
  "date", "price", "details", "sales", "copies", "million",
  "characters", "support", "crossplay", "cross-play",
];

function hasMeaningfulNewsSignal(title: string): boolean {
  const lower = title.toLowerCase();
  return NEWS_SIGNAL_WORDS.some(w => lower.includes(w));
}

function isNonGamingItem(title: string, categories: string[]): boolean {
  if (NON_GAMING_TITLE_PATTERNS.some(p => p.test(title))) return true;
  const lcCats = categories.map(c => c.toLowerCase());
  const hasGuides = lcCats.includes("guides");
  const hasNonGaming = lcCats.some(c => NON_GAMING_CATEGORIES.has(c));
  // Only filter on category if it's definitively non-gaming (Guides alone isn't enough)
  if (hasGuides && hasNonGaming) return true;
  return false;
}

// ── Image extraction: priority order for RSS items ───────────────────────────
function extractSourceThumbnail(item: Element, descHtml: string): string | null {
  // 1. media:content — most reliable, highest quality
  const mediaContents = item.getElementsByTagNameNS("*", "content");
  for (const mc of Array.from(mediaContents)) {
    const url = mc.getAttribute("url");
    const medium = mc.getAttribute("medium");
    const type = mc.getAttribute("type") || "";
    if (url && url.startsWith("http") && (medium === "image" || type.startsWith("image/"))) {
      return url;
    }
  }

  // 2. media:thumbnail — common in news feeds
  const mediaThumbnails = item.getElementsByTagNameNS("*", "thumbnail");
  for (const mt of Array.from(mediaThumbnails)) {
    const url = mt.getAttribute("url");
    const width = parseInt(mt.getAttribute("width") || "0", 10);
    // Accept any size — small thumbnails are still better than RAWG guessing
    if (url && url.startsWith("http") && (width === 0 || width >= 100)) {
      return url;
    }
  }

  // 3. enclosure (e.g. some WordPress feeds)
  const enclosure = item.querySelector("enclosure");
  const encUrl = enclosure?.getAttribute("url");
  const encType = enclosure?.getAttribute("type") || "";
  if (encUrl && encUrl.startsWith("http") && (encType.startsWith("image/") || encUrl.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i))) {
    return encUrl;
  }

  // 4. First <img> in content:encoded (IGN uses this)
  const contentEncoded = item.getElementsByTagNameNS("*", "encoded")[0];
  if (contentEncoded) {
    const tempContent = document.createElement("div");
    tempContent.innerHTML = contentEncoded.textContent || "";
    const imgs = Array.from(tempContent.querySelectorAll("img[src]"));
    for (const img of imgs) {
      const src = img.getAttribute("src") || "";
      // Skip tiny icons, tracking pixels, site logos
      const w = parseInt(img.getAttribute("width") || "0", 10);
      const h = parseInt(img.getAttribute("height") || "0", 10);
      if (
        src.startsWith("http") &&
        !src.includes("icon") &&
        !src.includes("logo") &&
        !src.includes("avatar") &&
        !src.includes("tracking") &&
        !src.includes("pixel") &&
        (w === 0 || w >= 200) &&
        (h === 0 || h >= 100)
      ) {
        return src;
      }
    }
  }

  // 5. First <img> in description HTML
  if (descHtml) {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = descHtml;
    const imgs = Array.from(tempDiv.querySelectorAll("img[src]"));
    for (const img of imgs) {
      const src = img.getAttribute("src") || "";
      const w = parseInt(img.getAttribute("width") || "0", 10);
      const h = parseInt(img.getAttribute("height") || "0", 10);
      if (
        src.startsWith("http") &&
        !src.includes("icon") &&
        !src.includes("logo") &&
        !src.includes("avatar") &&
        (w === 0 || w >= 200) &&
        (h === 0 || h >= 100)
      ) {
        return src;
      }
    }
  }

  return null;
}

// ── RSS feed parser (IGN, Insider, VGC) ──────────────────────────────────────
// `serverThumbnails` is an optional URL→image map injected by the server (e.g. Insider og:images)
function parseRSSFeed(
  xmlStr: string,
  source: IntelSource,
  serverThumbnails: Record<string, string> = {},
): IntelItem[] {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlStr, "application/xml");
  const items = Array.from(xml.querySelectorAll("item"));

  const result: IntelItem[] = [];

  for (const item of items) {
    const title = item.querySelector("title")?.textContent?.trim() || "Unknown Title";

    // Extract all categories for this item
    const categories = Array.from(item.querySelectorAll("category"))
      .map(c => c.textContent?.trim() || "");

    // Filter non-gaming content
    if (isNonGamingItem(title, categories)) continue;

    const link = item.querySelector("link")?.textContent?.trim() || "";

    // Block articles from excluded outlets
    if (isBlockedSourceUrl(link)) continue;
    const descRaw = item.querySelector("description")?.textContent || "";

    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = descRaw;
    const description = (tempDiv.textContent || "").substring(0, 300).trim();

    const pubDateStr = item.querySelector("pubDate")?.textContent || new Date().toISOString();

    // Server-injected og:image takes highest priority, then RSS media tags
    const thumbnail = serverThumbnails[link] ?? extractSourceThumbnail(item, descRaw);

    const { tier, plausibility, signals } = analyzeTierAndPlausibility(title, source, description);

    result.push({
      id: hashString(title + source),
      title,
      source,
      url: link,
      thumbnail,
      publishedAt: new Date(pubDateStr),
      score: 0,
      tier,
      plausibility,
      description,
      corroborated: false,
      signals,
    });
  }

  return result;
}

// ── Reddit Atom parser ────────────────────────────────────────────────────────
// `serverThumbnails` maps Reddit thread URL → og:image fetched server-side from the linked article
function parseRedditAtom(
  xmlStr: string,
  source: IntelSource,
  serverThumbnails: Record<string, string> = {},
): IntelItem[] {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlStr, "application/xml");
  const entries = Array.from(xml.querySelectorAll("entry"));

  const result: IntelItem[] = [];

  for (const entry of entries) {
    const title = entry.querySelector("title")?.textContent?.trim() || "Unknown Title";

    if (isNonGamingItem(title, [])) continue;

    const articleUrlEarly =
      Array.from(
        (() => {
          const td = document.createElement("div");
          td.innerHTML = entry.querySelector("content")?.textContent || "";
          return td.querySelectorAll("a[href]");
        })(),
      )
        .find(a => {
          const href = a.getAttribute("href") || "";
          return href.startsWith("http") && !href.includes("reddit.com") && !href.includes("redd.it") && a.textContent?.trim() === "[link]";
        })
        ?.getAttribute("href") ?? null;
    if (articleUrlEarly && isBlockedSourceUrl(articleUrlEarly)) continue;

    const redditThreadUrl =
      entry.querySelector("link")?.getAttribute("href") ||
      entry.querySelector("link")?.textContent ||
      "";
    const content = entry.querySelector("content")?.textContent || "";
    const publishedStr =
      entry.querySelector("updated")?.textContent ||
      entry.querySelector("published")?.textContent ||
      new Date().toISOString();

    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = content;

    // Extract external article URL from the [link] anchor (link posts only)
    // This is the actual news article the Reddit post links to
    const allAnchors = Array.from(tempDiv.querySelectorAll("a[href]"));
    const externalAnchor = allAnchors.find(a => {
      const href = a.getAttribute("href") || "";
      return (
        href.startsWith("http") &&
        !href.includes("reddit.com") &&
        !href.includes("redd.it") &&
        a.textContent?.trim() === "[link]"
      );
    });
    const articleUrl = externalAnchor?.getAttribute("href") || redditThreadUrl;
    const isLinkPost = articleUrl !== redditThreadUrl;

    // Filter vague posts: short titles (≤ 4 words) with no meaningful news signal,
    // regardless of whether they are link posts or self-posts.
    // e.g. "Hogwarts Legacy", "GTA 6", "Halo 3" get dropped; "GTA 6 Leaked" passes.
    const wordCount = title.split(/\s+/).filter(w => w.length > 0).length;
    if (wordCount <= 4 && !hasMeaningfulNewsSignal(title)) continue;

    // Thumbnail priority:
    // 1. Server-injected og:image from the linked article — permanent, high quality
    // 2. media:thumbnail — Reddit's CDN preview (may expire after ~1hr for older posts)
    // 3. First <img> from content HTML that's on Reddit's preview CDN
    let thumbnail: string | null = serverThumbnails[redditThreadUrl] ?? null;

    if (!thumbnail) {
      const mediaThumbnail = entry.getElementsByTagNameNS("*", "thumbnail")[0];
      if (mediaThumbnail) {
        const url = mediaThumbnail.getAttribute("url");
        // Reddit provides "self", "default", "nsfw" as placeholder strings — ignore those
        if (url && url.startsWith("http")) {
          thumbnail = url;
        }
      }
    }

    // Fallback: preview image from content HTML (Reddit CDN only — avoids user memes)
    if (!thumbnail) {
      const imgs = Array.from(tempDiv.querySelectorAll("img[src]"));
      for (const img of imgs) {
        const src = img.getAttribute("src") || "";
        if (
          src.startsWith("http") &&
          (src.includes("external-preview.redd.it") ||
            src.includes("preview.redd.it") ||
            src.includes("i.redd.it"))
        ) {
          thumbnail = src;
          break;
        }
      }
    }

    const description = (tempDiv.textContent || "").substring(0, 300).trim();
    const { tier, plausibility, signals } = analyzeTierAndPlausibility(title, source, description);

    result.push({
      id: hashString(title + source),
      title,
      source,
      url: articleUrl, // Link posts point directly to the source article
      thumbnail,
      publishedAt: new Date(publishedStr),
      score: 0,
      tier,
      plausibility,
      description,
      corroborated: false,
      signals,
    });
  }

  return result;
}

// ── Cross-source corroboration ────────────────────────────────────────────────
function applyCorroboration(items: IntelItem[]): IntelItem[] {
  const titleWords = (title: string) =>
    new Set(
      title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter(w => w.length > 3),
    );

  const wordSets = items.map(item => titleWords(item.title));

  return items.map((item, i) => {
    const setA = wordSets[i];
    if (setA.size === 0) return item;

    const isCorroborated = items.some((other, j) => {
      if (j === i || other.source === item.source) return false;
      const setB = wordSets[j];
      const intersection = [...setA].filter(w => setB.has(w));
      const overlap = intersection.length / Math.max(setA.size, setB.size);
      return overlap >= 0.4;
    });

    if (!isCorroborated) return item;

    const { tier, plausibility, signals } = analyzeTierAndPlausibility(
      item.title, item.source, item.description, true,
    );

    return { ...item, tier, plausibility, signals, corroborated: true };
  });
}

// ── Cache helpers ─────────────────────────────────────────────────────────────
const CACHE_TTL = 15 * 60 * 1000;
const CACHE_VERSION = "v13";

async function fetchWithCache<T>(
  cacheKey: string,
  fetcher: () => Promise<T[]>,
  revive: (item: any) => T,
): Promise<T[]> {
  const versioned = `${cacheKey}_${CACHE_VERSION}`;
  const cached = localStorage.getItem(versioned);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.timestamp < CACHE_TTL) {
        return parsed.data.map(revive);
      }
    } catch {
      // stale / corrupt — fall through
    }
  }

  try {
    const data = await fetcher();
    localStorage.setItem(versioned, JSON.stringify({ timestamp: Date.now(), data }));
    return data;
  } catch (err) {
    console.error(`[leakr] fetch failed for ${cacheKey}:`, err);
    return [];
  }
}

function reviveItem(item: any): IntelItem {
  return {
    ...item,
    publishedAt: new Date(item.publishedAt),
    corroborated: item.corroborated ?? false,
    signals: item.signals ?? [],
  };
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function fetchFeedData(): Promise<IntelItem[]> {
  const sources: Array<{ key: string; fetcher: () => Promise<IntelItem[]> }> = [
    {
      key: "leakr_cache_reddit",
      fetcher: () =>
        fetch("/api/feed/reddit-enriched?limit=25", { cache: "no-store" })
          .then(r => { if (!r.ok) throw new Error("reddit " + r.status); return r.json(); })
          .then(({ xml, thumbnails }: { xml: string; thumbnails: Record<string, string> }) =>
            parseRedditAtom(xml, "reddit", thumbnails),
          ),
    },
    {
      key: "leakr_cache_gamingnews",
      fetcher: () =>
        fetch("/api/feed/gamingnews-enriched?limit=25", { cache: "no-store" })
          .then(r => { if (!r.ok) throw new Error("gamingnews " + r.status); return r.json(); })
          .then(({ xml, thumbnails }: { xml: string; thumbnails: Record<string, string> }) =>
            parseRedditAtom(xml, "gamingnews", thumbnails),
          ),
    },
    {
      key: "leakr_cache_ign",
      fetcher: () =>
        fetch("/api/feed/ign", { cache: "no-store" })
          .then(r => { if (!r.ok) throw new Error("ign " + r.status); return r.text(); })
          .then(xml => parseRSSFeed(xml, "ign")),
    },
    {
      key: "leakr_cache_insider",
      fetcher: () =>
        fetch("/api/feed/insider-enriched")
          .then(r => { if (!r.ok) throw new Error("insider " + r.status); return r.json(); })
          .then(({ xml, thumbnails }: { xml: string; thumbnails: Record<string, string> }) =>
            parseRSSFeed(xml, "insider", thumbnails),
          ),
    },
    {
      key: "leakr_cache_vgc",
      fetcher: () =>
        fetch("/api/feed/vgc")
          .then(r => { if (!r.ok) throw new Error("vgc " + r.status); return r.text(); })
          .then(xml => parseRSSFeed(xml, "vgc")),
    },
  ];

  const results = await Promise.all(
    sources.map(({ key, fetcher }) => fetchWithCache(key, fetcher, reviveItem)),
  );

  const allItems = applyCorroboration(results.flat());
  allItems.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  return allItems;
}
