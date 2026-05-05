import { IntelItem } from "../types";

const RETENTION_KEY = "leakr_priority_retained_items_v1";
const PRIORITY_RETENTION_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const MAX_RETAINED_ITEMS = 120;

const PRIORITY_GAME_PATTERNS: RegExp[] = [
  /\bresident evil requiem\b/i,
  /\bresident evil\s*9\b/i,
  /\bre9\b/i,
  /\bassassin['’]?s creed\b/i,
  /\bblack flag\b/i,
  /\bassassin['’]?s creed shadows\b/i,
  /\bgta\s*6\b/i,
  /\bgta\s*vi\b/i,
  /\bgrand theft auto\s*(6|vi)\b/i,
  /\bmarvel['’]?s wolverine\b/i,
  /\bwolverine\b/i,
  /\blego batman\b/i,
  /\bfallout\b/i,
  /\bgod of war\b/i,
  /\bthe witcher\b/i,
  /\bwitcher\s*4\b/i,
  /\bred dead redemption\b/i,
  /\brdr\s*1\b/i,
  /\brdr\s*2\b/i,
  /\bred dead redemption\s*(1|2)\b/i,
];

interface RetainedItem {
  item: IntelItem;
  retainedAt: string;
  lastSeenAt: string;
}

function isPriorityGameItem(item: IntelItem): boolean {
  const text = `${item.title} ${item.description}`;
  return PRIORITY_GAME_PATTERNS.some(pattern => pattern.test(text));
}

function reviveItem(item: IntelItem): IntelItem {
  return {
    ...item,
    publishedAt: new Date(item.publishedAt),
  };
}

function loadRetainedItems(): RetainedItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RETENTION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RetainedItem[];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed
      .filter(entry => entry?.item?.id && entry.retainedAt)
      .filter(entry => now - new Date(entry.lastSeenAt || entry.retainedAt).getTime() <= PRIORITY_RETENTION_MS)
      .map(entry => ({
        ...entry,
        item: reviveItem(entry.item),
      }));
  } catch {
    try { window.localStorage.removeItem(RETENTION_KEY); } catch { /* ignore */ }
    return [];
  }
}

function saveRetainedItems(entries: RetainedItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RETENTION_KEY, JSON.stringify(entries));
  } catch {
    // If localStorage is full or blocked, retention simply won't persist.
  }
}

export function mergeWithPriorityRetention(items: IntelItem[]): IntelItem[] {
  const nowIso = new Date().toISOString();
  const retained = loadRetainedItems();
  const byId = new Map<string, RetainedItem>();

  for (const entry of retained) {
    byId.set(entry.item.id, entry);
  }

  for (const item of items) {
    if (!isPriorityGameItem(item)) continue;
    const existing = byId.get(item.id);
    byId.set(item.id, {
      item,
      retainedAt: existing?.retainedAt ?? nowIso,
      lastSeenAt: nowIso,
    });
  }

  const mergedRetained = [...byId.values()]
    .sort((a, b) => new Date(b.item.publishedAt).getTime() - new Date(a.item.publishedAt).getTime())
    .slice(0, MAX_RETAINED_ITEMS);

  saveRetainedItems(mergedRetained);

  const finalById = new Map<string, IntelItem>();
  for (const item of items) finalById.set(item.id, item);
  for (const entry of mergedRetained) finalById.set(entry.item.id, entry.item);

  return [...finalById.values()].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
}
