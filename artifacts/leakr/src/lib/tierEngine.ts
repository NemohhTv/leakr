import { IntelSource } from "../types";

type Tier = "S" | "A" | "B" | "C" | "F";

// Source credibility base scores (0–1)
const SOURCE_CREDIBILITY: Record<IntelSource, number> = {
  vgc: 0.90,       // Video Games Chronicle — dedicated, well-sourced
  insider: 0.85,   // Insider Gaming — specialty outlet
  ign: 0.78,       // IGN — mainstream but credible
  gamingnews: 0.62,// r/gamingnews — aggregated, variable
  reddit: 0.55,    // r/GamingLeaksAndRumours — enthusiast posts
};

// Named journalists / insider sources boost credibility
const NAMED_SOURCES = [
  "jeff grubb", "tom henderson", "jason schreier", "jez corden",
  "mike ybarra", "nick baker", "nate the hate", "shpeshal nick",
  "colin moriarty", "greg miller", "imran khan", "xbox era",
  "bloomberg", "reuters", "kotaku", "eurogamer", "gamespot",
  "gamesindustry", "the game awards", "summer game fest",
];

// Confirmed / official events — these are real, not rumors
const CONFIRMED_PHRASES = [
  "officially confirmed", "officially announced", "officially revealed",
  "confirmed by", "announced by", "revealed by", "live now",
  "available now", "launches today", "out now", "now available",
  "has released", "has launched", "has been released",
];

// Game news / updates that are factual confirmed events
const CONFIRMED_NEWS_KEYWORDS = [
  "update", "patch", "hotfix", "patch notes", "game update",
  "major update", "huge update", "free update", "title update",
  "addresses", "adds new", "introduces", "brings new",
  "dlc released", "expansion released", "now out",
  "developer response", "developers confirm",
  "launches", "release date", "announced",
];

// Verified official statements — an attributed quote/explanation from a named person/company
// These are confirmed facts, not rumors; should yield A-tier when from credible outlets
const OFFICIAL_STATEMENT_KEYWORDS = [
  "explains", "clarifies", "opens up", "speaks out",
  "responds to", "comments on", "talks about", "defends",
  "criticizes", "weighs in", "stance on", "thoughts on",
];

const STRONG_LEAK_PHRASES = [
  "datamined", "datamine", "files found", "code strings",
  "source code", "achievement list", "trophy list", "rating board",
  "pegi rated", "esrb rated", "classification board",
  "domain registered", "trademark filed", "patent filed",
];

const RUMOUR_PHRASES = [
  "sources say", "sources close to", "according to sources",
  "i've heard", "we've heard", "reportedly", "allegedly", "said to be",
  "understood to be", "believed to be", "familiar with the matter",
];

const SPECULATION_PHRASES = [
  "could be", "might be", "possibly", "perhaps", "what if",
  "fan theory", "speculation", "wishlist", "hope to see",
];

// Platform/product specificity signals — more specific = more credible for leaks
const PLATFORM_SIGNALS = [
  "ps5", "playstation 5", "xbox series", "series x", "series s",
  "nintendo switch", "switch 2", "pc", "steam", "epic games store",
  "mobile", "ios", "android",
];

// Linguistic uncertainty markers
const UNCERTAINTY_MARKERS = [
  "apparently", "supposedly", "maybe", "unclear", "unknown",
  "unverified", "unconfirmed", "take with a grain", "grain of salt",
];

