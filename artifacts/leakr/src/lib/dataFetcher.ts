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
];

const NON_GAMING_CATEGORIES = new Set([
  "guides", "wordle", "crossword", "puzzle", "hints",
  "movies", "tv", "film", "streaming", "new york times",
]);

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
function parseRedditAtom(xmlStr: string, source: IntelSource): IntelItem[] {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlStr, "application/xml");
  const entries = Array.from(xml.querySelectorAll("entry"));

  const result: IntelItem[] = [];

  for (const entry of entries) {
    const title = entry.querySelector("title")?.textContent?.trim() || "Unknown Title";

    if (isNonGamingItem(title, [])) continue;

    const link =
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

    // For Reddit: only use media:thumbnail (provided by Reddit for image posts).
    // Do NOT extract images from post HTML — those are user-submitted memes, not game art.
    let thumbnail: string | null = null;
    const mediaThumbnail = entry.getElementsByTagNameNS("*", "thumbnail")[0];
    if (mediaThumbnail) {
      const url = mediaThumbnail.getAttribute("url");
      // Reddit provides "self", "default", "nsfw" as placeholder strings — ignore those
      if (url && url.startsWith("http")) {
        thumbnail = url;
      }
    }

    const description = (tempDiv.textContent || "").substring(0, 300).trim();
    const { tier, plausibility, signals } = analyzeTierAndPlausibility(title, source, description);

    result.push({
      id: hashString(title + source),
      title,
      source,
      url: link,
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
const CACHE_VERSION = "v6";

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
        fetch("/api/feed/reddit?limit=25")
          .then(r => { if (!r.ok) throw new Error("reddit " + r.status); return r.text(); })
          .then(xml => parseRedditAtom(xml, "reddit")),
    },
    {
      key: "leakr_cache_gamingnews",
      fetcher: () =>
        fetch("/api/feed/gamingnews?limit=25")
          .then(r => { if (!r.ok) throw new Error("gamingnews " + r.status); return r.text(); })
          .then(xml => parseRedditAtom(xml, "gamingnews")),
    },
    {
      key: "leakr_cache_ign",
      fetcher: () =>
        fetch("/api/feed/ign")
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
