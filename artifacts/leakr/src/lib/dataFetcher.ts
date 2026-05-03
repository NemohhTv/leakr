import { IntelItem } from "../types";
import { analyzeTierAndPlausibility } from "./tierEngine";

// Simple hash function for IDs
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

function parseXMLFeed(xmlStr: string, source: "ign" | "insider"): IntelItem[] {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlStr, "application/xml");
  const items = Array.from(xml.querySelectorAll("item"));

  return items.map(item => {
    const title = item.querySelector("title")?.textContent || "Unknown Title";
    const link = item.querySelector("link")?.textContent || "";
    const descriptionStr = item.querySelector("description")?.textContent || "";
    
    // Strip HTML tags from description
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = descriptionStr;
    const description = tempDiv.textContent || tempDiv.innerText || "";

    const pubDateStr = item.querySelector("pubDate")?.textContent || new Date().toISOString();
    const pubDate = new Date(pubDateStr);

    let thumbnail: string | null = null;
    
    // Try standard enclosure
    const enclosure = item.querySelector("enclosure");
    if (enclosure && enclosure.getAttribute("type")?.startsWith("image/")) {
      thumbnail = enclosure.getAttribute("url");
    }

    // Try media:thumbnail
    if (!thumbnail) {
      const mediaThumbnail = item.getElementsByTagNameNS("*", "thumbnail")[0];
      if (mediaThumbnail) {
        thumbnail = mediaThumbnail.getAttribute("url");
      }
    }
    
    // Try media:content
    if (!thumbnail) {
      const mediaContent = item.getElementsByTagNameNS("*", "content")[0];
      if (mediaContent && mediaContent.getAttribute("medium") === "image") {
        thumbnail = mediaContent.getAttribute("url");
      }
    }

    const { tier, plausibility } = analyzeTierAndPlausibility(title);

    return {
      id: hashString(title + source),
      title,
      source,
      url: link,
      thumbnail,
      publishedAt: pubDate,
      score: 0,
      tier,
      plausibility,
      description: description.substring(0, 200) + (description.length > 200 ? "..." : "")
    };
  });
}

export async function fetchFeedData(): Promise<IntelItem[]> {
  const CACHE_TTL = 15 * 60 * 1000; // 15 mins
  const now = Date.now();
  
  const sources = [
    { key: "reddit", fetcher: fetchReddit },
    { key: "ign", fetcher: () => fetchRSS("/api/feed/ign", "ign") },
    { key: "insider", fetcher: () => fetchRSS("/api/feed/insider", "insider") }
  ];

  const results = await Promise.all(
    sources.map(async ({ key, fetcher }) => {
      const cacheKey = `leakr_cache_${key}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsedCache = JSON.parse(cached);
          if (now - parsedCache.timestamp < CACHE_TTL) {
            // Restore Date objects
            return parsedCache.data.map((item: any) => ({
              ...item,
              publishedAt: new Date(item.publishedAt)
            }));
          }
        } catch (e) {
          console.error("Cache parsing error", e);
        }
      }

      try {
        const data = await fetcher();
        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: now, data }));
        return data;
      } catch (error) {
        console.error(`Failed to fetch ${key}:`, error);
        return [];
      }
    })
  );

  const allItems = results.flat();
  allItems.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  
  return allItems;
}

async function fetchReddit(): Promise<IntelItem[]> {
  const res = await fetch("/api/feed/reddit?limit=25");
  if (!res.ok) throw new Error("Failed to fetch reddit");
  const xmlStr = await res.text();

  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlStr, "application/xml");

  // Reddit RSS uses Atom format
  const entries = Array.from(xml.querySelectorAll("entry"));

  return entries.map(entry => {
    const title = entry.querySelector("title")?.textContent?.trim() || "Unknown Title";
    const link = entry.querySelector("link")?.getAttribute("href") || entry.querySelector("link")?.textContent || "";
    const content = entry.querySelector("content")?.textContent || "";
    const publishedStr = entry.querySelector("updated")?.textContent || entry.querySelector("published")?.textContent || new Date().toISOString();

    // Extract thumbnail from content HTML
    let thumbnail: string | null = null;
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = content;
    const img = tempDiv.querySelector("img[src]");
    if (img) {
      const src = img.getAttribute("src") || "";
      // Skip Reddit's external link thumbnails (small icons), prefer content images
      if (src && !src.includes("external-preview") && src.startsWith("http")) {
        thumbnail = src;
      }
    }

    // Try media:thumbnail in the entry
    const mediaThumbnail = entry.getElementsByTagNameNS("*", "thumbnail")[0];
    if (!thumbnail && mediaThumbnail) {
      thumbnail = mediaThumbnail.getAttribute("url");
    }

    const description = tempDiv.textContent?.substring(0, 200) || "";
    const { tier, plausibility } = analyzeTierAndPlausibility(title);

    return {
      id: hashString(title + "reddit"),
      title,
      source: "reddit" as const,
      url: link,
      thumbnail,
      publishedAt: new Date(publishedStr),
      score: 0,
      tier,
      plausibility,
      description: description.trim()
    };
  });
}

async function fetchRSS(url: string, source: "ign" | "insider"): Promise<IntelItem[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch RSS from ${url}`);
  const xmlStr = await res.text();
  return parseXMLFeed(xmlStr, source);
}
