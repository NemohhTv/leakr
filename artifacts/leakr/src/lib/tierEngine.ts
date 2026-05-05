import { IntelSource } from "../types";

type Tier = "S" | "A" | "B" | "C" | "F";

type ClaimType = "confirmed" | "strong-leak" | "reported-rumor" | "weak-rumor" | "speculation" | "routine" | "low-signal";

const SOURCE_TRUST: Record<IntelSource, number> = {
  vgc: 86,
  insider: 82,
  ign: 76,
  gamespot: 74,
  windowscentral: 72,
  gameranx: 66,
  gamerant: 60,
  mp1st: 64,
  gamingnews: 52,
  reddit: 44,
};

const PREMIUM_SOURCES: IntelSource[] = ["vgc", "insider", "ign", "gamespot", "windowscentral"];
const MID_SOURCES: IntelSource[] = ["gameranx", "gamerant", "mp1st"];

const OFFICIAL_CONFIRMATION = [
  "officially confirmed", "officially announced", "officially revealed",
  "confirmed by", "announced by", "revealed by", "confirmed that",
  "has confirmed", "has announced", "has revealed", "launches today",
  "available now", "out now", "now available", "released today",
  "release date confirmed", "gets release date", "sets release date",
];

const ROUTINE_CONFIRMED = [
  "patch notes", "hotfix", "title update", "game update", "server maintenance",
  "free update", "major update", "dlc released", "expansion released",
  "launch trailer", "gameplay trailer", "story trailer", "overview trailer",
];

const HARD_EVIDENCE = [
  "datamined", "datamine", "files found", "code strings", "source code",
  "achievement list", "trophy list", "rating board", "pegi rated", "esrb rated",
  "classification board", "domain registered", "trademark filed", "patent filed",
  "backend listing", "store listing", "steamdb", "playstation store listing",
  "microsoft store listing", "nintendo eshop listing",
];

const SOURCED_REPORTING = [
  "sources say", "sources close to", "according to sources", "according to a report",
  "according to reports", "reportedly", "said to be", "understood to be",
  "believed to be", "familiar with the matter", "anonymous sources",
  "people familiar", "internal documents", "documents obtained",
];

const RUMOR_LANGUAGE = [
  "rumor", "rumour", "rumored", "rumoured", "allegedly", "apparently",
  "supposedly", "claimed", "claims", "leaker claims", "insider claims",
  "i've heard", "we've heard",
];

const SPECULATION_LANGUAGE = [
  "could be", "might be", "may be", "possibly", "perhaps", "seems like",
  "appears to", "fan theory", "speculation", "wishlist", "hope to see",
  "would make sense", "expected to", "likely to", "maybe",
];

const WEAK_LANGUAGE = [
  "unverified", "unconfirmed", "take with a grain", "grain of salt",
  "unclear", "unknown", "no confirmation", "not confirmed", "may not",
  "could still", "subject to change",
];

const OFFICIAL_STATEMENT = [
  "explains", "clarifies", "responds to", "comments on", "talks about",
  "addressed", "spoke about", "spoke on", "statement", "interview",
  "shared details", "revealed details", "confirmed details",
];

const DEV_ROLE = [
  "creative director", "game director", "director", "producer", "lead designer",
  "studio head", "head of", "ceo", "president", "developer", "designer",
  "narrative director", "art director", "technical director",
];

const PLATFORM_SIGNALS = [
  "ps5", "playstation 5", "playstation", "xbox series", "series x", "series s",
  "xbox", "nintendo switch", "switch 2", "switch", "pc", "steam",
  "epic games store", "game pass", "ps plus", "mobile", "ios", "android",
];

const NAMED_SOURCES = [
  "jason schreier", "tom henderson", "jeff grubb", "jez corden", "nate the hate",
  "nick baker", "shpeshal nick", "billbil-kun", "dusk golem", "midori",
  "bloomberg", "reuters", "gamesindustry", "the game awards", "summer game fest",
  "take-two", "take two", "strauss zelnick", "rockstar", "cd projekt", "capcom",
];

const LOW_SIGNAL = [
  "teases", "hints", "suggests", "fans think", "players think", "could tease",
  "may hint", "cryptic", "subtle hint", "job listing suggests",
];

function includesAny(text: string, phrases: string[]): boolean {
  return phrases.some(phrase => text.includes(phrase));
}

