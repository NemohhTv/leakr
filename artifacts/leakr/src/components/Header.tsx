import { LayoutGrid, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { IntelSource } from "@/types";

export type ViewMode = "grid" | "swipe";
export type SourceFilter = "all" | IntelSource;
export type TierFilter = "ALL" | "S" | "A" | "B" | "C" | "F";

interface HeaderProps {
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  sourceFilter: SourceFilter;
  setSourceFilter: (v: SourceFilter) => void;
  tierFilter: TierFilter;
  setTierFilter: (v: TierFilter) => void;
  reportCount: number;
}

export function Header({
  viewMode, setViewMode,
  sourceFilter, setSourceFilter,
  tierFilter, setTierFilter,
  reportCount,
}: HeaderProps) {
  const sources: { label: string; value: SourceFilter }[] = [
    { label: "ALL", value: "all" },
    { label: "r/GamingLeaksAndRumours", value: "reddit" },
    { label: "r/GamingNews", value: "gamingnews" },
    { label: "IGN", value: "ign" },
    { label: "InsiderGaming", value: "insider" },
    { label: "VGC", value: "vgc" },
  ];

  const tiers: TierFilter[] = ["ALL", "S", "A", "B", "C", "F"];

  return (
    <header className="sticky top-0 z-40 w-full bg-black/80 backdrop-blur-md border-b border-white/5 shadow-sm">
      <div className="max-w-[1600px] mx-auto px-4 md:px-6">

        {/* Top Row */}
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <img
              src="/leakr-logo.png"
              alt="LEAKR"
              className="h-9 w-auto object-contain select-none"
              draggable={false}
            />
          </div>

          <div className="hidden md:flex text-[10px] uppercase tracking-widest font-mono text-zinc-500 border border-zinc-800 bg-zinc-950 px-3 py-1 rounded">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              FEED ACTIVE &middot; {reportCount} REPORTS LOADED
            </span>
          </div>

          <div className="flex items-center gap-1 bg-zinc-900/50 p-1 rounded-lg border border-white/5">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-2 rounded transition-colors",
                viewMode === "grid" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-white",
              )}
              data-testid="view-toggle-grid"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("swipe")}
              className={cn(
                "p-2 rounded transition-colors",
                viewMode === "swipe" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-white",
              )}
              data-testid="view-toggle-swipe"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 py-3 border-t border-white/5 overflow-x-auto">

          {/* Sources */}
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold mr-1">Source</span>
            {sources.map(s => (
              <button
                key={s.value}
                onClick={() => setSourceFilter(s.value)}
                data-testid={`filter-source-${s.value}`}
                className={cn(
                  "px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold rounded-full transition-colors border whitespace-nowrap",
                  sourceFilter === s.value
                    ? "bg-white text-black border-white"
                    : "bg-transparent text-zinc-400 border-zinc-800 hover:border-zinc-600",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Tiers */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold mr-1">Tier</span>
            {tiers.map(t => (
              <button
                key={t}
                onClick={() => setTierFilter(t)}
                data-testid={`filter-tier-${t}`}
                className={cn(
                  "px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold rounded-full transition-colors border",
                  tierFilter === t
                    ? "bg-zinc-800 text-white border-zinc-600"
                    : "bg-transparent text-zinc-500 border-transparent hover:bg-zinc-900",
                )}
              >
                {t}
              </button>
            ))}
          </div>

        </div>
      </div>
    </header>
  );
}
