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

  return nodes.slice(0, 20).map(item => {
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
  }).filter(item => item.url && item.title !== "Unknown Title");
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
