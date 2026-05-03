import { cn } from "@/lib/utils";

interface PlausibilityBarProps {
  score: number; // 1-100
  className?: string;
}

export function PlausibilityBar({ score, className }: PlausibilityBarProps) {
  // Determine color based on score (green = high, yellow = med, red = low)
  let colorClass = "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]";
  if (score >= 80) {
    colorClass = "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]";
  } else if (score >= 50) {
    colorClass = "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]";
  } else if (score >= 30) {
    colorClass = "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]";
  }

  return (
    <div className={cn("w-full space-y-1.5", className)}>
      <div className="flex justify-between items-center text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
        <span>Plausibility</span>
        <span className="text-foreground">{score}%</span>
      </div>
      <div className="h-1 w-full bg-black/50 rounded-full overflow-hidden border border-white/5 relative">
        <div 
          className={cn("h-full rounded-full transition-all duration-1000 ease-out", colorClass)} 
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
