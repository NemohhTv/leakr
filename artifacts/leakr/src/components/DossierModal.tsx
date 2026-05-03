import { IntelItem } from "@/types";
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink, ShieldAlert, Zap, Clock } from "lucide-react";
import { TierBadge } from "./TierBadge";
import { timeAgo } from "@/lib/utils";

interface DossierModalProps {
  item: IntelItem | null;
  onClose: () => void;
}

export function DossierModal({ item, onClose }: DossierModalProps) {
  if (!item) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-12 pointer-events-none">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm pointer-events-auto"
          onClick={onClose}
        />

        {/* Modal Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full max-w-3xl bg-zinc-950/90 border border-zinc-800 shadow-[0_0_50px_rgba(0,0,0,0.8)] rounded-xl overflow-hidden flex flex-col pointer-events-auto max-h-full"
          data-testid="dossier-modal"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 md:p-6 border-b border-zinc-800 bg-black/40">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-primary" />
              <span className="font-mono text-xs uppercase tracking-[0.3em] text-zinc-500 font-bold">
                Intel Dossier // {item.id.substring(0, 8)}
              </span>
            </div>
            <button 
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 transition-colors text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="overflow-y-auto p-4 md:p-8 flex-grow custom-scrollbar">
            <div className="flex flex-col md:flex-row gap-6 md:gap-8">
              
              {/* Left Col: Badges & Score */}
              <div className="flex flex-row md:flex-col gap-4 items-center md:items-start shrink-0">
                <TierBadge tier={item.tier} size="lg" />
                
                {/* Plausibility Gauge (Simplified Arc approach) */}
                <div className="mt-2 md:mt-6 flex flex-col items-center">
                  <div className="relative w-24 h-24 flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-zinc-800"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                      />
                      <path
                        className={
                          item.plausibility >= 80 ? "text-emerald-500" :
                          item.plausibility >= 50 ? "text-amber-500" :
                          item.plausibility >= 30 ? "text-orange-500" : "text-red-500"
                        }
                        strokeDasharray={`${item.plausibility}, 100`}
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold font-mono text-white">{item.plausibility}</span>
                      <span className="text-[9px] uppercase tracking-widest text-zinc-500">Score</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Col: Details */}
              <div className="flex flex-col flex-grow gap-6">
                <h1 className="text-2xl md:text-3xl font-bold leading-tight text-white">
                  {item.title}
                </h1>

                <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-zinc-400 border-y border-zinc-800/50 py-4">
                  <div className="flex items-center gap-2">
                    <span className="uppercase tracking-wider text-xs border border-zinc-700 bg-zinc-900 px-2 py-1 rounded">
                      {item.source}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>{new Date(item.publishedAt).toLocaleString()} ({timeAgo(item.publishedAt)})</span>
                  </div>
                  {item.source === 'reddit' && (
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4" />
                      <span>{item.score.toLocaleString()} Upvotes</span>
                    </div>
                  )}
                </div>

                <div className="prose prose-invert max-w-none">
                  <h4 className="text-xs uppercase tracking-widest text-primary mb-2">Transmission Body</h4>
                  <p className="text-zinc-300 leading-relaxed text-sm md:text-base whitespace-pre-wrap">
                    {item.description || "No further details available in this transmission."}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 md:p-6 border-t border-zinc-800 bg-zinc-950 flex justify-end">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-100 text-zinc-950 hover:bg-white font-bold uppercase tracking-wider text-sm rounded transition-colors"
            >
              Read Full Report <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
