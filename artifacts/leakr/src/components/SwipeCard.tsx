import { IntelItem } from "@/types";
import { TierBadge } from "./TierBadge";
import { PlausibilityBar } from "./PlausibilityBar";
import { useLazyImage } from "@/lib/imageResolver";
import { timeAgo } from "@/lib/utils";
import { sourceLabel } from "@/lib/sourceLabels";
import { ArrowUpRight, Clock } from "lucide-react";
import { motion } from "framer-motion";

interface SwipeCardProps {
  item: IntelItem;
  onOpenDossier: (item: IntelItem) => void;
  isActive: boolean;
}

export function SwipeCard({ item, onOpenDossier, isActive }: SwipeCardProps) {
  const { imgSrc, isLoading, isError, ref, onImageError } = useLazyImage(item.title, item.thumbnail);

  return (
    <div 
      className="relative w-full h-[100dvh] snap-start shrink-0 flex flex-col items-center justify-center overflow-hidden bg-black"
      ref={ref as React.RefObject<HTMLDivElement>}
    >
      {/* Blurred Background */}
      {imgSrc && !isError && (
        <div 
          className="absolute inset-0 opacity-30 scale-110 blur-2xl"
          style={{ 
            backgroundImage: `url(${imgSrc})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        />
      )}
      <div className="absolute inset-0 bg-black/60" />

      {/* Main Image Area — clickable on all screens (mobile users can tap the image
          to open the dossier without scrolling to the button). */}
      <motion.button
        type="button"
        onClick={() => onOpenDossier(item)}
        aria-label={`Open dossier for ${item.title}`}
        data-testid={`open-dossier-image-${item.id}`}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: isActive ? 1 : 0.95, opacity: isActive ? 1 : 0.5 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="absolute z-10 left-1/2 -translate-x-1/2 top-[6vh] md:top-[8vh] w-full max-w-[85vw] md:max-w-[60vw] max-h-[50vh] flex items-center justify-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-lg"
      >
        {isLoading ? (
          <div className="w-full aspect-video rounded-lg overflow-hidden border border-white/10 shimmer" />
        ) : isError || !imgSrc ? (
          <div className="relative w-full aspect-video rounded-lg border border-white/10 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-800/60 to-black" />
            <div
              className="absolute inset-0 opacity-[0.05]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
              <div className="text-xs font-bold uppercase tracking-[0.3em] mb-1 opacity-40">Signal Lost</div>
              <p className="text-[11px] opacity-50">Visual transmission unavailable.</p>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
          </div>
        ) : (
          <div className="relative shadow-2xl shadow-black/80 rounded-lg overflow-hidden border border-white/10 transition-transform active:scale-[0.98]">
            <img
              src={imgSrc}
              alt={item.title}
              onError={onImageError}
              className="max-w-full max-h-[50vh] object-contain"
              loading="lazy"
              draggable={false}
            />
          </div>
        )}
      </motion.button>

      {/* Bottom Scrim & Content */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black via-black/95 to-transparent pt-24 md:pt-32 pb-6 md:pb-8 px-6 md:px-12 flex flex-col items-center text-center">
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: isActive ? 0 : 20, opacity: isActive ? 1 : 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="w-full max-w-2xl flex flex-col items-center gap-4"
        >
          <TierBadge tier={item.tier} size="lg" className="mb-2" />
          
          <h2 className="text-xl md:text-3xl font-bold text-white leading-tight drop-shadow-lg">
            {item.title}
          </h2>

          <div className="flex items-center gap-4 text-sm text-muted-foreground font-medium mt-2">
            <span className="tracking-wider text-white/70 border border-white/20 bg-white/5 px-2 py-0.5 rounded text-xs">
              {sourceLabel(item.source)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {timeAgo(item.publishedAt)}
            </span>
            {item.source === 'reddit' && item.score > 0 && (
              <span className="flex items-center gap-1 text-orange-400">
                <ArrowUpRight className="w-4 h-4" />
                {item.score > 1000 ? (item.score / 1000).toFixed(1) + 'k' : item.score}
              </span>
            )}
          </div>

          <div className="w-full max-w-md mt-6">
            <PlausibilityBar score={item.plausibility} />
          </div>

          <button
            onClick={() => onOpenDossier(item)}
            className="mt-8 px-8 py-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/50 rounded uppercase tracking-[0.2em] font-bold text-sm transition-all hover:shadow-[0_0_20px_rgba(255,34,34,0.3)] hover:scale-105 active:scale-95"
            data-testid={`open-dossier-${item.id}`}
          >
            Open Dossier
          </button>
        </motion.div>
      </div>

      {/* Scroll Hints */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 opacity-30 z-30 hidden md:flex">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="w-1.5 h-1.5 rounded-full bg-white" />
        ))}
      </div>
    </div>
  );
}
