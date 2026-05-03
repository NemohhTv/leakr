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
      ref={ref as React.RefObject<HTMLDivElement>}
      className="relative w-full h-full snap-start shrink-0 overflow-hidden bg-black"
    >
      {/* Blurred Background */}
      {imgSrc && !isError && (
        <div
          className="absolute inset-0 opacity-30 scale-110 blur-2xl"
          style={{
            backgroundImage: `url(${imgSrc})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/70 to-black" />

      {/* Centered content column — single flex layout, no absolute positioning,
          so the slide always fits the viewport exactly with no scrollbar.
          justify-center balances the slide on tall fullscreen viewports
          (desktop / web) where top-anchored content would leave a large
          empty band below. The image cap (max-h-[38vh] mobile / 48vh desktop)
          keeps the stack within the viewport on shorter screens. */}
      <div className="relative z-10 h-full w-full flex flex-col items-center justify-center text-center px-5 md:px-8 py-4 md:py-6 gap-2 md:gap-4">

        <motion.div
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: isActive ? 0 : -8, opacity: isActive ? 1 : 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="shrink-0"
        >
          <TierBadge tier={item.tier} size="lg" />
        </motion.div>

        {/* Image — clickable, opens dossier. flex-shrink lets it give up space
            on short viewports so text never overflows. */}
        <motion.button
          type="button"
          onClick={() => onOpenDossier(item)}
          aria-label={`Open dossier for ${item.title}`}
          data-testid={`open-dossier-image-${item.id}`}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: isActive ? 1 : 0.95, opacity: isActive ? 1 : 0.5 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="min-h-0 w-full max-w-[88vw] md:max-w-[60vw] flex items-center justify-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-lg"
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
            <div className="relative shadow-2xl shadow-black/80 rounded-lg overflow-hidden border border-white/10 transition-transform active:scale-[0.98] max-h-full">
              <img
                src={imgSrc}
                alt={item.title}
                onError={onImageError}
                className="block max-w-full max-h-[38vh] md:max-h-[48vh] object-contain"
                loading="lazy"
                draggable={false}
              />
            </div>
          )}
        </motion.button>

        {/* Title + meta + plausibility + button — wrapped together so they
            animate as one group and remain visually adjacent to the image. */}
        <motion.div
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: isActive ? 0 : 12, opacity: isActive ? 1 : 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="w-full max-w-2xl flex flex-col items-center gap-2 md:gap-3 shrink-0"
        >
          <h2 className="text-base sm:text-lg md:text-2xl font-bold text-white leading-tight drop-shadow-lg line-clamp-3">
            {item.title}
          </h2>

          <div className="flex items-center gap-3 md:gap-4 text-xs md:text-sm text-muted-foreground font-medium flex-wrap justify-center">
            <span className="tracking-wider text-white/70 border border-white/20 bg-white/5 px-2 py-0.5 rounded text-[10px] md:text-xs">
              {sourceLabel(item.source)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 md:w-4 md:h-4" />
              {timeAgo(item.publishedAt)}
            </span>
            {item.source === "reddit" && item.score > 0 && (
              <span className="flex items-center gap-1 text-orange-400">
                <ArrowUpRight className="w-3.5 h-3.5 md:w-4 md:h-4" />
                {item.score > 1000 ? (item.score / 1000).toFixed(1) + "k" : item.score}
              </span>
            )}
          </div>

          <div className="w-full max-w-md">
            <PlausibilityBar score={item.plausibility} />
          </div>

          <button
            onClick={() => onOpenDossier(item)}
            className="mt-1 md:mt-2 px-6 md:px-8 py-2.5 md:py-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/50 rounded uppercase tracking-[0.2em] font-bold text-xs md:text-sm transition-all hover:shadow-[0_0_20px_rgba(255,34,34,0.3)] hover:scale-105 active:scale-95"
            data-testid={`open-dossier-${item.id}`}
          >
            Open Dossier
          </button>
        </motion.div>
      </div>

      {/* Scroll Hints (desktop only) */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex-col gap-2 opacity-30 z-30 hidden md:flex">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="w-1.5 h-1.5 rounded-full bg-white" />
        ))}
      </div>
    </div>
  );
}
