export interface IntelItem {
  id: string;          // hash of title+source
  title: string;
  source: "reddit" | "ign" | "insider";
  url: string;
  thumbnail: string | null;  // resolved image URL (see image engine below)
  publishedAt: Date;
  score: number;       // reddit upvotes, or 0 for RSS
  tier: "S" | "A" | "B" | "C" | "F";
  plausibility: number; // 1-100
  description: string;
}
