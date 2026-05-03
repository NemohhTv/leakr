import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { X, SlidersHorizontal, ChevronLeft, ChevronRight, Radio } from "lucide-react";
import { IntelItem } from "@/types";
import { SwipeCard } from "./SwipeCard";
import type { SourceFilter, TierFilter } from "./Header";
import { cn } from "@/lib/utils";

interface SwipeViewProps {
  items: IntelItem[];
  onOpenDossier: (item: IntelItem) => void;
  onExitSwipe: () => void;
  sourceFilters: Set<SourceFilter>;
  toggleSourceFilter: (v: SourceFilter) => void;
  clearSourceFilters: () => void;
  tierFilters: Set<TierFilter>;
  toggleTierFilter: (v: TierFilter) => void;
  clearTierFilters: () => void;
}

const SOURCES: { label: string; value: SourceFilter }[] = [
  { label: "r/GamingLeaksAndRumours", value: "reddit" },
  { label: "r/GamingNews", value: "gamingnews" },
  { label: "IGN", value: "ign" },
  { label: "InsiderGaming", value: "insider" },
  { label: "VGC", value: "vgc" },
];
const TIERS: TierFilter[] = ["S", "A", "B", "C", "F"];

// Pan thresholds — keep low enough to feel responsive but high enough to
// avoid accidental triggers from tap-jitter or vertical-scroll micro-motion.
const SWIPE_DIST = 70;
const SWIPE_VELOCITY = 450;

