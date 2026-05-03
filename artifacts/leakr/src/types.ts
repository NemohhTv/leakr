export type IntelSource = "reddit" | "gamingnews" | "ign" | "insider" | "vgc" | "gameranx";

export interface IntelItem {
  id: string;
  title: string;
  source: IntelSource;
  url: string;
  thumbnail: string | null;
  publishedAt: Date;
  score: number;
  tier: "S" | "A" | "B" | "C" | "F";
  plausibility: number;
  description: string;
  corroborated: boolean;
  signals: string[];
}
