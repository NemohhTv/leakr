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

// ── Credible outlet detection — boosts plausibility when Reddit posts link here
const CREDIBLE_OUTLET_DOMAINS = [
  "videogameschronicle.com", "vgc.com",
  "ign.com",
  "insider-gaming.com",
  "eurogamer.net",
  "gamesindustry.biz",
  "gamespot.com",
  "gameinformer.com",
  "rockpapershotgun.com",
  "pcgamesn.com",
  "bloomberg.com",
  "reuters.com",
  "wsj.com",
  "ft.com",
  "nytimes.com",
  "thegamer.com",
  "gamesradar.com",
];

export function isCredibleOutletUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return CREDIBLE_OUTLET_DOMAINS.some(d => host === d || host.endsWith("." + d));
  } catch {
    return false;
  }
}

// ── Content guard: filter out non-gaming / guide content ─────────────────────
const NON_GAMING_TITLE_PATTERNS: RegExp[] = [
  // Puzzles / dailies
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
  // Movie / TV
  /Box Office/i,
  /Movie Review/i,
  /TV Show Review/i,
  /Episode Recap/i,
  /Season \d+ Episode/i,
  // Podcast / audio content
  /\bpodcast\b/i,
  /\bepisode \d+\b/i,
  /\bep\.?\s*\d+\b/i,
  // Opinion / editorial pieces (strict — no opinion content allowed)
  /^opinion[:\s—–]/i,
  /^editorial[:\s—–]/i,
  /\bopinion piece\b/i,
  /^(the )?(case for|case against)\b/i,
  /^(here['''`]?s )?why\b/i,
  /^let['''`]?s talk about\b/i,
  // "X could learn (a few/some/important/valuable) lessons from Y" — opinion framing
  /\bcould learn\b.{0,30}\b(from|about)\b/i,
  /\b(has|have) a point\b/i,
  /\bin defen[cs]e of\b/i,
  // "What X can learn from Y" — anchored at start to avoid factual matches like
  // "AI anti-cheat can learn from player reports, study finds".
  /^what\b.{0,40}\b(can|could|should|must|needs? to)\s+learn\b/i,
  // "Lessons from X" / "What X taught us" — retrospectives, not news
  /^lessons (from|of)\b/i,
  /^what\b.{0,30}\btaught\s+(us|me)\b/i,
  // Opinion-style headlines: "Why X needs/should/matters" (modal verbs, not factual statements).
  // Excludes "Why X is delayed" / "Why X was cancelled" — those are factual reporting.
  /^why\b.{0,80}\b(needs|should|shouldn['''`]?t|matters|deserves|fails|failed|works)\b/i,
  /^how\b.{0,40}\b(could|should|might)\b/i,
  /\b(\d+|the|a|an)\s+reasons?\s+(why|to|that)\b/i,
  /\bhot take\b/i,
  /\bunpopular opinion\b/i,
  /\b(deserves|deserved) (better|more|a)\b/i,
  /\bshould['''`]?ve\b/i,
  // "Are X the True Heirs to Y" / "Is X the True Successor to Y" — comparative opinion framing
  /\b(true|real|spiritual|rightful)\s+(heir|heirs|successor|successors|inheritor|inheritors)\s+(to|of)\b/i,
  /^(is|are)\b.{0,80}\b(the\s+)?(true|real|spiritual|rightful)\s+(heir|heirs|successor|successors)\b/i,
  // Best of / list / ranking articles (not news)
  /\btop\s+\d+\b/i,
  /\b\d+\s+(best|worst|greatest)\b/i,
  /\bbest\s+(games?|titles?|moments?|characters?|bosses?|levels?|weapons?|villains?)\b/i,
  /\b(games?|titles?)\s+you\s+(must|should|need to|have to|can['''`]?t miss)\b/i,
  /\bevery\b.{0,40}\branked\b/i,
  /\btier list\b/i,
  /\bgame of the (year|decade|generation)\b/i,
  /\bunderrated games?\b/i,
  /\bhidden gems?\b/i,
  // Deals / commerce articles (not news)
  /\bbest deals?\b/i,
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
  // Trading card games (physical or digital TCGs)
  /\btrading card game\b/i,
  /\b(tcg|ccg)\b/i,
  /\byu-?gi-?oh\b/i,
  /\bmagic[:\s]+the gathering\b/i,
  /\bmtg arena\b/i,
  /\bpok[eé]mon tcg\b/i,
  /\bcard pack(s)?\b.{0,15}\b(reveal|expansion)\b/i,
  // Speedrun / community events (typically not news)
  /\bgames done quick\b/i,
  /\bspeedrun(ning)?\b.{0,20}\b(record|world record)\b/i,
  // 4chan-sourced "leaks" — anonymous, unverifiable. User has asked for zero 4chan
  // content, so any title mention is blocked.
  /\b4chan\b/i,
  // /v/ leak references in titles — `/v/` is non-word so we anchor on whitespace/start
  // instead of \b (which doesn't fire before `/`).
  /(?:^|\s|\()\/v\/(?:\s|$).{0,20}(leak|leaked|rumou?r)/i,
  // Physical LEGO set sales / deals (slip past the LEGO video-game allowlist when the
  // franchise name happens to match, e.g. "LEGO Harry Potter: Hogwarts Castle ... Discounted").
  // Only block on high-confidence merchandise signals (sale/deal language) to avoid
  // blocking legitimate LEGO video-game DLC posts.
  /\blego\b.{0,120}\b(discount(ed)?|on sale|price drop|black friday|cyber monday|prime day|amazon (deal|price)|hogwarts castle|building kit|brick set|minifig(ure)?s?\b)/i,
  /\b(discount(ed)?|on sale|price drop|black friday|cyber monday|prime day|amazon (deal|price))\b.{0,80}\blego\b/i,
];

// 4chan-source detection for Reddit post body text. Many Reddit "leak" posts source
// their material from 4chan (often /v/) which is anonymous and unverifiable.
const FOURCHAN_BODY_PATTERNS: RegExp[] = [
  /\b4chan\b/i,
  /\b(boards|forums?)\.4chan(nel)?\.org\b/i,
  // /v/ in body — anchor on whitespace/parens since `/` defeats \b.
  /(?:^|\s|\(|\[)\/v\/(?:\s|$|\)|\]).{0,40}(leak|rumou?r|insider|source)/i,
  // "anonymous 4chan poster/user" — require 4chan context explicitly to avoid
  // matching generic "anonymous source/leak" wording in legitimate reporting.
  /\banon(ymous)?\s+4chan\s+(poster|user|leak(er)?|source)\b/i,
];

function bodyMentions4chan(bodyText: string): boolean {
  return FOURCHAN_BODY_PATTERNS.some(p => p.test(bodyText));
}

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

// LEGO video game allowlist — only match titles that clearly reference a LEGO video game.
// Keep franchise list tight (specific named games) + require platform/gameplay context for others.
const LEGO_VIDEOGAME_PATTERNS: RegExp[] = [
  // Specific named LEGO video game franchises (no generic terms like "creator" or "builder" alone)
  /\blego\s+(star wars|batman|marvel|harry potter|indiana jones|lord of the rings|hobbit|pirates of the caribbean|jurassic|the lego movie( videogame)?|dimensions|brawls|builder['''s] journey|fortnite|2k drive|horizon adventures|city undercover|island xtreme|rock band|rock raiders|brick tales|dc super-?villains|the incredibles|ninjago|bionicle|drome racers|stunt rally|racers \d|island \d)\b/i,
  // Generic LEGO + explicit video game / platform context (handles new/unlisted titles)
  /\blego\b.{0,40}\b(video ?game|gameplay|trailer|dlc|expansion|update|patch|switch 2?|ps5|ps4|playstation|xbox|steam|steam deck|epic games|game pass|gamepass|early access|release date|launch date|nintendo direct)\b/i,
  /\b(video ?game|gameplay|dlc|game pass|gamepass|launch trailer|gameplay trailer)\b.{0,40}\blego\b/i,
];

function isLegoNonGameContent(title: string): boolean {
  if (!/\blego\b/i.test(title)) return false;
  // Allow only if title clearly references a LEGO video game
  return !LEGO_VIDEOGAME_PATTERNS.some(p => p.test(title));
}

function isNonGamingItem(title: string, categories: string[]): boolean {
  if (NON_GAMING_TITLE_PATTERNS.some(p => p.test(title))) return true;
  if (isLegoNonGameContent(title)) return true;
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

    const fromCredibleOutlet = isCredibleOutletUrl(link);
    const { tier, plausibility, signals } = analyzeTierAndPlausibility(
      title, source, description, false, fromCredibleOutlet,
    );

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

    // Body-level 4chan check: posts that source their "leak" from 4chan are unreliable.
    const earlyContent = entry.querySelector("content")?.textContent || "";
    const earlyDiv = document.createElement("div");
    earlyDiv.innerHTML = earlyContent;
    if (bodyMentions4chan(earlyDiv.textContent || "")) continue;

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
    // 2. media:thumbnail — Reddit's CDN preview (expires after ~1hr — only use for fresh posts)
    // 3. First <img> from content HTML that's on Reddit's preview CDN (also expires)
    let thumbnail: string | null = serverThumbnails[redditThreadUrl] ?? null;

    // Reddit's preview/external-preview CDN URLs are signed and expire ~1hr after the post.
    // For older posts (top of week), these always fail — let the client-side RAWG handle it.
    // If timestamp is invalid (NaN), be permissive and allow CDN URLs.
    const parsedTime = new Date(publishedStr).getTime();
    const ageMs = isNaN(parsedTime) ? 0 : Date.now() - parsedTime;
    const isFreshEnoughForRedditCdn = ageMs < 60 * 60 * 1000; // 1 hour

    if (!thumbnail && isFreshEnoughForRedditCdn) {
      const mediaThumbnail = entry.getElementsByTagNameNS("*", "thumbnail")[0];
      if (mediaThumbnail) {
        const url = mediaThumbnail.getAttribute("url");
        if (url && url.startsWith("http")) {
          thumbnail = url;
        }
      }
    }

    if (!thumbnail && isFreshEnoughForRedditCdn) {
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
    const fromCredibleOutlet = isLinkPost && isCredibleOutletUrl(articleUrl);
    const { tier, plausibility, signals } = analyzeTierAndPlausibility(
      title, source, description, false, fromCredibleOutlet,
    );

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

    const fromCredibleOutlet = isCredibleOutletUrl(item.url);
    const { tier, plausibility, signals } = analyzeTierAndPlausibility(
      item.title, item.source, item.description, true, fromCredibleOutlet,
    );

    return { ...item, tier, plausibility, signals, corroborated: true };
  });
}

// ── Cache helpers ─────────────────────────────────────────────────────────────
const CACHE_TTL = 15 * 60 * 1000;
const CACHE_VERSION = "v20";

async function fetchWithCache<T>(
  cacheKey: string,
  fetcher: () => Promise<T[]>,
  revive: (item: any) => T,
  force = false,
): Promise<T[]> {
  const versioned = `${cacheKey}_${CACHE_VERSION}`;
  if (!force) {
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
  }

  try {
    const data = await fetcher();
    localStorage.setItem(versioned, JSON.stringify({ timestamp: Date.now(), data }));
    return data;
  } catch (err) {
    console.error(`[leakr] fetch failed for ${cacheKey}:`, err);
    if (force) {
      const cached = localStorage.getItem(versioned);
      if (cached) {
        try {
          return JSON.parse(cached).data.map(revive);
        } catch { /* ignore */ }
      }
    }
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
export async function fetchFeedData(force = false): Promise<IntelItem[]> {
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
    sources.map(({ key, fetcher }) => fetchWithCache(key, fetcher, reviveItem, force)),
  );

  const allItems = applyCorroboration(results.flat());
  allItems.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  return allItems;
}
