import { useEffect, useState, useRef } from 'react';

// Use a global cache to avoid redundant fetches for the same query
const imageCache: Record<string, string> = {};

export function useLazyImage(title: string, initialThumbnail: string | null) {
  const [imgSrc, setImgSrc] = useState<string | null>(initialThumbnail);
  const [isLoading, setIsLoading] = useState(!initialThumbnail);
  const [isError, setIsError] = useState(false);
  const ref = useRef<HTMLDivElement | HTMLImageElement>(null);

  useEffect(() => {
    // If we already have a thumbnail from RSS/Reddit, we don't need RAWG
    if (initialThumbnail) {
      setImgSrc(initialThumbnail);
      setIsLoading(false);
      return;
    }

    if (!ref.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          fetchRAWGImage();
          observer.disconnect();
        }
      },
      { rootMargin: '200px' } // Start fetching a bit before it comes into view
    );

    observer.observe(ref.current);

    return () => {
      observer.disconnect();
    };
  }, [initialThumbnail, title]);

  const fetchRAWGImage = async () => {
    setIsLoading(true);
    setIsError(false);

    // Basic scrub: remove common words to get closer to the game name
    const scrubbedTitle = title
      .replace(/rumor|rumour|leak|leaked|report|insider|confirmed|official|trailer|announcement|reveal|datamine|datamined|files found|code found/gi, '')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .trim();

    if (!scrubbedTitle) {
      setIsError(true);
      setIsLoading(false);
      return;
    }

    if (imageCache[scrubbedTitle]) {
      setImgSrc(imageCache[scrubbedTitle]);
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/rawg/image?q=${encodeURIComponent(scrubbedTitle)}`);
      if (!res.ok) throw new Error('RAWG fetch failed');
      const data = await res.json();
      
      if (data.image) {
        imageCache[scrubbedTitle] = data.image;
        setImgSrc(data.image);
      } else {
        setIsError(true);
      }
    } catch (e) {
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  };

  return { imgSrc, isLoading, isError, ref };
}
