export function analyzeTierAndPlausibility(title: string): { tier: "S" | "A" | "B" | "C" | "F", plausibility: number } {
  const t = title.toLowerCase();
  
  // S-Tier: 85-100
  if (t.includes("confirmed") || t.includes("official") || t.includes("trailer") || t.includes("announcement") || t.includes("reveal")) {
    return { tier: "S", plausibility: Math.floor(Math.random() * (100 - 85 + 1)) + 85 };
  }
  
  // A-Tier: 65-84
  if (t.includes("leak") || t.includes("leaked") || t.includes("datamine") || t.includes("datamined") || t.includes("files found") || t.includes("code found")) {
    return { tier: "A", plausibility: Math.floor(Math.random() * (84 - 65 + 1)) + 65 };
  }
  
  // B-Tier: 40-64
  if (t.includes("rumor") || t.includes("rumour") || t.includes("report") || t.includes("insider") || t.includes("allegedly") || t.includes("sources say")) {
    return { tier: "B", plausibility: Math.floor(Math.random() * (64 - 40 + 1)) + 40 };
  }
  
  // C-Tier: 20-39
  if (t.includes("possible") || t.includes("maybe") || t.includes("could") || t.includes("might") || t.includes("speculation")) {
    return { tier: "C", plausibility: Math.floor(Math.random() * (39 - 20 + 1)) + 20 };
  }
  
  // F-Tier: 1-19
  return { tier: "F", plausibility: Math.floor(Math.random() * (19 - 1 + 1)) + 1 };
}
