import { IntelItem } from "@/types";
import { TierBadge } from "./TierBadge";
import { PlausibilityBar } from "./PlausibilityBar";
import { useLazyImage } from "@/lib/imageResolver";
import { timeAgo } from "@/lib/utils";
import { sourceLabel } from "@/lib/sourceLabels";
import { PlaceholderArtwork } from "./PlaceholderArtwork";
import { ShieldAlert, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface GridCardProps {
  item: IntelItem;
  onOpenDossier: (item: IntelItem) => void;
}

export function GridCard({ item, onOpenDossier }: GridCardProps) {
  const { imgSrc, isLoading, isError, isFromRawg, ref, onImageError } = useLazyImage(item.title, item.thumbnail);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenDossier(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenDossier(item);
        }
      }}
      aria-label={`Open dossier for ${item.title}`}
      className="group relative flex flex-col bg-card border border-card-border overflow-hidden transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_20px_rgba(255,34,34,0.1)] rounded-lg cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      data-testid={`card-${item.id}`}
    >
      {/* Image Area */}
      <div 
        ref={ref as React.RefObject<HTMLDivElement>} 
        className="relative w-full aspect-video bg-muted overflow-hidden"
      >
        {isLoading ? (
          <div className="absolute inset-0 shimmer" />
        ) : isError || !imgSrc ? (
          <PlaceholderArtwork title={item.title} source={item.source} variant="card" />
        ) : (
          <img 
            src={imgSrc} 
            alt={item.title} 
            onError={onImageError}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-80 group-hover:opacity-100"
            loading="lazy"
          />
        )}
        
        {/* Overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />
        
        <div className="absolute top-3 left-3">
          <TierBadge tier={item.tier} size="sm" />
        </div>
        
        <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md px-2 py-1 rounded text-[10px] font-bold tracking-wider text-muted-foreground border border-white/10">
          {sourceLabel(item.source)}
        </div>

        {isFromRawg && (
          <a
            href="https://rawg.io"
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-2 right-2 text-[8px] text-zinc-600 hover:text-zinc-400 transition-colors bg-black/40 px-1.5 py-0.5 rounded"
            onClick={e => e.stopPropagation()}
          >
            via RAWG
          </a>
        )}
      </div>

      {/* Content Area */}
      <div className="flex flex-col flex-grow p-4 gap-4">
        <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">
          {item.title}
        </h3>

        <PlausibilityBar score={item.plausibility} className="mt-auto" />

        <div className="flex items-center justify-between mt-2 pt-3 border-t border-white/5">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              {timeAgo(item.publishedAt)}
            </span>
            {item.source === 'reddit' && item.score > 0 && (
              <span className="flex items-center gap-1 text-orange-400/80">
                <ArrowUpRight className="w-3.5 h-3.5" />
                {item.score > 1000 ? (item.score / 1000).toFixed(1) + 'k' : item.score}
              </span>
            )}
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); onOpenDossier(item); }}
            className="text-xs font-bold text-primary hover:text-white uppercase tracking-wider flex items-center gap-1 transition-colors"
            data-testid={`analyze-report-${item.id}`}
          >
            Analyze
          </button>
        </div>
      </div>
    </div>
  );
}
