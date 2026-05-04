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

function textFromHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || "").replace(/\s+/g, " ").trim();
}

const OPINION_PATTERNS: RegExp[] = [
  /^opinion[:\s-]/i,
  /^editorial[:\s-]/i,
  /^review[:\s-]/i,
  /\bopinion\b/i,
  /\beditorial\b/i,
  /\bthinkpiece\b/i,
  /\bhot take\b/i,
  /\bunpopular opinion\b/i,
  /^why\b.{0,80}\b(should|shouldn['’]?t|needs|deserves|matters|fails|failed|works)\b/i,
  /^how\b.{0,40}\b(could|should|might)\b/i,
  /^here['’]?s why\b/i,
  /^let['’]?s talk about\b/i,
  /\b(the )?case for\b/i,
  /\b(the )?case against\b/i,
  /\bcan learn from\b/i,
  /\bcould learn from\b/i,
  /\bdeserves better\b/i,
  /\branked\b/i,
  /\bbest\b.{0,30}\b(games|bosses|characters|weapons|levels|moments)\b/i,
  /\bworst\b.{0,30}\b(games|bosses|characters|weapons|levels|moments)\b/i,
  /\btop\s+\d+\b/i,
];

const NON_GAMING_PATTERNS: RegExp[] = [
  /\bwindows 11\b/i,
  /\bwindows 10\b/i,
  /\bsurface\b/i,
  /\bcopilot\b/i,
  /\bai pc\b/i,
  /\blaptop\b/i,
  /\bphone\b/i,
  /\btablet\b/i,
  /\bprocessor\b/i,
  /\bcpu\b/i,
  /\bgpu driver\b/i,
  /\boffice 365\b/i,
  /\bmicrosoft 365\b/i,
  /\bsecurity update\b/i,
  /\bdeal(s)?\b/i,
  /\bdiscount\b/i,
  /\bprime day\b/i,
  /\bblack friday\b/i,
  /\bcyber monday\b/i,
  /\bmovie review\b/i,
  /\btv show\b/i,
  /\bbox office\b/i,
  /\bwordle\b/i,
  /\bconnections\b/i,
];

const GAMING_SIGNALS: RegExp[] = [
  /\bgaming\b/i,
  /\bgames?\b/i,
  /\bvideo games?\b/i,
  /\bxbox\b/i,
  /\bgame pass\b/i,
  /\bplaystation\b/i,
  /\bps5\b/i,
  /\bnintendo\b/i,
  /\bswitch 2?\b/i,
  /\bsteam\b/i,
  /\bpc gaming\b/i,
  /\btrailer\b/i,
  /\bgameplay\b/i,
  /\brelease date\b/i,
  /\bdlc\b/i,
  /\bpatch\b/i,
  /\bupdate\b/i,
  /\bleak(ed|s)?\b/i,
  /\brumou?r(s)?\b/i,
  /\bdeveloper\b/i,
  /\bstudio\b/i,
];

function shouldKeepItem(source: IntelSource, title: string, description: string): boolean {
  const text = `${title} ${description}`;
  if (OPINION_PATTERNS.some(pattern => pattern.test(text))) return false;

  // WindowsCentral is broad tech coverage, so require a direct gaming/Xbox signal.
  if (source === "windowscentral") {
    return GAMING_SIGNALS.some(pattern => pattern.test(text)) &&
      !NON_GAMING_PATTERNS.some(pattern => pattern.test(text) && !/\bxbox\b|\bgaming\b|\bgame pass\b/i.test(text));
  }

  // Other extra sources are gaming-focused, but still strip obvious non-gaming/deals noise.
  if (NON_GAMING_PATTERNS.some(pattern => pattern.test(text)) && !GAMING_SIGNALS.some(pattern => pattern.test(text))) {
    return false;
  }

  return true;
}

function getText(parent: Element, selector: string): string {
  return parent.querySelector(selector)?.textContent?.trim() || "";
}

function getFirstElementText(parent: Element, selectors: string[]): string {
  for (const selector of selectors) {
    const text = getText(parent, selector);
    if (text) return text;
  }
  return "";
}

function getLink(item: Element): string {
  const rssLink = item.querySelector("link")?.textContent?.trim();
  if (rssLink?.startsWith("http")) return rssLink;

  const atomLink = item.querySelector("link")?.getAttribute("href")?.trim();
  if (atomLink?.startsWith("http")) return atomLink;

  const guid = item.querySelector("guid")?.textContent?.trim();
  if (guid?.startsWith("http")) return guid;

  return "";
}

function getThumbnail(item: Element, link: string, serverThumbnails: Record<string, string>): string | null {
  if (serverThumbnails[link]) return serverThumbnails[link];

  const mediaContent = Array.from(item.getElementsByTagNameNS("*", "content"))
    .find(el => {
      const url = el.getAttribute("url") || "";
      const medium = el.getAttribute("medium") || "";
      const type = el.getAttribute("type") || "";
      return url.startsWith("http") && (medium === "image" || type.startsWith("image/"));
    });
  const mediaContentUrl = mediaContent?.getAttribute("url");
  if (mediaContentUrl) return mediaContentUrl;

  const mediaThumb = Array.from(item.getElementsByTagNameNS("*", "thumbnail"))
    .map(el => el.getAttribute("url") || "")
    .find(url => url.startsWith("http"));
  if (mediaThumb) return mediaThumb;

  const enclosure = item.querySelector("enclosure");
  const enclosureUrl = enclosure?.getAttribute("url") || "";
  const enclosureType = enclosure?.getAttribute("type") || "";
  if (enclosureUrl.startsWith("http") && (enclosureType.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(enclosureUrl))) {
    return enclosureUrl;
  }

  const encoded = Array.from(item.getElementsByTagNameNS("*", "encoded"))[0]?.textContent || "";
  const description = getFirstElementText(item, ["description", "summary", "content"]);
  const html = encoded || description;
  if (html) {
    const div = document.createElement("div");
    div.innerHTML = html;
    const img = Array.from(div.querySelectorAll("img[src]"))
      .map(el => el.getAttribute("src") || "")
      .find(src => src.startsWith("http") && !/logo|icon|avatar|tracking|pixel/i.test(src));
    if (img) return img;
  }

  return null;
}

function parseFeed(xmlStr: string, source: IntelSource, serverThumbnails: Record<string, string>): IntelItem[] {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlStr, "application/xml");
  const nodes = Array.from(xml.querySelectorAll("item, entry"));

  return nodes.slice(0, 30).map(item => {
    const title = getText(item, "title") || "Unknown Title";
    const link = getLink(item);
    const rawDescription = getFirstElementText(item, ["description", "summary", "content"]);
    const description = textFromHtml(rawDescription).slice(0, 300);
    const pubDate = getFirstElementText(item, ["pubDate", "updated", "published"]);
    const thumbnail = getThumbnail(item, link, serverThumbnails);
    const { tier, plausibility, signals } = analyzeTierAndPlausibility(title, source, description, false, true);

    return {
      id: hashString(title + source),
      title,
      source,
      url: link,
      thumbnail,
      publishedAt: pubDate ? new Date(pubDate) : new Date(),
      score: 0,
      tier,
      plausibility,
      description,
      corroborated: false,
      signals,
    };
  }).filter(item =>
    item.url &&
    item.title !== "Unknown Title" &&
    shouldKeepItem(item.source, item.title, item.description),
  ).slice(0, 20);
}

const EXTRA_FEEDS: Array<{ source: IntelSource; endpoint: string }> = [
  { source: "gamerant", endpoint: "/api/feed/gamerant" },
  { source: "windowscentral", endpoint: "/api/feed/windowscentral" },
  { source: "gamespot", endpoint: "/api/feed/gamespot" },
  { source: "mp1st", endpoint: "/api/feed/mp1st" },
];

export async function fetchExtraSourceData(): Promise<IntelItem[]> {
  const results = await Promise.allSettled(
    EXTRA_FEEDS.map(async ({ source, endpoint }) => {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) throw new Error(`${source} feed failed: ${response.status}`);
      const data = await response.json() as { xml: string; thumbnails?: Record<string, string> };
      return parseFeed(data.xml, source, data.thumbnails ?? {});
    }),
  );

  return results.flatMap(result => result.status === "fulfilled" ? result.value : []);
}
