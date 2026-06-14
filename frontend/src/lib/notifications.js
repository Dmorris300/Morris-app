// Morris notifications — localStorage store + tiny React hook.
// Phase 1: infrastructure only. No triggers anywhere in the app yet.

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "morris.notifications.v1";
const MAX_NOTIFICATIONS = 50;

// Valid categories — must match the icons used by NotificationBell.
export const NOTIFICATION_CATEGORIES = [
  "document",
  "finance",
  "safety",
  "compliance",
  "commercial",
  "reminder",
];

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStore(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    // Broadcast within the same tab — storage events only fire cross-tab.
    window.dispatchEvent(new Event("morris:notifications-changed"));
  } catch { /* ignore quota errors */ }
}

/**
 * Append a notification. Newest first. Oldest dropped past MAX.
 * Returns the created notification object.
 *
 * Usage (Phase 2 will call this from triggers):
 *   addNotification({ message: "Document generated", category: "document" })
 */
export function addNotification({ message, category }) {
  if (!message || typeof message !== "string") return null;
  const safeCategory = NOTIFICATION_CATEGORIES.includes(category) ? category : "reminder";
  const item = {
    id:
      (typeof crypto !== "undefined" && crypto.randomUUID && crypto.randomUUID()) ||
      `n_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    message,
    category: safeCategory,
    timestamp: new Date().toISOString(),
    read: false,
    iconType: safeCategory,
  };
  const list = readStore();
  const next = [item, ...list].slice(0, MAX_NOTIFICATIONS);
  writeStore(next);
  return item;
}

export function getNotifications() {
  return readStore();
}

export function markAllRead() {
  const list = readStore();
  if (list.length === 0) return;
  const next = list.map((n) => (n.read ? n : { ...n, read: true }));
  writeStore(next);
}

export function clearAllNotifications() {
  writeStore([]);
}

/**
 * React hook returning the live list of notifications plus mutator functions.
 * Subscribes to in-tab changes and cross-tab storage events.
 */
export function useNotifications() {
  const [items, setItems] = useState(() => readStore());

  useEffect(() => {
    const sync = () => setItems(readStore());
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) sync();
    };
    window.addEventListener("morris:notifications-changed", sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("morris:notifications-changed", sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const unreadCount = items.reduce((n, x) => (x.read ? n : n + 1), 0);

  const add = useCallback((args) => addNotification(args), []);
  const markRead = useCallback(() => markAllRead(), []);
  const clear = useCallback(() => clearAllNotifications(), []);

  return { items, unreadCount, add, markAllRead: markRead, clearAll: clear };
}

/**
 * Convert an ISO timestamp into a friendly elapsed string.
 *  - < 1 min        → "Just now"
 *  - < 60 min       → "X minutes ago"
 *  - same day       → "Today at HH:MM"
 *  - previous day   → "Yesterday at HH:MM"
 *  - otherwise      → "DD/MM/YYYY"
 */
export function formatNotificationTime(iso) {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;

  const sameDay =
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate();
  const hh = String(then.getHours()).padStart(2, "0");
  const mm = String(then.getMinutes()).padStart(2, "0");
  if (sameDay) return `Today at ${hh}:${mm}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    then.getFullYear() === yesterday.getFullYear() &&
    then.getMonth() === yesterday.getMonth() &&
    then.getDate() === yesterday.getDate();
  if (isYesterday) return `Yesterday at ${hh}:${mm}`;

  const dd = String(then.getDate()).padStart(2, "0");
  const mo = String(then.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mo}/${then.getFullYear()}`;
}
