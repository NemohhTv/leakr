import { useState, useEffect, useMemo, useCallback } from "react";
import { IntelItem } from "@/types";
import { fetchFeedData } from "@/lib/dataFetcher";
import { Header, ViewMode, SourceFilter, TierFilter } from "@/components/Header";
import { GridView } from "@/components/GridView";
import { SwipeView } from "@/components/SwipeView";
import { DossierModal } from "@/components/DossierModal";
import { Loader2 } from "lucide-react";

function App() {
  const [items, setItems] = useState<IntelItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sourceFilters, setSourceFilters] = useState<Set<SourceFilter>>(() => new Set());
  const [tierFilters, setTierFilters] = useState<Set<TierFilter>>(() => new Set());
  const [selectedItem, setSelectedItem] = useState<IntelItem | null>(null);

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
        const data = await fetchFeedData();
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

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col font-sans selection:bg-primary/30 selection:text-primary">
      <Header
        viewMode={viewMode}
        setViewMode={setViewMode}
        sourceFilters={sourceFilters}
        toggleSourceFilter={toggleSourceFilter}
        clearSourceFilters={clearSourceFilters}
        tierFilters={tierFilters}
        toggleTierFilter={toggleTierFilter}
        clearTierFilters={clearTierFilters}
        reportCount={items.length}
      />

      <main className="flex-grow relative">
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
          <SwipeView items={filteredItems} onOpenDossier={setSelectedItem} />
        )}
      </main>

      {viewMode === "grid" && !isLoading && !error && (
        <footer className="border-t border-white/5 py-8 text-center text-zinc-600 flex flex-col items-center gap-2 bg-black/50">
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
