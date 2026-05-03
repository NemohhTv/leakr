import { LayoutGrid, Maximize2, Radio, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { IntelSource } from "@/types";

export type ViewMode = "grid" | "swipe";
export type SourceFilter = IntelSource;
export type TierFilter = "S" | "A" | "B" | "C" | "F";

interface HeaderProps {
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  sourceFilters: Set<SourceFilter>;
  toggleSourceFilter: (v: SourceFilter) => void;
  clearSourceFilters: () => void;
  tierFilters: Set<TierFilter>;
  toggleTierFilter: (v: TierFilter) => void;
  clearTierFilters: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  refreshCooldownSec: number;
}

export function Header({
  viewMode, setViewMode,
  sourceFilters, toggleSourceFilter, clearSourceFilters,
  tierFilters, toggleTierFilter, clearTierFilters,
  onRefresh, isRefreshing, refreshCooldownSec,
}: HeaderProps) {
  const sources: { label: string; value: SourceFilter }[] = [
    { label: "r/GamingLeaksAndRumours", value: "reddit" },
    { label: "r/GamingNews", value: "gamingnews" },
    { label: "IGN", value: "ign" },
    { label: "InsiderGaming", value: "insider" },
    { label: "VGC", value: "vgc" },
    { label: "Gameranx", value: "gameranx" },
  ];

  const tiers: TierFilter[] = ["S", "A", "B", "C", "F"];

  const allSourcesActive = sourceFilters.size === 0;
  const allTiersActive = tierFilters.size === 0;

  return (
    <header className="sticky top-0 z-40 w-full bg-black/80 backdrop-blur-md border-b border-white/5 shadow-sm">
      <div className="max-w-[1600px] mx-auto px-4 md:px-6">

        {/* Top Row */}
        <div className="flex items-center justify-between h-16">
          <button
            type="button"
            onClick={() => { clearSourceFilters(); clearTierFilters(); setViewMode("grid"); }}
            className="flex items-center gap-2 sm:gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded min-w-0"
            aria-label="Reset filters, return to grid view, and show all reports"
            data-testid="logo-reset-filters"
          >
            <div className="relative flex items-center justify-center shrink-0">
              <Radio className="w-4 h-4 sm:w-5 sm:h-5 text-primary transition-transform group-hover:scale-110" />
              <span className="absolute inset-0 rounded-full animate-ping opacity-30 bg-primary" style={{ animationDuration: "1.8s" }} />
            </div>
            <img
              src="/leakr-logo.png"
              alt="LEAKR"
              className="h-6 sm:h-8 w-auto object-contain select-none transition-opacity group-hover:opacity-80 max-w-[140px]"
              draggable={false}
            />
          </button>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing || refreshCooldownSec > 0}
              data-testid="refresh-feed"
              aria-label={
                isRefreshing
                  ? "Refreshing feed"
                  : refreshCooldownSec > 0
                    ? `Refresh available in ${refreshCooldownSec} seconds`
                    : "Refresh feed from latest sources"
              }
              title={
                isRefreshing
                  ? "Refreshing…"
                  : refreshCooldownSec > 0
                    ? `Wait ${refreshCooldownSec}s before refreshing again`
                    : "Pull the latest from all sources"
              }
              className={cn(
                "flex items-center gap-1.5 px-2.5 h-9 rounded-lg border text-[10px] uppercase tracking-widest font-bold font-mono transition-colors",
                isRefreshing || refreshCooldownSec > 0
                  ? "border-zinc-800 bg-zinc-900/40 text-zinc-600 cursor-not-allowed"
                  : "border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:text-white hover:border-zinc-600",
              )}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
              <span className="hidden sm:inline tabular-nums">
                {isRefreshing
                  ? "Pulling…"
                  : refreshCooldownSec > 0
                    ? `${refreshCooldownSec}s`
                    : "Refresh"}
              </span>
            </button>

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
        </div>

        {/* Filter Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 py-3 border-t border-white/5 overflow-x-auto">

          {/* Sources */}
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold mr-1">Source</span>
            <button
              onClick={clearSourceFilters}
              data-testid="filter-source-all"
              aria-pressed={allSourcesActive}
              className={cn(
                "px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold rounded-full transition-colors border whitespace-nowrap",
                allSourcesActive
                  ? "bg-white text-black border-white"
                  : "bg-transparent text-zinc-400 border-zinc-800 hover:border-zinc-600",
              )}
            >
              ALL
            </button>
            {sources.map(s => {
              const active = sourceFilters.has(s.value);
              return (
                <button
                  key={s.value}
                  onClick={() => toggleSourceFilter(s.value)}
                  data-testid={`filter-source-${s.value}`}
                  aria-pressed={active}
                  className={cn(
                    "px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold rounded-full transition-colors border whitespace-nowrap",
                    active
                      ? "bg-white text-black border-white"
                      : "bg-transparent text-zinc-400 border-zinc-800 hover:border-zinc-600",
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* Tiers */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold mr-1">Tier</span>
            <button
              onClick={clearTierFilters}
              data-testid="filter-tier-ALL"
              aria-pressed={allTiersActive}
              className={cn(
                "px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold rounded-full transition-colors border",
                allTiersActive
                  ? "bg-zinc-800 text-white border-zinc-600"
                  : "bg-transparent text-zinc-500 border-transparent hover:bg-zinc-900",
              )}
            >
              ALL
            </button>
            {tiers.map(t => {
              const active = tierFilters.has(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleTierFilter(t)}
                  data-testid={`filter-tier-${t}`}
                  aria-pressed={active}
                  className={cn(
                    "px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold rounded-full transition-colors border",
                    active
                      ? "bg-zinc-800 text-white border-zinc-600"
                      : "bg-transparent text-zinc-500 border-transparent hover:bg-zinc-900",
                  )}
                >
                  {t}
                </button>
              );
            })}
          </div>

        </div>
      </div>
    </header>
  );
}
