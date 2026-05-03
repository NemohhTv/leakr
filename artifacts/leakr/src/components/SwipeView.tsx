import { IntelItem } from "@/types";
import { SwipeCard } from "./SwipeCard";
import { useEffect, useRef, useState } from "react";

interface SwipeViewProps {
  items: IntelItem[];
  onOpenDossier: (item: IntelItem) => void;
}

export function SwipeView({ items, onOpenDossier }: SwipeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // Use the container's own height (not window) so we account for the
      // sticky header that sits above this scroll container.
      const slideHeight = container.clientHeight || 1;
      const index = Math.round(container.scrollTop / slideHeight);
      setActiveIndex(index);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  if (items.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-muted-foreground uppercase tracking-widest font-bold">
        No intel found.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-y-scroll snap-y snap-mandatory bg-black scroll-smooth"
    >
      {items.map((item, index) => (
        <SwipeCard 
          key={item.id} 
          item={item} 
          onOpenDossier={onOpenDossier} 
          isActive={index === activeIndex}
        />
      ))}
    </div>
  );
}
