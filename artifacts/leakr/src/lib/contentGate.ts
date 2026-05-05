import { IntelItem } from "../types";

const GTA_6_BUSINESS_ALLOW_PATTERNS: RegExp[] = [
  /\b(gta\s*6|gta\s*vi|grand theft auto\s*(6|vi))\b.{0,120}\b(strauss\s+zelnick|take[-\s]?two|take[-\s]?two interactive|rockstar|earnings|investor|shareholder|revenue|fiscal|forecast|guidance|delay|release window|launch window|comments?|says?|confirms?|reiterates?)\b/i,
  /\b(strauss\s+zelnick|take[-\s]?two|take[-\s]?two interactive|rockstar|earnings|investor|shareholder|revenue|fiscal|forecast|guidance)\b.{0,120}\b(gta\s*6|gta\s*vi|grand theft auto\s*(6|vi))\b/i,
];

const BLOCKED_PATTERNS: RegExp[] = [
  // Anime, manga, episode recaps, and explainers. These are not gaming news.
  /\banime\b/i,
  /\bmanga\b/i,
  /\bcrunchyroll\b/i,
  /\bepisode\s+\d+\b/i,
  /\bseason\s+\d+\s+episode\s+\d+\b/i,
  /\bseason\s+\d+\b.{0,50}\bepisode\b/i,
  /\bepisode\b.{0,50}\b(delay|delayed|explained|recap|review|preview|release time|release date)\b/i,
  /\b(explained|ending explained|delay explained)\b/i,
  /\brecap\b/i,
  /\bsubbed\b/i,
  /\bdubbed\b/i,

  // Puzzles and daily games
  /\bwordle\b/i,
  /\bconnections\b/i,
  /\bcrossword\b/i,
  /\bstrands\b/i,
  /\bspelling bee\b/i,
  /\bpuzzle\b/i,
  /\bhints?\b.{0,30}\b(today|answer|solution|nyt)\b/i,
  /\banswers?\b.{0,30}\b(today|nyt|wordle|connections|crossword)\b/i,

  // TCG, card games, tabletop, collectibles
  /\bmagic[:\s]+the gathering\b/i,
  /\bmtg\b/i,
  /\btcgs?\b/i,
  /\bccgs?\b/i,
  /\btrading card game\b/i,
  /\bcollectible card game\b/i,
  /\bpok[eé]mon tcg\b/i,
  /\byu-?gi-?oh\b/i,
  /\blorcana\b/i,
  /\bcommander deck\b/i,
  /\bbooster pack\b/i,
  /\bcard pack\b/i,
  /\btabletop\b/i,
  /\bboard game\b/i,
  /\bminiatures?\b/i,

  // Product listings, commerce, hardware shopping, merch, toys
  /\bproduct listings?\b/i,
  /\bpre-?order listings?\b/i,
  /\bamazon listing\b/i,
  /\bbest deals?\b/i,
  /\bdeals?\b.{0,35}\b(today|week|sale|discount|price|amazon|walmart|best buy)\b/i,
  /\bdiscount(ed)?\b/i,
  /\bon sale\b/i,
  /\bprice drop\b/i,
  /\bprime day\b/i,
  /\bblack friday\b/i,
  /\bcyber monday\b/i,
  /\bmerch\b/i,
  /\bmerchandise\b/i,
  /\bstatue\b/i,
  /\bfigure\b/i,
  /\bfigma\b/i,
  /\bplush\b/i,
  /\bfunko\b/i,
  /\blego\b.{0,80}\b(bricks?|set|building kit|minifig|discount|sale|amazon)\b/i,
  /\bcollector'?s edition\b.{0,40}\b(buy|preorder|listing|stock|available|sold out)\b/i,

  // Streaming, film, TV, adaptation entertainment coverage
  /\bstreaming services?\b/i,
  /\bstreaming on\b/i,
  /\bnetflix\b/i,
  /\bhbo\b/i,
  /\bmax\b.{0,20}\b(series|show|streaming)\b/i,
  /\bdisney\+|disney plus\b/i,
  /\bprime video\b/i,
  /\bparamount\+|paramount plus\b/i,
  /\bpeacock\b/i,
  /\bhulu\b/i,
  /\btv show\b/i,
  /\btv series\b/i,
  /\blive[-\s]?action\b/i,
  /\bbox office\b/i,
  /\bmovie review\b/i,
  /\bfilm review\b/i,
  /\b(movie|film|series|show)\b.{0,70}\b(cast|casting|premiere|trailer|teaser|director|streaming|sequel|reboot|adaptation|episode|season)\b/i,
  /\b(cast|casting|premiere|director|streaming)\b.{0,70}\b(movie|film|series|show)\b/i,

  // Opinion, reviews, lists, rankings, guides, explainers
  /^opinion[:\s-]/i,
  /^editorial[:\s-]/i,
  /^review[:\s-]/i,
  /\bopinion\b/i,
  /\beditorial\b/i,
  /\bthinkpiece\b/i,
  /\bhot take\b/i,
  /\bunpopular opinion\b/i,
  /^why\b.{0,90}\b(should|shouldn['’]?t|needs|deserves|matters|fails|failed|works|is still|is the best|is worse|i think|we think)\b/i,
  /^how\b.{0,45}\b(could|should|might|can fix|needs to|to beat|to find|to unlock|get)\b/i,
  /^here['’]?s why\b/i,
  /^let['’]?s talk about\b/i,
  /\b(the )?case for\b/i,
  /\b(the )?case against\b/i,
  /\b(can|could|should) learn from\b/i,
  /\bdeserves better\b/i,
  /\branked\b/i,
  /\branking\b/i,
  /\btier list\b/i,
  /\btop\s+\d+\b/i,
  /\b\d+\s+(best|worst|greatest|things|reasons|ways)\b/i,
  /\bbest\b.{0,55}\b(games|bosses|characters|weapons|levels|moments|rpgs|shooters|mods|builds|settings|deals)\b/i,
  /\bworst\b.{0,55}\b(games|bosses|characters|weapons|levels|moments|rpgs|shooters|mods)\b/i,
  /\bguide\b/i,
  /\bwalkthrough\b/i,
  /\btips and tricks\b/i,
  /\bhow to\b/i,

  // Corporate finance and acquisition news not focused on a game release/leak/update
  /\bacquisition\b/i,
  /\bacquires?\b/i,
  /\bmerger\b/i,
  /\bbuyout\b/i,
  /\bstock price\b/i,
  /\bshareholders?\b/i,
  /\bearnings call\b/i,
  /\bfiscal year\b/i,
  /\brevenue\b/i,
  /\blayoffs?\b/i,
  /\bunion\b/i,

  // Broad tech noise
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
  /\boffice 365\b/i,
  /\bmicrosoft 365\b/i,
  /\bsecurity update\b/i,
];

const ALLOW_PATTERNS: RegExp[] = [
  /\bleak(ed|s)?\b/i,
  /\brumou?r(ed|s)?\b/i,
  /\binsider\b/i,
  /\breport(ed|edly)?\b/i,
  /\bsources?\b/i,
  /\bdatamin(e|ed|ing)\b/i,
  /\brating board\b/i,
  /\besrb\b/i,
  /\bpegi\b/i,
  /\btrademark\b/i,
  /\bpatent\b/i,

  /\bannounc(ed|es|ement)\b/i,
  /\bconfirm(ed|s)?\b/i,
  /\bofficial(ly)?\b/i,
  /\breveal(ed|s)?\b/i,
  /\btrailer\b/i,
  /\bgameplay\b/i,
  /\bfootage\b/i,
  /\bscreenshot(s)?\b/i,
  /\brelease date\b/i,
  /\bdelayed\b/i,
  /\bcancelled|canceled\b/i,
  /\blaunched|launches|launching\b/i,
  /\bout now\b/i,
  /\bavailable now\b/i,

  /\bupdate\b/i,
  /\bpatch\b/i,
  /\bhotfix\b/i,
  /\bdlc\b/i,
  /\bexpansion\b/i,
  /\broadmap\b/i,

  /\bxbox\b/i,
  /\bgame pass\b/i,
  /\bplaystation\b/i,
  /\bps5\b/i,
  /\bnintendo\b/i,
  /\bswitch\s*2?\b/i,
  /\bsteam\b/i,
  /\bpc gaming\b/i,
  /\bvideo games?\b/i,
  /\bgaming\b/i,

  /\bdeveloper(s)?\b/i,
  /\bstudio\b/i,
  /\bpublisher\b/i,
  /\bcreative director\b/i,
  /\bgame director\b/i,
];

const WINDOWS_CENTRAL_GAMING_PATTERNS: RegExp[] = [
  /\bxbox\b/i,
  /\bgame pass\b/i,
  /\bxbox game studios\b/i,
  /\bplayground games\b/i,
  /\bobsidian\b/i,
  /\bbethesda\b/i,
  /\bhalo\b/i,
  /\bforza\b/i,
  /\bfable\b/i,
  /\bgears of war\b/i,
  /\bavowed\b/i,
  /\bstarfield\b/i,
  /\bgaming\b/i,
  /\bpc gaming\b/i,
  /\bgame\b/i,
];

function hasAny(patterns: RegExp[], text: string): boolean {
  return patterns.some(pattern => pattern.test(text));
}

export function shouldKeepAggregatorItem(item: IntelItem): boolean {
  const text = `${item.title} ${item.description}`;
  const isGta6BusinessUpdate = hasAny(GTA_6_BUSINESS_ALLOW_PATTERNS, text);

  if (!isGta6BusinessUpdate && hasAny(BLOCKED_PATTERNS, text)) return false;

  // WindowsCentral is primarily tech, so it needs explicit gaming or Xbox context.
  if (item.source === "windowscentral" && !hasAny(WINDOWS_CENTRAL_GAMING_PATTERNS, text)) {
    return false;
  }

  return isGta6BusinessUpdate || hasAny(ALLOW_PATTERNS, text);
}
