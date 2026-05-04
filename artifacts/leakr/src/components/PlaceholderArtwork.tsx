import { IntelSource } from "@/types";
import { sourceLabel } from "@/lib/sourceLabels";

interface PlaceholderArtworkProps {
  title: string;
  source: IntelSource;
  variant?: "card" | "hero";
}

const SOURCE_PALETTE: Record<IntelSource, { from: string; via: string; accent: string }> = {
  reddit:         { from: "#2a0c0c", via: "#1a0808", accent: "rgba(255, 69, 0, 0.55)" },
  gamingnews:     { from: "#0c1e2a", via: "#08121a", accent: "rgba(64, 156, 255, 0.55)" },
  gamerant:       { from: "#1f152a", via: "#100a1a", accent: "rgba(180, 110, 255, 0.55)" },
  windowscentral: { from: "#0c1b2a", via: "#08101a", accent: "rgba(68, 160, 255, 0.55)" },
  gamespot:       { from: "#2a210c", via: "#1a1408", accent: "rgba(255, 205, 64, 0.55)" },
  mp1st:          { from: "#0c2a24", via: "#081a16", accent: "rgba(64, 230, 205, 0.55)" },
  ign:            { from: "#2a1a0c", via: "#1a0f08", accent: "rgba(255, 165, 64, 0.55)" },
  insider:        { from: "#1a0c2a", via: "#0f081a", accent: "rgba(155, 89, 255, 0.55)" },
  vgc:            { from: "#0c2a1a", via: "#081a0f", accent: "rgba(64, 230, 140, 0.55)" },
  gameranx:       { from: "#2a0c1f", via: "#1a0815", accent: "rgba(255, 79, 184, 0.55)" },
};

function deriveMonogram(title: string): string {
  // Unicode-aware: keep all letters (incl. accented/CJK) and digits; drop punctuation
  // so titles like "Marvel Tōkon: Fighting Souls" yield "MT" instead of being mangled.
  const cleaned = title
    .replace(/^(rumor|leak|leaked|breaking|exclusive|update|news)[:\s-]+/iu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return "??";
  if (words.length === 1) return [...words[0]].slice(0, 2).join("").toLocaleUpperCase();
  // Use spread to grab the first code point (handles surrogate pairs / combining marks).
  const first = [...words[0]][0] ?? "";
  const second = [...words[1]][0] ?? "";
  return (first + second).toLocaleUpperCase();
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function PlaceholderArtwork({ title, source, variant = "card" }: PlaceholderArtworkProps) {
  const palette = SOURCE_PALETTE[source] ?? SOURCE_PALETTE.gamingnews;
  const monogram = deriveMonogram(title);

  const hash = hashString(title);
  // Position the accent radial deterministically per title so every card looks unique.
  const accentX = 20 + (hash % 60);
  const accentY = 20 + ((hash >> 4) % 60);
  // Light rotation on the grid lines for variety.
  const rotation = (hash % 7) - 3;

  const monogramSize = variant === "hero"
    ? "text-[clamp(72px,18vw,180px)]"
    : "text-[clamp(48px,9vw,96px)]";

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Source-tinted base gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, ${palette.from} 0%, ${palette.via} 60%, #000 100%)`,
        }}
      />
      {/* Per-title accent radial */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at ${accentX}% ${accentY}%, ${palette.accent} 0%, transparent 55%)`,
          opacity: 0.55,
        }}
      />
      {/* Subtle scan grid */}
      <div
        className="absolute inset-[-10%] opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.7) 1px, transparent 1px)",
          backgroundSize: variant === "hero" ? "44px 44px" : "28px 28px",
          transform: `rotate(${rotation}deg)`,
        }}
      />
      {/* Monogram — the title's visual signature */}
      <div className="absolute inset-0 flex items-center justify-center select-none pointer-events-none">
        <span
          className={`font-black tracking-tighter text-white/[0.07] ${monogramSize}`}
          style={{ textShadow: "0 0 60px rgba(255,255,255,0.04)" }}
        >
          {monogram}
        </span>
      </div>
      {/* Source watermark — bottom-left, small, branded */}
      <div className="absolute bottom-2 left-3 text-[9px] font-bold tracking-[0.25em] uppercase text-white/30">
        {sourceLabel(source)}
      </div>
      {/* Top scan line accent */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      {/* Bottom scan line accent */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
    </div>
  );
}
