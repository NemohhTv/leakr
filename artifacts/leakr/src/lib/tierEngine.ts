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

// High-confidence phrases
const CONFIRMED_PHRASES = [
  "officially confirmed", "officially announced", "officially revealed",
  "confirmed by", "announced by", "revealed by", "live now",
  "available now", "launches today", "out now",
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
  if (
    countMatches(t, CONFIRMED_PHRASES) > 0 ||
    t.includes("confirmed") ||
    t.includes("official") ||
    t.includes("trailer") ||
    t.includes("reveal") ||
    t.includes("announcement") ||
    t.includes("launches") ||
    t.includes("release date")
  ) {
    tier = "S";
  } else if (countMatches(t, STRONG_LEAK_PHRASES) > 0 || t.includes("leaked") || t.includes("leak")) {
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
    tier = "F";
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

  // 3. Strong leak evidence phrases
  const leakPhraseCount = countMatches(t, STRONG_LEAK_PHRASES);
  if (leakPhraseCount > 0) {
    score += leakPhraseCount * 8;
    signals.push("Hard evidence found");
  }

  // 4. Platform specificity — specific claims are more verifiable
  const platformMatches = PLATFORM_SIGNALS.filter(p => t.includes(p));
  if (platformMatches.length > 0) {
    score += Math.min(platformMatches.length * 4, 12);
    signals.push(`Platform mentioned: ${platformMatches.slice(0, 2).join(", ")}`);
  }

  // 5. Confirmed phrase bonus (beyond tier)
  if (countMatches(t, CONFIRMED_PHRASES) > 0) {
    score += 15;
    signals.push("Explicit confirmation language");
  }

  // 6. Rumour / source attribution language
  if (countMatches(t, RUMOUR_PHRASES) > 0) {
    score += 6;
    signals.push("Sourced claim");
  }

  // 7. Uncertainty markers — reduces confidence
  const uncertaintyCount = countMatches(t, UNCERTAINTY_MARKERS);
  if (uncertaintyCount > 0) {
    score -= uncertaintyCount * 6;
    signals.push("Uncertainty language detected");
  }

  // 8. Cross-source corroboration — strongest signal
  if (corroborated) {
    score += 22;
    signals.push("Corroborated by multiple outlets");
  }

  // 9. VGC / Insider source premium
  if (source === "vgc") signals.push("VGC premium source");
  if (source === "insider") signals.push("Insider Gaming source");

  // 10. Clamp to tier ranges (soft — don't override strong signals)
  const tierRanges: Record<Tier, [number, number]> = {
    S: [72, 100],
    A: [50, 88],
    B: [28, 70],
    C: [12, 45],
    F: [3, 28],
  };

  const [min, max] = tierRanges[tier];
  // Use a small deterministic jitter based on title length to avoid all same-tier items looking identical
  const jitter = (title.length % 7) - 3;
  const finalScore = clamp(Math.round(score) + jitter, min, max);

  return { tier, plausibility: finalScore, signals };
}