function countMatches(text: string, phrases: string[]): number {
  return phrases.filter(phrase => text.includes(phrase)).length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function classifyClaim(text: string): ClaimType {
  const official = includesAny(text, OFFICIAL_CONFIRMATION);
  const routine = includesAny(text, ROUTINE_CONFIRMED);
  const hardEvidence = includesAny(text, HARD_EVIDENCE);
  const sourced = includesAny(text, SOURCED_REPORTING);
  const rumor = includesAny(text, RUMOR_LANGUAGE) || /\bleak(ed|s)?\b/.test(text);
  const speculation = includesAny(text, SPECULATION_LANGUAGE);
  const lowSignal = includesAny(text, LOW_SIGNAL);

  if (official) return "confirmed";
  if (hardEvidence) return "strong-leak";
  if (sourced && rumor) return "reported-rumor";
  if (sourced) return "reported-rumor";
  if (rumor) return "weak-rumor";
  if (routine) return "routine";
  if (speculation) return "speculation";
  if (lowSignal) return "low-signal";
  return "routine";
}

function tierForClaim(claimType: ClaimType, score: number, source: IntelSource): Tier {
  switch (claimType) {
    case "confirmed":
      return score >= 84 ? "S" : "A";
    case "strong-leak":
      return score >= 78 ? "A" : "B";
    case "reported-rumor":
      return score >= 72 ? "B" : "C";
    case "weak-rumor":
      return source === "reddit" ? "C" : score >= 62 ? "B" : "C";
    case "speculation":
      return score >= 58 ? "C" : "F";
    case "low-signal":
      return "F";
    case "routine":
    default:
      return score >= 70 ? "B" : "C";
  }
}

const TIER_RANGES: Record<Tier, [number, number]> = {
  S: [88, 100],
  A: [74, 89],
  B: [56, 76],
  C: [34, 58],
  F: [5, 34],
};

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
  sourcedFromCredibleOutlet = false,
): PlausibilityResult {
  const text = `${title} ${description}`.toLowerCase();
  const signals: string[] = [];
  const sourceTrust = SOURCE_TRUST[source] ?? 50;
  const claimType = classifyClaim(text);

  let score = sourceTrust;

  if (PREMIUM_SOURCES.includes(source)) signals.push("Trusted outlet");
  if (MID_SOURCES.includes(source)) signals.push("Secondary outlet");
  if (source === "reddit" || source === "gamingnews") signals.push("Community sourced");

  switch (claimType) {
    case "confirmed":
      score += 14;
      signals.push("Official or confirmed claim");
      break;
    case "strong-leak":
      score += 10;
      signals.push("Hard evidence leak signal");
      break;
    case "reported-rumor":
      score += 3;
      signals.push("Sourced reporting or rumor");
      break;
    case "weak-rumor":
      score -= source === "reddit" ? 8 : 2;
      signals.push("Unverified rumor language");
      break;
    case "speculation":
      score -= 16;
      signals.push("Speculative language");
      break;
    case "low-signal":
      score -= 22;
      signals.push("Low-signal tease or hint");
      break;
    case "routine":
      score -= 2;
      signals.push("Routine news item");
      break;
  }

  const officialStatement = includesAny(text, OFFICIAL_STATEMENT);
  const devRole = includesAny(text, DEV_ROLE);
  if (officialStatement && devRole) {
    score += 8;
    signals.push("Named developer or executive statement");
  } else if (officialStatement) {
    score += 4;
    signals.push("Attributed statement");
  }

  const namedSource = NAMED_SOURCES.find(name => text.includes(name));
  if (namedSource) {
    score += 7;
    signals.push(`Named source: ${namedSource}`);
  }

  const platformHits = PLATFORM_SIGNALS.filter(signal => text.includes(signal));
  if (platformHits.length > 0) {
    score += Math.min(6, platformHits.length * 2);
    signals.push(`Platform context: ${platformHits.slice(0, 2).join(", ")}`);
  }

  const hardEvidenceCount = countMatches(text, HARD_EVIDENCE);
  if (hardEvidenceCount > 1) {
    score += Math.min(8, hardEvidenceCount * 3);
    signals.push("Multiple evidence signals");
  }

  const weakCount = countMatches(text, WEAK_LANGUAGE);
  if (weakCount > 0) {
    score -= Math.min(14, weakCount * 5);
    signals.push("Uncertainty penalty");
  }

  if (includesAny(text, SPECULATION_LANGUAGE) && claimType !== "speculation") {
    score -= 5;
    signals.push("Speculation penalty");
  }

  if (corroborated) {
    score += 12;
    signals.push("Corroborated by multiple sources");
  }

  if (sourcedFromCredibleOutlet && (source === "reddit" || source === "gamingnews")) {
    score += 10;
    signals.push("Links to credible outlet");
  }

  // Reddit should not score like a verified outlet unless it links credible coverage or has hard evidence.
  if (source === "reddit" && !sourcedFromCredibleOutlet && claimType !== "strong-leak") {
    score -= 8;
    signals.push("Reddit-only claim penalty");
  }

  // Broad outlets can report true stories, but they should not outrank specialist reports without strong confirmation.
  if ((source === "gamerant" || source === "gameranx") && claimType !== "confirmed" && claimType !== "strong-leak") {
    score -= 5;
    signals.push("Broad outlet confidence cap");
  }

  score = clamp(Math.round(score), 5, 100);
  let tier = tierForClaim(claimType, score, source);
  const [min, max] = TIER_RANGES[tier];
  const plausibility = clamp(score, min, max);

  return { tier, plausibility, signals };
}
