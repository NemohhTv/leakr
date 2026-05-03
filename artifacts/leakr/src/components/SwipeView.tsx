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
      const index = Math.round(container.scrollTop / window.innerHeight);
      setActiveIndex(index);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  if (items.length === 0) {
    return (
      <div className="h-[100dvh] w-full flex items-center justify-center text-muted-foreground uppercase tracking-widest font-bold">
        No intel found.
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="h-[100dvh] w-full overflow-y-scroll snap-y snap-mandatory bg-black scroll-smooth"
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
