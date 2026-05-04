import { Router } from "express";

const router = Router();

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

function mergeAtomFeeds(xml1: string, xml2: string): string {
  const headerEnd = xml1.indexOf("<entry>");
  const header = headerEnd >= 0 ? xml1.substring(0, headerEnd) : xml1.replace("</feed>", "");
  const extract = (xml: string) => [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => m[0]);
  const seen = new Set<string>();
  const all: string[] = [];

  for (const entry of [...extract(xml1), ...extract(xml2)]) {
    const url = entry.match(/<link[^>]+href="([^"]+)"/)?.[1];
    if (url && !seen.has(url)) {
      seen.add(url);
      all.push(entry);
    }
  }

  return header + all.join("\n") + "\n</feed>";
}

async function buildCombinedRedditFeed(subreddit: string): Promise<{ xml: string; thumbnails: Record<string, string> }> {
  const [topXml, newXml] = await Promise.all([
    fetchRedditAtom(`https://www.reddit.com/r/${subreddit}/top.rss?limit=10&t=week`),
    fetchRedditAtom(`https://www.reddit.com/r/${subreddit}/new.rss?limit=10`),
  ]);

  return {
    xml: mergeAtomFeeds(topXml, newXml),
    thumbnails: {},
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
