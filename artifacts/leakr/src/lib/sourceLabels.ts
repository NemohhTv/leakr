import { IntelSource } from "../types";

export const SOURCE_DISPLAY_LABELS: Record<IntelSource, string> = {
  reddit: "r/GamingLeaksAndRumours",
  gamingnews: "r/GamingNews",
  ign: "IGN",
  insider: "InsiderGaming",
  vgc: "VGC",
  gameranx: "Gameranx",
};

export function sourceLabel(source: IntelSource): string {
  return SOURCE_DISPLAY_LABELS[source];
}
