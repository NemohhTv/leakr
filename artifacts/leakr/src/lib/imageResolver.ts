import { useEffect, useState, useRef } from 'react';

// ─── Persistent RAWG image cache ──────────────────────────────────────────
const CACHE_KEY = "leakr_rawg_image_cache_v11";
const POSITIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days
const NEGATIVE_TTL_MS = 60 * 60 * 1000;            // 1 hour

interface CacheEntry { url: string | null; ts: number; }

const imageCache: Record<string, string | null> = {};

function loadCacheFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
    const now = Date.now();
    for (const [title, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry.ts !== "number") continue;
      const ttl = entry.url ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS;
      if (now - entry.ts > ttl) continue;
      imageCache[title] = entry.url;
    }
  } catch {
    try { window.localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(): void {
  if (typeof window === "undefined") return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const now = Date.now();
      const existing: Record<string, CacheEntry> = {};
      try {
        const raw = window.localStorage.getItem(CACHE_KEY);
        if (raw) Object.assign(existing, JSON.parse(raw));
      } catch { /* ignore */ }
      for (const [title, url] of Object.entries(imageCache)) {
        existing[title] = { url, ts: now };
      }
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(existing));
    } catch {
      // In-memory cache still works for this session.
    }
  }, 400);
}

function setCache(title: string, url: string | null): void {
  imageCache[title] = url;
  schedulePersist();
}

loadCacheFromStorage();

const SKIP_RAWG_PATTERNS = [
  /\banime\b/i,
  /\bmanga\b/i,
  /\bepisode\s+\d+\b/i,
  /\bConnections\b.{0,15}#\d+/i,
  /NYT Connections/i,
  /Wordle/i,
  /\bHints\b.{0,10}(Today|For|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)/i,
  /box office/i,
  /movie review/i,
  /streaming/i,
  /episode recap/i,
  /\bdeals\b.{0,20}\b(today|this week)\b/i,
  /best \w+ (deals|prices|sales)/i,
  /\b(movie|film|anime|tv show|television|series)\b.*\b(review|trailer|premiere|release|box office|sequel|adaptation)\b/i,
  /discusses?.{0,30}(movie|film|show|series|anime)/i,
  /\b(movie|film|anime|show)\b.*\b(discusses?|talks?|says?|reveals?|explains?)\b/i,
];

const RAWG_ALIAS_FALLBACKS: Array<{ pattern: RegExp; queries: string[] }> = [
  {
    pattern: /\bgrove street games\b/i,
    queries: ["grand theft auto trilogy definitive edition", "grand theft auto san andreas", "ark survival ascended"],
  },
  {
    pattern: /\bbluepoint\b/i,
    queries: ["demon's souls", "shadow of the colossus"],
  },
  {
    pattern: /\bbend studio\b/i,
    queries: ["days gone"],
  },
  {
    pattern: /\bnaughty dog\b/i,
    queries: ["the last of us", "uncharted"],
  },
  {
    pattern: /\bsucker punch\b/i,
    queries: ["ghost of tsushima"],
  },
  {
    pattern: /\binsomniac\b/i,
    queries: ["marvel's spider-man", "wolverine"],
  },
  {
    pattern: /\bsanta monica studio\b/i,
    queries: ["god of war"],
  },
  {
    pattern: /\bcd projekt|cdpr\b/i,
    queries: ["the witcher 4", "cyberpunk 2077"],
  },
  {
    pattern: /\brockstar\b/i,
    queries: ["grand theft auto vi", "red dead redemption 2"],
  },
  {
    pattern: /\bbethesda\b/i,
    queries: ["the elder scrolls vi", "starfield"],
  },
  {
    pattern: /\bubisoft\b/i,
    queries: ["assassin's creed", "far cry"],
  },
  {
    pattern: /\bcapcom\b/i,
    queries: ["resident evil", "monster hunter wilds"],
  },
  {
    pattern: /\bfromsoftware\b|\bfrom software\b/i,
    queries: ["elden ring", "dark souls"],
  },
  {
    pattern: /\bio interactive\b/i,
    queries: ["hitman", "007 first light"],
  },
];

function shouldFetchRAWG(title: string): boolean {
  return !SKIP_RAWG_PATTERNS.some(p => p.test(title));
}

function rawgQueriesForTitle(title: string): string[] {
  const aliases = RAWG_ALIAS_FALLBACKS
    .filter(entry => entry.pattern.test(title))
    .flatMap(entry => entry.queries);
  return [...new Set([title, ...aliases])];
}

export function useLazyImage(title: string, initialThumbnail: string | null) {
  const [imgSrc, setImgSrc] = useState<string | null>(initialThumbnail);
  const [isLoading, setIsLoading] = useState(!initialThumbnail);
  const [isError, setIsError] = useState(false);
  const [usedRawg, setUsedRawg] = useState(false);
  const ref = useRef<HTMLDivElement | HTMLImageElement>(null);

  useEffect(() => {
    setImgSrc(initialThumbnail);
    setIsLoading(!initialThumbnail);
    setIsError(false);
    setUsedRawg(false);

    if (initialThumbnail) {
      setIsLoading(false);
      return;
    }

    if (!shouldFetchRAWG(title)) {
      setIsLoading(false);
      setIsError(true);
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
      { rootMargin: '200px' },
    );

    observer.observe(ref.current);

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialThumbnail, title]);

  const fetchRAWGImage = async () => {
    if (title in imageCache) {
      const cached = imageCache[title];
      setImgSrc(cached);
      setIsLoading(false);
      setIsError(!cached);
      setUsedRawg(!!cached);
      return;
    }

    setIsLoading(true);
    setIsError(false);

    try {
      for (const query of rawgQueriesForTitle(title)) {
        const res = await fetch(`/api/rawg/image?q=${encodeURIComponent(query)}`);
        if (!res.ok) continue;
        const data = await res.json();
        if (data.image) {
          setCache(title, data.image);
          setImgSrc(data.image);
          setUsedRawg(true);
          setIsLoading(false);
          return;
        }
      }

      setCache(title, null);
      setIsError(true);
    } catch {
      setCache(title, null);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const onImageError = () => {
    if (!usedRawg && shouldFetchRAWG(title)) {
      setImgSrc(null);
      setIsLoading(true);
      fetchRAWGImage();
    } else {
      setImgSrc(null);
      setIsError(true);
      setIsLoading(false);
    }
  };

  const isFromRawg = usedRawg && !!imgSrc && !isError;

  return { imgSrc, isLoading, isError, isFromRawg, ref, onImageError };
}
