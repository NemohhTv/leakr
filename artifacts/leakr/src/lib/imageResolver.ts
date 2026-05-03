import { useEffect, useState, useRef } from 'react';

// ─── Persistent RAWG image cache ──────────────────────────────────────────
// Backed by localStorage so thumbnails survive page reloads. Without this,
// every refresh re-queries RAWG for the same titles (e.g. publisher-fallback
// "PlayStation Studios" → "God of War"), which is slow AND visibly flickers
// the thumbnails. RAWG image URLs are CDN-stable for long periods, so a
// week-long TTL is comfortable.
//
// Negative results (no match found) are cached too with a shorter TTL so we
// don't keep retrying the same hopeless query on every reload, but we do
// re-attempt eventually in case RAWG's catalogue grows.
const CACHE_KEY = "leakr_rawg_image_cache_v3";
const POSITIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days
const NEGATIVE_TTL_MS = 6 * 60 * 60 * 1000;        // 6 hours

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
      if (now - entry.ts > ttl) continue; // expired — skip
      imageCache[title] = entry.url;
    }
  } catch {
    // Corrupt cache — wipe and start fresh.
    try { window.localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(): void {
  if (typeof window === "undefined") return;
  if (persistTimer) clearTimeout(persistTimer);
  // Debounce — many cards resolve in quick succession on first paint, so we
  // batch the writes into a single localStorage round-trip.
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const now = Date.now();
      // Re-read existing entries so we preserve timestamps for anything that
      // hadn't changed this session, then overlay the in-memory map.
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
      // Quota exceeded or otherwise unwritable — just skip; in-memory cache
      // still works for the rest of this session.
    }
  }, 400);
}

function setCache(title: string, url: string | null): void {
  imageCache[title] = url;
  schedulePersist();
}

loadCacheFromStorage();

// Titles that very likely refer to a specific game — RAWG makes sense to call
const GAME_TITLE_SIGNALS = [
  // Sequel/series number patterns
  /\b(gta|grand theft auto)\b/i,
  /\b(call of duty|cod|halo|fortnite|minecraft|zelda|pokemon|mario|fifa|assassin[''']?s creed)\b/i,
  /\b(elder scrolls|fallout|cyberpunk|starfield|red dead|elden ring|god of war|last of us)\b/i,
  /\b(final fantasy|metal gear|resident evil|street fighter|mortal kombat|tekken)\b/i,
  /\b(battlefield|overwatch|diablo|world of warcraft|league of legends|valorant|apex)\b/i,
  /\b(dark souls|hollow knight|sekiro|bloodborne|doom|quake|unreal)\b/i,
  // Generic game signals
  /\b(dlc|expansion|update|patch|season pass|battle pass|early access|game pass|gamepass)\b/i,
  /\b(ps5|xbox|nintendo|playstation|steam deck)\b.*\b(game|title|exclusive|release|launch)\b/i,
  /\b(release date|launch date|out now|available now|coming to)\b/i,
  /\b(developer|studio|publisher|studio)\b.*\b(announce|reveal|confirm|show)\b/i,
];

// Titles that should never hit RAWG (guide/puzzle/movie content)
const SKIP_RAWG_PATTERNS = [
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
  // Articles about game-adjacent movies/shows — the image would be a movie poster, not game art
  /\b(movie|film|anime|tv show|television|series)\b.*\b(review|trailer|premiere|release|box office|sequel|adaptation)\b/i,
  /discusses?.{0,30}(movie|film|show|series|anime)/i,
  /\b(movie|film|anime|show)\b.*\b(discusses?|talks?|says?|reveals?|explains?)\b/i,
  /growth in (mario|sonic|pokemon|zelda|halo|uncharted|last of us) (movie|film|show)/i,
  // Growth/character in movie discussions
  /\w+ in (mario|sonic|pokemon|zelda) (movies?|films?)/i,
];

function shouldFetchRAWG(title: string): boolean {
  // Hard skip list first
  if (SKIP_RAWG_PATTERNS.some(p => p.test(title))) return false;
  // Short titles (≤ 4 words) are likely bare game names — always try RAWG
  const wordCount = title.split(/\s+/).filter(w => w.length > 0).length;
  if (wordCount <= 4) return true;
  // Check if it seems like a gaming article
  const hasGameSignal = GAME_TITLE_SIGNALS.some(p => p.test(title));
  if (hasGameSignal) return true;
  // Generic: has at least one of these gaming-news words
  const lc = title.toLowerCase();
  return (
    lc.includes('game') ||
    lc.includes('gaming') ||
    lc.includes('sequel') ||
    lc.includes('developer') ||
    lc.includes('studio') ||
    lc.includes('remaster') ||
    lc.includes('remake') ||
    lc.includes('open world') ||
    lc.includes('multiplayer') ||
    lc.includes('single-player')
  );
}

export function useLazyImage(title: string, initialThumbnail: string | null) {
  const [imgSrc, setImgSrc] = useState<string | null>(initialThumbnail);
  const [isLoading, setIsLoading] = useState(!initialThumbnail);
  const [isError, setIsError] = useState(false);
  const [usedRawg, setUsedRawg] = useState(false);
  const ref = useRef<HTMLDivElement | HTMLImageElement>(null);

  useEffect(() => {
    // Source provided a real thumbnail — use it, no RAWG needed
    if (initialThumbnail) {
      setImgSrc(initialThumbnail);
      setIsLoading(false);
      return;
    }

    // Article doesn't seem to be about a specific game — skip RAWG entirely
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
    // Check in-memory cache first (keyed by raw title)
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
      const res = await fetch(`/api/rawg/image?q=${encodeURIComponent(title)}`);
      if (!res.ok) throw new Error('RAWG ' + res.status);
      const data = await res.json();

      if (data.image) {
        setCache(title, data.image);
        setImgSrc(data.image);
        setUsedRawg(true);
      } else {
        setCache(title, null);
        setIsError(true);
      }
    } catch {
      setCache(title, null);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Called by <img onError> when the URL fails to load (expired CDN, 404, etc.)
  // Falls back to RAWG once if the broken image was the source-provided thumbnail.
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
