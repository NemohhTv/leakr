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
  const { imgSrc, isLoading, isError, ref } = useLazyImage(item.title, item.thumbnail);

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

      {/* Main Image Area */}
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: isActive ? 1 : 0.95, opacity: isActive ? 1 : 0.5 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-full max-w-[80vw] max-h-[50vh] flex items-center justify-center -translate-y-16"
      >
        {isLoading ? (
          <div className="w-full aspect-video rounded-lg overflow-hidden border border-white/10 shimmer" />
        ) : isError || !imgSrc ? (
          <div className="w-full aspect-video rounded-lg border border-white/10 bg-zinc-900/50 flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
             <div className="text-xl font-bold uppercase tracking-widest mb-2 opacity-50">Signal Lost</div>
             <p className="text-sm opacity-70">Visual transmission could not be intercepted.</p>
          </div>
        ) : (
          <div className="relative shadow-2xl shadow-black/80 rounded-lg overflow-hidden border border-white/10">
            <img 
              src={imgSrc} 
              alt={item.title} 
              className="max-w-full max-h-[50vh] object-contain"
              loading="lazy"
            />
          </div>
        )}
      </motion.div>

      {/* Bottom Scrim & Content */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black via-black/90 to-transparent pt-32 pb-8 px-6 md:px-12 flex flex-col items-center text-center">
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
