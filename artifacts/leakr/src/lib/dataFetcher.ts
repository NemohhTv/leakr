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

function parseRSSFeed(xmlStr: string, source: IntelSource): IntelItem[] {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlStr, "application/xml");
  const items = Array.from(xml.querySelectorAll("item"));

  return items.map(item => {
    const title = item.querySelector("title")?.textContent?.trim() || "Unknown Title";
    const link = item.querySelector("link")?.textContent?.trim() || "";
    const descRaw = item.querySelector("description")?.textContent || "";

    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = descRaw;
    const description = (tempDiv.textContent || "").substring(0, 300);

    const pubDateStr = item.querySelector("pubDate")?.textContent || new Date().toISOString();

    let thumbnail: string | null = null;

    const enclosure = item.querySelector("enclosure");
    if (enclosure?.getAttribute("type")?.startsWith("image/")) {
      thumbnail = enclosure.getAttribute("url");
    }

    if (!thumbnail) {
      const mediaThumbnail = item.getElementsByTagNameNS("*", "thumbnail")[0];
      const width = parseInt(mediaThumbnail?.getAttribute("width") || "0", 10);
      if (mediaThumbnail && (width === 0 || width >= 400)) {
        thumbnail = mediaThumbnail.getAttribute("url");
      }
    }

    if (!thumbnail) {
      const mediaContent = item.getElementsByTagNameNS("*", "content")[0];
      if (mediaContent && mediaContent.getAttribute("medium") === "image") {
        thumbnail = mediaContent.getAttribute("url");
      }
    }

    // Pull first real image out of description HTML
    if (!thumbnail) {
      const img = tempDiv.querySelector("img[src]");
      const src = img?.getAttribute("src") || "";
      if (src.startsWith("http") && !src.includes("icon") && !src.includes("logo") && !src.includes("avatar")) {
        thumbnail = src;
      }
    }

    const { tier, plausibility, signals } = analyzeTierAndPlausibility(title, source, description);

    return {
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
    };
  });
}

function parseRedditAtom(xmlStr: string, source: IntelSource): IntelItem[] {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlStr, "application/xml");
  const entries = Array.from(xml.querySelectorAll("entry"));

  return entries.map(entry => {
    const title = entry.querySelector("title")?.textContent?.trim() || "Unknown Title";
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

    let thumbnail: string | null = null;
    const img = tempDiv.querySelector("img[src]");
    if (img) {
      const src = img.getAttribute("src") || "";
      if (
        src.startsWith("http") &&
        !src.includes("external-preview") &&
        !src.includes("icon") &&
        !src.includes("logo")
      ) {
        thumbnail = src;
      }
    }

    const mediaThumbnail = entry.getElementsByTagNameNS("*", "thumbnail")[0];
    if (!thumbnail && mediaThumbnail) {
      thumbnail = mediaThumbnail.getAttribute("url");
    }

    const description = (tempDiv.textContent || "").substring(0, 300).trim();
    const { tier, plausibility, signals } = analyzeTierAndPlausibility(title, source, description);

    return {
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
    };
  });
}

// Cross-source corroboration: mark items sharing ≥40% word overlap with another source's item
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

    // Recalculate with corroboration flag for boosted plausibility
    const { tier, plausibility, signals } = analyzeTierAndPlausibility(
      item.title,
      item.source,
      item.description,
      true,
    );

    return { ...item, tier, plausibility, signals, corroborated: true };
  });
}

const CACHE_TTL = 15 * 60 * 1000;
const CACHE_VERSION = "v2"; // bump to invalidate stale caches on schema changes

async function fetchWithCache<T>(
  cacheKey: string,
  fetcher: () => Promise<T[]>,
  revive: (item: any) => T,
): Promise<T[]> {
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.timestamp < CACHE_TTL) {
        return parsed.data.map(revive);
      }
    } catch {
      // stale / corrupt cache — fall through
    }
  }

  try {
    const data = await fetcher();
    localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data }));
    return data;
  } catch (err) {
    console.error(`[leakr] fetch failed for ${cacheKey}:`, err);
    return [];
  }
}

function reviveItem(item: any): IntelItem {
  return { ...item, publishedAt: new Date(item.publishedAt) };
}

export async function fetchFeedData(): Promise<IntelItem[]> {
  const sources: Array<{ key: string; fetcher: () => Promise<IntelItem[]> }> = [
    {
      key: `leakr_cache_reddit_${CACHE_VERSION}`,
      fetcher: () =>
        fetch("/api/feed/reddit?limit=25")
          .then(r => { if (!r.ok) throw new Error("reddit " + r.status); return r.text(); })
          .then(xml => parseRedditAtom(xml, "reddit")),
    },
    {
      key: `leakr_cache_gamingnews_${CACHE_VERSION}`,
      fetcher: () =>
        fetch("/api/feed/gamingnews?limit=25")
          .then(r => { if (!r.ok) throw new Error("gamingnews " + r.status); return r.text(); })
          .then(xml => parseRedditAtom(xml, "gamingnews")),
    },
    {
      key: `leakr_cache_ign_${CACHE_VERSION}`,
      fetcher: () =>
        fetch("/api/feed/ign")
          .then(r => { if (!r.ok) throw new Error("ign " + r.status); return r.text(); })
          .then(xml => parseRSSFeed(xml, "ign")),
    },
    {
      key: `leakr_cache_insider_${CACHE_VERSION}`,
      fetcher: () =>
        fetch("/api/feed/insider")
          .then(r => { if (!r.ok) throw new Error("insider " + r.status); return r.text(); })
          .then(xml => parseRSSFeed(xml, "insider")),
    },
    {
      key: `leakr_cache_vgc_${CACHE_VERSION}`,
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