export function SwipeView({
  items, onOpenDossier, onExitSwipe,
  sourceFilters, toggleSourceFilter, clearSourceFilters,
  tierFilters, toggleTierFilter, clearTierFilters,
}: SwipeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showHints, setShowHints] = useState(true);

  // Auto-fade the gesture hints after first few seconds so the slides are
  // 100% chrome-free (per user request).
  useEffect(() => {
    const t = window.setTimeout(() => setShowHints(false), 3500);
    return () => window.clearTimeout(t);
  }, []);

  // Keyboard escape: close drawer first, then exit swipe.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (drawerOpen) setDrawerOpen(false);
        else onExitSwipe();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, onExitSwipe]);

  // Track active slide for the per-card "isActive" animations.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const slideHeight = container.clientHeight || 1;
      setActiveIndex(Math.round(container.scrollTop / slideHeight));
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  const handlePanEnd = (_: PointerEvent, info: PanInfo) => {
    const { offset, velocity } = info;
    // Only treat as a horizontal gesture if X movement clearly dominates Y;
    // this prevents vertical snap-scrolling from being mis-classified.
    const isHorizontal = Math.abs(offset.x) > Math.abs(offset.y) * 1.4;
    if (!isHorizontal) return;
    if (offset.x < -SWIPE_DIST || velocity.x < -SWIPE_VELOCITY) {
      onExitSwipe();
    } else if (offset.x > SWIPE_DIST || velocity.x > SWIPE_VELOCITY) {
      setDrawerOpen(true);
    }
  };

  if (items.length === 0) {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-black text-muted-foreground uppercase tracking-widest font-bold p-6 text-center">
        <div className="flex flex-col items-center gap-4">
          <span>No intel found.</span>
          <button
            onClick={onExitSwipe}
            className="px-4 py-2 border border-zinc-700 rounded text-xs hover:bg-zinc-900"
            data-testid="empty-exit-swipe"
          >
            Exit Swipe Mode
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-30 bg-black overflow-hidden" data-testid="swipe-view">
      {/* Snap-scroll slide container. Pan handler is attached here directly
          so taps on inner buttons are unaffected (taps don't trigger pan),
          and vertical native snap-scroll continues to work. */}
      <motion.div
        ref={containerRef}
        className="absolute inset-0 overflow-y-scroll snap-y snap-mandatory bg-black scroll-smooth"
        onPanEnd={handlePanEnd}
      >
        {items.map((item, index) => (
          <SwipeCard
            key={item.id}
            item={item}
            onOpenDossier={onOpenDossier}
            isActive={index === activeIndex}
          />
        ))}
      </motion.div>

      {/* Brand mark — subtle pulsing-radio + LEAKR wordmark centered at the top
          so users always know which app they're in, even chrome-free. Sits
          between the filter and exit buttons; pointer-events-none so it never
          blocks taps on a slide. */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 pointer-events-none select-none">
        <div className="relative flex items-center justify-center">
          <Radio className="w-3.5 h-3.5 text-primary" />
          <span
            className="absolute inset-0 rounded-full animate-ping opacity-30 bg-primary"
            style={{ animationDuration: "1.8s" }}
          />
        </div>
        <img
          src="/leakr-logo.png"
          alt="LEAKR"
          className="h-5 w-auto object-contain opacity-80"
          draggable={false}
        />
      </div>

      {/* Persistent close (X) button — gives keyboard / mouse users an obvious
          way to exit swipe mode without relying on gestures. Positioned in
          the top-right corner with a subtle backdrop so it remains visible
          over both light (image-heavy) and dark slide regions. */}
      <button
        type="button"
        onClick={onExitSwipe}
        aria-label="Exit swipe mode"
        data-testid="swipe-exit-button"
        className="absolute top-3 right-3 z-40 p-2 rounded-full bg-black/50 hover:bg-black/80 text-zinc-300 hover:text-white border border-white/10 backdrop-blur-sm transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Persistent filters button — mirror of the X on the opposite corner so
          mouse / keyboard users can open the filter drawer without swiping. */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open filters"
        data-testid="swipe-filters-button"
        className="absolute top-3 left-3 z-40 p-2 rounded-full bg-black/50 hover:bg-black/80 text-zinc-300 hover:text-white border border-white/10 backdrop-blur-sm transition-colors"
      >
        <SlidersHorizontal className="w-4 h-4" />
      </button>

      {/* Edge hints — fade out after 3.5s so the view becomes chrome-free.
          pointer-events-none ensures they never block taps on the slide. */}
      <AnimatePresence>
        {showHints && (
          <>
            <motion.div
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 0.55, x: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.6 } }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="absolute left-1 top-1/2 -translate-y-1/2 z-40 pointer-events-none flex flex-col items-center gap-1 text-zinc-300"
            >
              <ChevronRight className="w-5 h-5" />
              <span className="font-mono text-[8px] uppercase tracking-[0.2em] writing-mode-vertical">Filters</span>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 0.55, x: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.6 } }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="absolute right-1 top-1/2 -translate-y-1/2 z-40 pointer-events-none flex flex-col items-center gap-1 text-zinc-300"
            >
              <ChevronLeft className="w-5 h-5" />
              <span className="font-mono text-[8px] uppercase tracking-[0.2em]">Exit</span>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Filter drawer — slides in from the left when user swipes right. */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm"
              onClick={() => setDrawerOpen(false)}
              data-testid="drawer-backdrop"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0.15, right: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.x < -60 || info.velocity.x < -400) setDrawerOpen(false);
              }}
              className="absolute left-0 top-0 bottom-0 z-50 w-[85vw] max-w-sm bg-zinc-950 border-r border-zinc-800 shadow-2xl flex flex-col overflow-y-auto"
              data-testid="filter-drawer"
            >
              <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-950 z-10">
                <div className="flex items-center gap-2 text-zinc-400">
                  <SlidersHorizontal className="w-4 h-4" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.3em] font-bold">Filters</span>
                </div>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-zinc-500 hover:text-white"
                  aria-label="Close filters"
                  data-testid="drawer-close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-5 py-5 flex flex-col gap-6 flex-grow">
                <FilterGroup label="Source">
                  <FilterPill
                    active={sourceFilters.size === 0}
                    onClick={clearSourceFilters}
                    testId="drawer-filter-source-all"
                  >
                    All
                  </FilterPill>
                  {SOURCES.map(s => (
                    <FilterPill
                      key={s.value}
                      active={sourceFilters.has(s.value)}
                      onClick={() => toggleSourceFilter(s.value)}
                      testId={`drawer-filter-source-${s.value}`}
                    >
                      {s.label}
                    </FilterPill>
                  ))}
                </FilterGroup>

                <FilterGroup label="Tier">
                  <FilterPill
                    active={tierFilters.size === 0}
                    onClick={clearTierFilters}
                    testId="drawer-filter-tier-ALL"
                  >
                    All
                  </FilterPill>
                  {TIERS.map(t => (
                    <FilterPill
                      key={t}
                      active={tierFilters.has(t)}
                      onClick={() => toggleTierFilter(t)}
                      testId={`drawer-filter-tier-${t}`}
                    >
                      {t}
                    </FilterPill>
                  ))}
                </FilterGroup>
              </div>

              <div className="px-5 py-4 border-t border-zinc-800 sticky bottom-0 bg-zinc-950">
                <button
                  onClick={() => { setDrawerOpen(false); onExitSwipe(); }}
                  className="w-full px-4 py-2.5 border border-zinc-700 rounded text-xs uppercase tracking-widest font-bold text-zinc-300 hover:bg-zinc-900 transition-colors"
                  data-testid="drawer-exit-swipe"
                >
                  Exit Swipe Mode
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function FilterPill({
  active, onClick, children, testId,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      aria-pressed={active}
      className={cn(
        "px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold rounded-full transition-colors border whitespace-nowrap",
        active
          ? "bg-white text-black border-white"
          : "bg-transparent text-zinc-400 border-zinc-800 hover:border-zinc-600",
      )}
    >
      {children}
    </button>
  );
}
