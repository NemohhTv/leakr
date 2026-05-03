import { IntelItem } from "@/types";
import { GridCard } from "./GridCard";
import { motion } from "framer-motion";

interface GridViewProps {
  items: IntelItem[];
  onOpenDossier: (item: IntelItem) => void;
}

export function GridView({ items, onOpenDossier }: GridViewProps) {
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-[50vh] text-muted-foreground uppercase tracking-widest font-bold">
        No intel found matching criteria.
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-20">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 max-w-[1600px] mx-auto">
        {items.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: Math.min(i * 0.05, 0.5) }}
          >
            <GridCard item={item} onOpenDossier={onOpenDossier} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
