import { Router } from "express";

const router = Router();

const imageCache = new Map<string, { value: string | null; ts: number }>();
const IMAGE_CACHE_TTL_MS = 30 * 60 * 1000;

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#32;/g, " ")
    .replace(/&#39;/g, "'");
}

function extractYouTubeVideoId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?[^"'\s]*v=|live\/|embed\/|shorts\/|v\/))([A-Za-z0-9_-]{11})/);
  if (match?.[1]) return match[1];
  if (/youtube\.com/.test(url)) {
    const vMatch = url.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    if (vMatch?.[1]) return vMatch[1];
  }
  return null;
}

function normalizeImageUrl(url: string, baseUrl: string): string | null {
  try {
    let normalized = url.trim();
    if (!normalized) return null;
    if (normalized.startsWith("//")) normalized = "https:" + normalized;
    if (!normalized.startsWith("http")) normalized = new URL(normalized, baseUrl).toString();
    if (!/\.(jpg|jpeg|png|webp|gif)(\?|#|$)/i.test(normalized)) return null;
    if (/avatar|icon|logo|tracking|pixel/i.test(normalized)) return null;
    return normalized;
  } catch {
    return null;
  }
}

async function fetchRedditAtom(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Leakr/1.0; +https://leakr.gg)",
      Accept: "application/atom+xml, application/xml, text/xml, */*",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Reddit fetch failed: ${response.status}`);
  }

  return response.text();
}

async function fetchOgImage(articleUrl: string): Promise<string | null> {
  const ytId = extractYouTubeVideoId(articleUrl);
  if (ytId) return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;

  const directImage = normalizeImageUrl(articleUrl, articleUrl);
  if (directImage) return directImage;

  const cached = imageCache.get(articleUrl);
  if (cached && Date.now() - cached.ts < IMAGE_CACHE_TTL_MS) return cached.value;

  try {
    const response = await fetch(articleUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Leakr/1.0; +https://leakr.gg)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(7000),
    });

    if (!response.ok) {
      imageCache.set(articleUrl, { value: null, ts: Date.now() });
      return null;
    }

    const html = (await response.text()).slice(0, 80_000);
    const match =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ??
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);

    const image = match?.[1] ? normalizeImageUrl(match[1], articleUrl) : null;
    imageCache.set(articleUrl, { value: image, ts: Date.now() });
    return image;
  } catch {
    imageCache.set(articleUrl, { value: null, ts: Date.now() });
    return null;
  }
}

function extractEntries(xml: string): string[] {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(match => match[0]);
}

function mergeAtomEntries(xml1: string, xml2: string): string[] {
  const seen = new Set<string>();
  const all: string[] = [];

  for (const entry of [...extractEntries(xml1), ...extractEntries(xml2)]) {
    const url = entry.match(/<link[^>]+href="([^"]+)"/)?.[1];
    if (url && !seen.has(url)) {
      seen.add(url);
      all.push(entry);
    }
  }

  return all;
}

function buildXmlFromEntries(sourceXml: string, entries: string[]): string {
  const headerEnd = sourceXml.indexOf("<entry>");
  const header = headerEnd >= 0 ? sourceXml.substring(0, headerEnd) : sourceXml.replace("</feed>", "");
  return header + entries.join("\n") + "\n</feed>";
}

function extractBestExternalUrl(entryXml: string): string | null {
  const contentEncoded = entryXml.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] || "";
  const html = decodeHtml(contentEncoded);
  const hrefs = [...html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map(match => match[1]);

  const youtube = hrefs.find(href => extractYouTubeVideoId(href));
  if (youtube) return youtube;

  const directImage = hrefs.find(href => normalizeImageUrl(href, href));
  if (directImage) return directImage;

  const redditPreview = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)]
    .map(match => decodeHtml(match[1]))
    .find(src => normalizeImageUrl(src, src));
  if (redditPreview) return redditPreview;

  const linkedArticle = hrefs.find(href =>
    !/reddit\.com|redd\.it|old\.reddit\.com|np\.reddit\.com/i.test(href) &&
    !/twitter\.com|x\.com|discord\.gg/i.test(href)
  );

  return linkedArticle ?? null;
}

async function buildThumbnails(entries: string[]): Promise<Record<string, string>> {
  const pairs = await Promise.all(entries.map(async entry => {
    const threadUrl = entry.match(/<link[^>]+href="([^"]+)"/)?.[1];
    if (!threadUrl) return null;

    const externalUrl = extractBestExternalUrl(entry);
    if (!externalUrl) return null;

    const image = await fetchOgImage(externalUrl).catch(() => null);
    if (!image) return null;

    return [threadUrl, image] as const;
  }));

  const thumbnails: Record<string, string> = {};
  for (const pair of pairs) {
    if (pair) thumbnails[pair[0]] = pair[1];
  }
  return thumbnails;
}

async function buildCombinedRedditFeed(subreddit: string): Promise<{ xml: string; thumbnails: Record<string, string> }> {
  const [topXml, newXml] = await Promise.all([
    fetchRedditAtom(`https://www.reddit.com/r/${subreddit}/top.rss?limit=10&t=week`),
    fetchRedditAtom(`https://www.reddit.com/r/${subreddit}/new.rss?limit=10`),
  ]);

  const entries = mergeAtomEntries(topXml, newXml);
  const thumbnails = await buildThumbnails(entries);

  return {
    xml: buildXmlFromEntries(topXml, entries),
    thumbnails,
  };
}

router.get("/feed/reddit-enriched", async (req, res) => {
  try {
    const data = await buildCombinedRedditFeed("GamingLeaksAndRumours");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Reddit feed failed");
    res.status(500).json({ error: "Failed to fetch Reddit enriched feed" });
  }
});

router.get("/feed/gamingnews-enriched", async (req, res) => {
  try {
    const data = await buildCombinedRedditFeed("gamingnews");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "GamingNews feed failed");
    res.status(500).json({ error: "Failed to fetch GamingNews enriched feed" });
  }
});

export default router;