function countMatches(text: string, phrases: string[]): number {
  return phrases.filter(p => text.includes(p)).length;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface PlausibilityResult {
  tier: Tier;
  plausibility: number;
  signals: string[];
}

export function analyzeTierAndPlausibility(
  title: string,
  source: IntelSource,
  description = "",
  corroborated = false,
): PlausibilityResult {
  const t = (title + " " + description).toLowerCase();
  const signals: string[] = [];

  // --- BASE: source credibility ---
  let score = SOURCE_CREDIBILITY[source] * 40; // maps 0.55–0.90 → ~22–36 base pts

  // --- TIER DETERMINATION (keyword hierarchy) ---
  let tier: Tier;

  const hasConfirmedPhrase = countMatches(t, CONFIRMED_PHRASES) > 0;
  const hasConfirmedNewsKeyword = countMatches(t, CONFIRMED_NEWS_KEYWORDS) > 0;
  const isOfficialConfirmed =
    hasConfirmedPhrase ||
    t.includes("confirmed") ||
    t.includes("official") ||
    t.includes("trailer") ||
    t.includes("reveal") ||
    t.includes("announcement") ||
    t.includes("release date");

  // Confirmed game updates from credible sources (VGC, Insider, IGN) are S-tier facts
  const isConfirmedFromCredible =
    hasConfirmedNewsKeyword &&
    (source === "vgc" || source === "insider" || source === "ign");

  // Verified official statement — named person/company giving attributed quote or explanation
  // Only from credible outlets; these are factual, not rumors → A-tier
  const isOfficialStatement =
    !isConfirmedFromCredible &&
    !isOfficialConfirmed &&
    countMatches(t, OFFICIAL_STATEMENT_KEYWORDS) > 0 &&
    (source === "vgc" || source === "insider" || source === "ign");

  if (isOfficialConfirmed || isConfirmedFromCredible) {
    tier = "S";
  } else if (
    isOfficialStatement ||
    countMatches(t, STRONG_LEAK_PHRASES) > 0 ||
    t.includes("leaked") ||
    t.includes("leak")
  ) {
    tier = "A";
  } else if (
    countMatches(t, RUMOUR_PHRASES) > 0 ||
    t.includes("rumour") ||
    t.includes("rumor") ||
    t.includes("report") ||
    t.includes("insider")
  ) {
    tier = "B";
  } else if (countMatches(t, SPECULATION_PHRASES) > 0 || t.includes("possible") || t.includes("might") || t.includes("could")) {
    tier = "C";
  } else {
    // Fall-through: neutral gaming news from a credible outlet → B tier
    if (source === "vgc" || source === "insider" || source === "ign") {
      tier = "B";
    } else {
      tier = "F";
    }
  }

  // --- PLAUSIBILITY FACTORS ---

  // 1. Tier base bonus
  const tierBonus: Record<Tier, number> = { S: 50, A: 35, B: 20, C: 8, F: 0 };
  score += tierBonus[tier];

  // 2. Named journalist / reputable source
  const namedMatch = NAMED_SOURCES.find(n => t.includes(n));
  if (namedMatch) {
    score += 18;
    signals.push(`Named source: ${namedMatch}`);
  }

  // 3. Confirmed news bonus (update/patch/release from credible source)
  if (isConfirmedFromCredible) {
    score += 20;
    signals.push("Confirmed gaming news");
  }

  // 3b. Official attributed statement from named person/company via credible outlet
  if (isOfficialStatement) {
    score += 14;
    signals.push("Verified official statement");
  }

  // 4. Strong leak evidence phrases
  const leakPhraseCount = countMatches(t, STRONG_LEAK_PHRASES);
  if (leakPhraseCount > 0) {
    score += leakPhraseCount * 8;
    signals.push("Hard evidence found");
  }

  // 5. Platform specificity — specific claims are more verifiable
  const platformMatches = PLATFORM_SIGNALS.filter(p => t.includes(p));
  if (platformMatches.length > 0) {
    score += Math.min(platformMatches.length * 4, 12);
    signals.push(`Platform mentioned: ${platformMatches.slice(0, 2).join(", ")}`);
  }

  // 6. Confirmed phrase bonus (beyond tier)
  if (hasConfirmedPhrase) {
    score += 15;
    signals.push("Explicit confirmation language");
  }

  // 7. Rumour / source attribution language
  if (countMatches(t, RUMOUR_PHRASES) > 0) {
    score += 6;
    signals.push("Sourced claim");
  }

  // 8. Uncertainty markers — reduces confidence
  const uncertaintyCount = countMatches(t, UNCERTAINTY_MARKERS);
  if (uncertaintyCount > 0) {
    score -= uncertaintyCount * 6;
    signals.push("Uncertainty language detected");
  }

  // 9. Cross-source corroboration — strongest signal
  if (corroborated) {
    score += 22;
    signals.push("Corroborated by multiple outlets");
  }

  // 10. VGC / Insider source premium
  if (source === "vgc") signals.push("VGC premium source");
  if (source === "insider") signals.push("Insider Gaming source");

  // 11. Clamp to tier ranges (soft — don't override strong signals)
  const tierRanges: Record<Tier, [number, number]> = {
    S: [72, 100],
    A: [50, 88],
    B: [28, 70],
    C: [12, 45],
    F: [3, 28],
  };

  const [min, max] = tierRanges[tier];
  // Small deterministic jitter based on title length to avoid all same-tier items looking identical
  const jitter = (title.length % 7) - 3;
  const finalScore = clamp(Math.round(score) + jitter, min, max);

  return { tier, plausibility: finalScore, signals };
}
