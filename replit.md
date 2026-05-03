# Leakr

## Overview

**Leakr** — a gaming news & leaks aggregator. pnpm monorepo with a React/Vite/Tailwind frontend and an Express API backend.

## Stack

- **Frontend**: React 18 + Vite + Tailwind CSS + Framer Motion (`artifacts/leakr`)
- **Backend**: Express 5 + esbuild bundle (`artifacts/api-server`, port 8080)
- **Monorepo**: pnpm workspaces, TypeScript 5.9, Node 24
- **Image data**: RAWG API (server-side proxy, key in `RAWG_API_KEY` secret)

## Architecture

### Data sources
- `r/GamingLeaksAndRumours` — hot (5) + new (25) posts merged via Atom RSS, enriched server-side
- `r/GamingNews` — top 25 posts, enriched server-side
- IGN, Insider Gaming, VGC — RSS/Atom feeds
- All feeds proxied through `/api/feed/*` routes in `artifacts/api-server/src/routes/feed.ts`

### Thumbnail pipeline
1. **Server enrichment**: for Reddit self-posts, body HTML is scanned for external links. YouTube links → `hqdefault.jpg` CDN URL. Other links → `og:image` fetched server-side.
2. **RAWG lazy load**: if thumbnail is still null after enrichment, `useLazyImage` hook fires an IntersectionObserver that queries `/api/rawg/image?q=<title>` when the card scrolls into view.
3. **Cache**: JS localStorage (15 min, versioned). Fetch calls use `cache: "no-store"` to bypass browser HTTP cache.

### Plausibility engine (`tierEngine.ts`)
Scores each item S/A/B/C/F based on: source credibility, corroboration across sources, official statement keywords, developer role keywords, confirmed news signals.

### Filtering
- `NON_GAMING_TITLE_PATTERNS` — removes puzzles, podcasts, opinion pieces, deal roundups, movie reviews
- `BLOCKED_SOURCE_DOMAINS` — removes Kotaku, Polygon, PC Gamer articles (from Reddit link posts)
- Short self-posts (≤ 2 words, no external link) are dropped from Reddit feeds

## Key Files
- `artifacts/leakr/src/lib/dataFetcher.ts` — feed fetching, filtering, corroboration, localStorage cache (currently v12)
- `artifacts/leakr/src/lib/tierEngine.ts` — plausibility engine
- `artifacts/leakr/src/lib/imageResolver.ts` — RAWG lazy image hook
- `artifacts/api-server/src/routes/feed.ts` — all feed proxies, Reddit enrichment, RAWG proxy, og:image fetching
- `artifacts/leakr/src/components/Header.tsx` — sticky header with logo + source/tier filters
- `artifacts/leakr/src/components/GridCard.tsx` — card grid with RAWG attribution badge
- `artifacts/leakr/src/components/DossierModal.tsx` — full analysis modal ("Analyze" button)

## Key Commands
- `pnpm --filter @workspace/api-server run dev` — run API server
- `pnpm --filter @workspace/leakr run dev` — run frontend
