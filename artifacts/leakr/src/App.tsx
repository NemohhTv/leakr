import { useState, useEffect, useMemo, useCallback } from "react";
import { IntelItem } from "@/types";
import { fetchFeedData } from "@/lib/dataFetcher";
import { Header, ViewMode, SourceFilter, TierFilter } from "@/components/Header";
import { GridView } from "@/components/GridView";
import { SwipeView } from "@/components/SwipeView";
import { DossierModal } from "@/components/DossierModal";
import { Loader2 } from "lucide-react";

const REFRESH_COOLDOWN_MS = 60_000;
const REFRESH_KEY = "leakr_last_manual_refresh";

function App() {
  const [items, setItems] = useState<IntelItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sourceFilters, setSourceFilters] = useState<Set<SourceFilter>>(() => new Set());
  const [tierFilters, setTierFilters] = useState<Set<TierFilter>>(() => new Set());
  const [selectedItem, setSelectedItem] = useState<IntelItem | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshCooldownSec, setRefreshCooldownSec] = useState(0);

  // Tick down cooldown every second; reads persisted timestamp so closing the
  // tab and reopening still respects the rate limit.
  useEffect(() => {
    const tick = () => {
      const last = Number(localStorage.getItem(REFRESH_KEY) ?? 0);
      const remainingMs = last + REFRESH_COOLDOWN_MS - Date.now();
      setRefreshCooldownSec(remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const handleRefresh = useCallback(async () => {
    const last = Number(localStorage.getItem(REFRESH_KEY) ?? 0);
    if (Date.now() - last < REFRESH_COOLDOWN_MS) return;
    if (isRefreshing) return;

    localStorage.setItem(REFRESH_KEY, String(Date.now()));
    setRefreshCooldownSec(Math.ceil(REFRESH_COOLDOWN_MS / 1000));
    setIsRefreshing(true);
    setError(null);
    try {
      const data = await fetchFeedData(true);
      setItems(data);
    } catch (e) {
      console.error(e);
      setError("Failed to refresh intel feeds. Showing previous results.");
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  const toggleSourceFilter = useCallback((v: SourceFilter) => {
    setSourceFilters(prev => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  }, []);
  const clearSourceFilters = useCallback(() => setSourceFilters(new Set()), []);
  const toggleTierFilter = useCallback((v: TierFilter) => {
    setTierFilters(prev => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  }, []);
  const clearTierFilters = useCallback(() => setTierFilters(new Set()), []);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      setError(null);
      try {
        // Always pull live feeds on initial page load so Reddit sources do not
        // disappear until the user manually refreshes.
        const data = await fetchFeedData(true);
        setItems(data);
      } catch (e) {
        console.error(e);
        setError("Failed to establish secure connection to intel feeds.");
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (sourceFilters.size > 0 && !sourceFilters.has(item.source as SourceFilter)) return false;
      if (tierFilters.size > 0 && !tierFilters.has(item.tier as TierFilter)) return false;
      return true;
    });
  }, [items, sourceFilters, tierFilters]);

  // In swipe view we lock the page to the viewport height and disable body
  // scrolling; the SwipeView itself owns the snap-scroll container. In grid
  // view we let the page scroll normally so the footer is reachable.
  const isSwipe = viewMode === "swipe";

  return (
    <div className={
      "bg-background text-foreground flex flex-col font-sans selection:bg-primary/30 selection:text-primary " +
      (isSwipe ? "h-[100dvh] overflow-hidden" : "min-h-[100dvh]")
    }>
      {/* Header is fully hidden in swipe mode — swipe view is a chrome-free
          fullscreen experience with gesture controls. */}
      {!isSwipe && (
        <Header
          viewMode={viewMode}
          setViewMode={setViewMode}
          sourceFilters={sourceFilters}
          toggleSourceFilter={toggleSourceFilter}
          clearSourceFilters={clearSourceFilters}
          tierFilters={tierFilters}
          toggleTierFilter={toggleTierFilter}
          clearTierFilters={clearTierFilters}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          refreshCooldownSec={refreshCooldownSec}
        />
      )}

      <main className="flex-grow relative min-h-0">
        {isLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-primary">
            <Loader2 className="w-8 h-8 animate-spin" />
            <div className="font-mono text-xs uppercase tracking-[0.2em] font-bold">Decrypting Transmissions...</div>
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex items-center justify-center text-red-500">
            <div className="bg-red-500/10 border border-red-500/20 p-6 rounded text-center">
              <div className="font-bold uppercase tracking-widest mb-2">Connection Error</div>
              <div className="text-sm opacity-80">{error}</div>
            </div>
          </div>
        ) : viewMode === "grid" ? (
          <GridView items={filteredItems} onOpenDossier={setSelectedItem} />
        ) : (
          <SwipeView
            items={filteredItems}
            onOpenDossier={setSelectedItem}
            onExitSwipe={() => setViewMode("grid")}
            sourceFilters={sourceFilters}
            toggleSourceFilter={toggleSourceFilter}
            clearSourceFilters={clearSourceFilters}
            tierFilters={tierFilters}
            toggleTierFilter={toggleTierFilter}
            clearTierFilters={clearTierFilters}
          />
        )}
      </main>

      {viewMode === "grid" && !isLoading && !error && (
        <footer className="border-t border-white/5 py-8 text-center text-zinc-600 flex flex-col items-center gap-3 bg-black/50">
          <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500 border border-zinc-800 bg-zinc-950 px-3 py-1 rounded inline-flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            FEED ACTIVE &middot; {items.length} REPORTS LOADED
          </div>
          <p className="text-xs uppercase tracking-widest font-bold text-zinc-500">
            LEAKR.GG &nbsp;|&nbsp; Latest Gaming News &amp; Leaks
          </p>
          <a
            href="https://replit.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Powered by Replit
          </a>
        </footer>
      )}

      <DossierModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </div>
  );
}

export default App;
