import { useEffect, useState, useRef } from 'react';

// Global image cache (in-memory, per session)
const imageCache: Record<string, string | null> = {};

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
      return;
    }

    setIsLoading(true);
    setIsError(false);

    try {
      const res = await fetch(`/api/rawg/image?q=${encodeURIComponent(title)}`);
      if (!res.ok) throw new Error('RAWG ' + res.status);
      const data = await res.json();

      if (data.image) {
        imageCache[title] = data.image;
        setImgSrc(data.image);
      } else {
        imageCache[title] = null;
        setIsError(true);
      }
    } catch {
      imageCache[title] = null;
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const isFromRawg = !initialThumbnail && !!imgSrc && !isError;

  return { imgSrc, isLoading, isError, isFromRawg, ref };
}
