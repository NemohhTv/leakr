import { Router } from "express";

const router = Router();

type ExtraFeedKey = "gamerant" | "windowscentral" | "gamespot" | "mp1st";

const FEED_CANDIDATES: Record<ExtraFeedKey, string[]> = {
  gamerant: [
    "https://gamerant.com/gaming/feed/",
    "https://gamerant.com/feed/",
  ],
  windowscentral: [
    "https://www.windowscentral.com/gaming/feed",
    "https://www.windowscentral.com/feed",
    "https://www.windowscentral.com/rss.xml",
  ],
  gamespot: [
    "https://www.gamespot.com/feeds/news/",
    "https://www.gamespot.com/feeds/mashup/",
  ],
  mp1st: [
    "https://mp1st.com/feed/",
  ],
};

const SOURCE_NAMES: Record<ExtraFeedKey, string> = {
  gamerant: "GameRant",
  windowscentral: "WindowsCentral",
  gamespot: "GameSpot",
  mp1st: "MP1st",
};

const ogImageCache = new Map<string, { value: string | null; ts: number }>();
const OG_IMAGE_TTL_MS = 30 * 60 * 1000;

function decodeXmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .trim();
}

function isLikelyImageUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) && /\.(jpg|jpeg|png|webp|gif)(\?|#|$)/i.test(url);
}

function extractRssLinks(xml: string): string[] {
  const links = new Set<string>();
  const itemMatches = [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)];

  for (const item of itemMatches) {
    const itemXml = item[0];
    const link =
      itemXml.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ??
      itemXml.match(/<guid[^>]*>(https?:\/\/[^<\s]+)<\/guid>/i)?.[1] ??
      "";
    const decoded = decodeXmlEntities(link);
    if (decoded.startsWith("http")) links.add(decoded);
  }

  return [...links].slice(0, 25);
}

async function fetchOgImage(articleUrl: string): Promise<string | null> {
  const cached = ogImageCache.get(articleUrl);
  if (cached && Date.now() - cached.ts < OG_IMAGE_TTL_MS) return cached.value;

  try {
    const response = await fetch(articleUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Leakr/1.0; +https://leakr.gg)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(7000),
    });

    if (!response.ok) {
      ogImageCache.set(articleUrl, { value: null, ts: Date.now() });
      return null;
    }

    const html = (await response.text()).slice(0, 80_000);
    const match =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ??
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);

    let image = match?.[1]?.trim() ?? null;
    if (image?.startsWith("//")) image = "https:" + image;
    if (image && !image.startsWith("http")) image = new URL(image, articleUrl).toString();
    if (image && !isLikelyImageUrl(image)) image = null;

    ogImageCache.set(articleUrl, { value: image, ts: Date.now() });
    return image;
  } catch {
    ogImageCache.set(articleUrl, { value: null, ts: Date.now() });
    return null;
  }
}

async function fetchFirstWorkingFeed(feedKey: ExtraFeedKey): Promise<{ xml: string; sourceUrl: string }> {
  const candidates = FEED_CANDIDATES[feedKey];
  let lastError: unknown = null;

  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Leakr/1.0; +https://leakr.gg)",
          Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        },
        signal: AbortSignal.timeout(9000),
      });

      if (!response.ok) {
        lastError = new Error(`${url} returned ${response.status}`);
        continue;
      }

      const xml = await response.text();
      if (!/<(rss|feed|item|entry)\b/i.test(xml)) {
        lastError = new Error(`${url} did not return RSS or Atom XML`);
        continue;
      }

      return { xml, sourceUrl: url };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`No working feed for ${feedKey}`);
}

async function buildEnrichedFeed(feedKey: ExtraFeedKey): Promise<{ xml: string; thumbnails: Record<string, string>; source: string; sourceUrl: string }> {
  const { xml, sourceUrl } = await fetchFirstWorkingFeed(feedKey);
  const links = extractRssLinks(xml);
  const images = await Promise.all(links.map(link => fetchOgImage(link).catch(() => null)));
  const thumbnails: Record<string, string> = {};

  links.forEach((link, index) => {
    const image = images[index];
    if (image) thumbnails[link] = image;
  });

  return {
    xml,
    thumbnails,
    source: SOURCE_NAMES[feedKey],
    sourceUrl,
  };
}

function registerFeedRoute(path: string, feedKey: ExtraFeedKey): void {
  router.get(path, async (req, res) => {
    try {
      const data = await buildEnrichedFeed(feedKey);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "public, max-age=600");
      res.json(data);
    } catch (err) {
      req.log.error({ err, feedKey }, "Extra feed failed");
      res.status(500).json({ error: `Failed to fetch ${SOURCE_NAMES[feedKey]} feed` });
    }
  });
}

registerFeedRoute("/feed/gamerant", "gamerant");
registerFeedRoute("/feed/windowscentral", "windowscentral");
registerFeedRoute("/feed/gamespot", "gamespot");
registerFeedRoute("/feed/mp1st", "mp1st");

export default router;
