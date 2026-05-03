import { Router } from "express";

const router = Router();

// ── Reddit: r/GamingLeaksAndRumours ──────────────────────────────────────────
router.get("/feed/reddit", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query["limit"]) || 25, 50);
    const response = await fetch(
      `https://www.reddit.com/r/GamingLeaksAndRumours/top.rss?limit=${limit}&t=day`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Leakr/1.0; +https://leakr.gg)",
          Accept: "application/rss+xml, application/xml, text/xml, */*",
        },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!response.ok) {
      req.log.error({ status: response.status }, "Reddit RSS fetch failed");
      res.status(response.status).json({ error: "Failed to fetch Reddit feed" });
      return;
    }

    const xml = await response.text();
    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Cache-Control", "public, max-age=900");
    res.send(xml);
  } catch (err) {
    req.log.error({ err }, "Reddit feed fetch failed");
    res.status(500).json({ error: "Failed to fetch Reddit feed" });
  }
});

// ── Reddit: r/gamingnews ─────────────────────────────────────────────────────
router.get("/feed/gamingnews", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query["limit"]) || 25, 50);
    const response = await fetch(
      `https://www.reddit.com/r/gamingnews/top.rss?limit=${limit}&t=day`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Leakr/1.0; +https://leakr.gg)",
          Accept: "application/rss+xml, application/xml, text/xml, */*",
        },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!response.ok) {
      req.log.error({ status: response.status }, "r/gamingnews RSS fetch failed");
      res.status(response.status).json({ error: "Failed to fetch gamingnews feed" });
      return;
    }

    const xml = await response.text();
    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Cache-Control", "public, max-age=900");
    res.send(xml);
  } catch (err) {
    req.log.error({ err }, "r/gamingnews feed fetch failed");
    res.status(500).json({ error: "Failed to fetch gamingnews feed" });
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
    .replace(
      /\b(leak(ed)?|rumou?r(ed)?|confirm(ed)?|official(ly)?|reveal(ed)?|trailer|datamine[d]?|report(ed)?|insider|exclusive|breaking|update|patch|dlc|expansion|season\s*\d+|episode\s*\d+|chapter\s*\d+|part\s*\d+|v\d+(\.\d+)*|\d{4}|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|monday|tuesday|wednesday|thursday|friday|saturday|sunday|according|sources|says?|allegedly|reportedly|analyst|suggests?|hints?|teases?|upcoming|new|next|latest|sequel|prequel|remaster|remake|reboot|announcement|announced|releases?|launching|launch|arrives?|coming|featured|could|might|would|should|will|won[''']t|isn[''']t|aren[''']t|hasn[''']t|haven[''']t|didn[''']t|doesn[''']t|can[''']t)\b/gi,
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
    // Single keyword query: 1 match required; multi-word: need at least 2 matches
    const required = queryWords.size >= 2 ? 2 : 1;
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
