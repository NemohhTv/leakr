import { IntelSource } from "../types";

export const SOURCE_DISPLAY_LABELS: Record<IntelSource, string> = {
  reddit: "r/GamingLeaks",
  gamingnews: "r/GamingNews",
  gamerant: "GameRant",
  windowscentral: "WindowsCentral",
  gamespot: "GameSpot",
  mp1st: "MP1st",
  ign: "IGN",
  insider: "InsiderGaming",
  vgc: "VGC",
  gameranx: "Gameranx",
};

export function sourceLabel(source: IntelSource): string {
  return SOURCE_DISPLAY_LABELS[source];
}
