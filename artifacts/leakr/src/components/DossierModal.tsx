import { IntelItem } from "@/types";
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink, ShieldAlert, Zap, Clock, CheckCircle2, AlertTriangle, Link2 } from "lucide-react";
import { TierBadge } from "./TierBadge";
import { timeAgo } from "@/lib/utils";

interface DossierModalProps {
  item: IntelItem | null;
  onClose: () => void;
}

const SOURCE_DISPLAY: Record<string, string> = {
  reddit: "r/GamingLeaksAndRumours",
  gamingnews: "r/gamingnews",
  ign: "IGN",
  insider: "Insider Gaming",
  vgc: "Video Games Chronicle",
};

const TIER_LABEL: Record<string, string> = {
  S: "Confirmed / Official",
  A: "Hard Evidence",
  B: "Sourced Rumour",
  C: "Speculation",
  F: "Unclassified",
};

export function DossierModal({ item, onClose }: DossierModalProps) {
  if (!item) return null;

  const signals = item.signals ?? [];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-12 pointer-events-none">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="absolute inset-0 bg-black/85 backdrop-blur-sm pointer-events-auto"
          onClick={onClose}
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 24 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          className="relative w-full max-w-3xl bg-zinc-950/95 border border-zinc-800 shadow-[0_0_60px_rgba(0,0,0,0.9)] rounded-xl overflow-hidden flex flex-col pointer-events-auto max-h-[90vh]"
          data-testid="dossier-modal"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-black/50 shrink-0">
            <div className="flex items-center gap-3">
              <Zap className="w-4 h-4 text-primary" />
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-bold">
                Intel Dossier // {item.id.substring(0, 8).toUpperCase()}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-zinc-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-grow">
            <div className="p-5 md:p-8 flex flex-col gap-8">

              {/* Top: tier + gauge + title */}
              <div className="flex flex-col sm:flex-row gap-6">

                {/* Gauge col */}
                <div className="flex flex-row sm:flex-col items-center gap-5 shrink-0">
                  <TierBadge tier={item.tier} size="lg" />

                  <div className="relative w-20 h-20 flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                      <path
                        fill="none" stroke="#27272a" strokeWidth="3"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        fill="none" strokeWidth="3" strokeLinecap="round"
                        stroke={
                          item.plausibility >= 72 ? "#10b981"
                          : item.plausibility >= 50 ? "#f59e0b"
                          : item.plausibility >= 28 ? "#3b82f6"
                          : "#ef4444"
                        }
                        strokeDasharray={`${item.plausibility}, 100`}
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center">
                      <span className="text-xl font-bold font-mono text-white">{item.plausibility}</span>
                      <span className="text-[8px] uppercase tracking-widest text-zinc-600">Score</span>
                    </div>
                  </div>

                  <div className="text-center sm:text-center">
                    <div className="text-[9px] uppercase tracking-widest text-zinc-600">Classification</div>
                    <div className="text-xs font-bold text-zinc-300 mt-0.5">{TIER_LABEL[item.tier]}</div>
                  </div>
                </div>

                {/* Title + meta col */}
                <div className="flex flex-col gap-4 flex-grow min-w-0">
                  <h1 className="text-xl md:text-2xl font-bold leading-tight text-white">
                    {item.title}
                  </h1>

                  <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
                    <span className="flex items-center gap-1.5 border border-zinc-800 bg-zinc-900/60 px-2 py-1 rounded">
                      {SOURCE_DISPLAY[item.source] ?? item.source}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(item.publishedAt).toLocaleString()} &middot; {timeAgo(item.publishedAt)}
                    </span>
                    {item.corroborated && (
                      <span className="flex items-center gap-1.5 text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 rounded">
                        <Link2 className="w-3.5 h-3.5" />
                        Corroborated by multiple outlets
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Analysis signals */}
              {signals.length > 0 && (
                <div className="border border-zinc-800 rounded-lg overflow-hidden">
                  <div className="px-4 py-2 bg-zinc-900/60 border-b border-zinc-800">
                    <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-zinc-500">
                      Plausibility Analysis
                    </span>
                  </div>
                  <div className="px-4 py-3 flex flex-col gap-2">
                    {signals.map((signal, i) => {
                      const isPositive = !signal.toLowerCase().includes("uncertainty");
                      return (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          {isPositive
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                            : <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                          }
                          <span className={isPositive ? "text-zinc-300" : "text-zinc-500"}>{signal}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Description */}
              <div>
                <h4 className="text-[10px] uppercase tracking-[0.25em] font-bold text-primary mb-3">
                  Transmission Body
                </h4>
                <p className="text-zinc-300 leading-relaxed text-sm whitespace-pre-wrap">
                  {item.description || "No further details available in this transmission."}
                </p>
              </div>

              {item.source === "reddit" && item.score > 0 && (
                <div className="flex items-center gap-2 text-xs text-orange-400/80">
                  <ShieldAlert className="w-4 h-4" />
                  <span>{item.score.toLocaleString()} upvotes</span>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-zinc-800 bg-zinc-950 flex justify-end shrink-0">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-zinc-100 text-zinc-950 hover:bg-white font-bold uppercase tracking-wider text-xs rounded transition-colors"
            >
              Read Full Report <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
