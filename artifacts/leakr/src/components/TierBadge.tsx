import { cn } from "@/lib/utils";

interface TierBadgeProps {
  tier: "S" | "A" | "B" | "C" | "F";
  className?: string;
  size?: "sm" | "md" | "lg";
}

const tierMap = {
  "S": { label: "S-TIER", colorClass: "text-amber-400 border-amber-400 bg-amber-400/10", glowClass: "leakr-glow-s" },
  "A": { label: "A-TIER", colorClass: "text-emerald-400 border-emerald-400 bg-emerald-400/10", glowClass: "leakr-glow-a" },
  "B": { label: "B-TIER", colorClass: "text-blue-400 border-blue-400 bg-blue-400/10", glowClass: "leakr-glow-b" },
  "C": { label: "C-TIER", colorClass: "text-purple-400 border-purple-400 bg-purple-400/10", glowClass: "leakr-glow-c" },
  "F": { label: "F-TIER", colorClass: "text-red-400 border-red-400 bg-red-400/10", glowClass: "leakr-glow-f" }
};

export function TierBadge({ tier, className, size = "md" }: TierBadgeProps) {
  const config = tierMap[tier];
  
  const sizeClasses = {
    sm: "px-1.5 py-0.5 text-[10px] tracking-wider",
    md: "px-2 py-0.5 text-xs tracking-widest",
    lg: "px-3 py-1 text-sm tracking-[0.2em]"
  };

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center font-bold border rounded-full backdrop-blur-sm shadow-sm whitespace-nowrap",
        config.colorClass,
        config.glowClass,
        sizeClasses[size],
        className
      )}
    >
      {config.label}
    </div>
  );
}
