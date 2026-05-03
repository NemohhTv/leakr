import { Router } from "express";

const router = Router();

// Reddit proxy - parses the RSS feed to avoid API 403 issues
router.get("/feed/reddit", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query["limit"]) || 25, 50);
    // Use RSS feed which is more permissive than the JSON API
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

// RSS feed proxy - IGN Gaming
router.get("/feed/ign", async (req, res) => {
  try {
    const response = await fetch(
      "https://feeds.ign.com/ign/games-all",
      {
        headers: {
          "User-Agent": "Leakr/1.0 News Aggregator",
          Accept: "application/rss+xml, application/xml, text/xml",
        },
        signal: AbortSignal.timeout(8000),
      },
    );

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

// RSS feed proxy - Insider Gaming
router.get("/feed/insider", async (req, res) => {
  try {
    const response = await fetch(
      "https://insider-gaming.com/feed/",
      {
        headers: {
          "User-Agent": "Leakr/1.0 News Aggregator",
          Accept: "application/rss+xml, application/xml, text/xml",
        },
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!response.ok) {
      res.status(response.status).json({ error: "Failed to fetch Insider Gaming feed" });
      return;
    }

    const xml = await response.text();
    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Cache-Control", "public, max-age=900");
    res.send(xml);
  } catch (err) {
    req.log.error({ err }, "Insider Gaming feed fetch failed");
    res.status(500).json({ error: "Failed to fetch Insider Gaming feed" });
  }
});

// RAWG image proxy - keeps the API key server-side
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

  // Scrub noisy gaming-news words before searching
  const scrubbed = rawQuery
    .replace(
      /\b(leak(ed)?|rumou?r(ed)?|confirm(ed)?|official|reveal(ed)?|trailer|datamine[d]?|report(ed)?|insider|exclusive|breaking|update|patch|dlc|expansion|season\s*\d+|episode\s*\d+|chapter\s*\d+|part\s*\d+|v\d+(\.\d+)*|\d{4}|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
      "",
    )
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!scrubbed) {
    res.status(400).json({ error: "Query too noisy to resolve" });
    return;
  }

  try {
    const url = new URL("https://api.rawg.io/api/games");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("search", scrubbed);
    url.searchParams.set("page_size", "1");
    url.searchParams.set("search_exact", "false");

    const response = await fetch(url.toString(), {
      headers: { "User-Agent": "Leakr/1.0" },
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) {
      res.status(response.status).json({ error: "RAWG API error" });
      return;
    }

    const data = (await response.json()) as {
      results?: Array<{ background_image?: string; name?: string; slug?: string }>;
    };

    const game = data.results?.[0];
    if (!game || !game.background_image) {
      res.status(404).json({ error: "No image found" });
      return;
    }

    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json({
      image: game.background_image,
      name: game.name,
      slug: game.slug,
    });
  } catch (err) {
    req.log.error({ err }, "RAWG API request failed");
    res.status(500).json({ error: "RAWG request failed" });
  }
});

export default router;
