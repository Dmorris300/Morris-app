import { useEffect, useRef, useState } from "react";
import {
  Bell,
  FileText,
  PoundSterling,
  ShieldAlert,
  Scale,
  Briefcase,
  Clock,
} from "lucide-react";
import {
  useNotifications,
  formatNotificationTime,
} from "../lib/notifications";

const CATEGORY_ICON = {
  document:    FileText,
  finance:     PoundSterling,
  safety:      ShieldAlert,
  compliance:  Scale,
  commercial:  Briefcase,
  reminder:    Clock,
};

export default function NotificationBell({ testIdPrefix = "notifications" }) {
  const { items, unreadCount, markAllRead, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // When the dropdown opens, mark everything as read so the dot disappears.
  useEffect(() => {
    if (open && unreadCount > 0) markAllRead();
  }, [open, unreadCount, markAllRead]);

  // Close when clicking outside or pressing Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const badge = unreadCount > 99 ? "99+" : unreadCount;

  return (
    <div className="relative" ref={containerRef} data-testid={`${testIdPrefix}-root`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative w-9 h-9 flex items-center justify-center rounded-md hover:bg-[#121212] text-[#E8A020] transition-colors"
        data-testid={`${testIdPrefix}-bell`}
      >
        <Bell size={18} strokeWidth={1.75} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
            style={{ background: "#DC3C3C", color: "#FFFFFF", lineHeight: 1 }}
            data-testid={`${testIdPrefix}-badge`}
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute z-50 w-[20rem] sm:w-[22rem] max-w-[calc(100vw-2rem)] rounded-md shadow-xl"
          style={{
            top: "calc(100% + 8px)",
            right: 0,
            background: "#0C0C0C",
            border: "1px solid rgba(232,160,32,0.25)",
          }}
          data-testid={`${testIdPrefix}-panel`}
        >
          <div
            className="px-4 py-3 flex items-center justify-between"
            style={{ borderBottom: "1px solid rgba(240,237,232,0.05)" }}
          >
            <div className="text-xs uppercase tracking-widest text-[#E8A020]">
              Notifications
            </div>
            <div className="text-[10px] text-[#706D66]">
              {items.length === 0 ? "Empty" : `${items.length} total`}
            </div>
          </div>

          {items.length === 0 ? (
            <div
              className="px-4 py-10 text-sm text-[#706D66] text-center"
              data-testid={`${testIdPrefix}-empty`}
            >
              No recent activity
            </div>
          ) : (
            <ul
              className="max-h-[60vh] overflow-y-auto py-1"
              data-testid={`${testIdPrefix}-list`}
            >
              {items.map((n) => (
                <NotificationRow key={n.id} item={n} testIdPrefix={testIdPrefix} />
              ))}
            </ul>
          )}

          <div
            className="px-3 py-2 flex justify-between items-center"
            style={{ borderTop: "1px solid rgba(240,237,232,0.05)" }}
          >
            <span className="text-[10px] text-[#706D66]">Max 50 stored</span>
            <button
              type="button"
              onClick={clearAll}
              disabled={items.length === 0}
              className="text-xs text-[#A19D94] hover:text-[#E8A020] disabled:opacity-40 disabled:hover:text-[#A19D94]"
              data-testid={`${testIdPrefix}-clear-all`}
            >
              Clear all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRow({ item, testIdPrefix }) {
  const Icon = CATEGORY_ICON[item.iconType] || CATEGORY_ICON.reminder;
  const isUnread = !item.read;
  return (
    <li
      className="px-3 py-2.5 flex gap-3 items-start"
      style={{
        borderLeft: isUnread ? "2px solid #E8A020" : "2px solid transparent",
        background: isUnread ? "rgba(232,160,32,0.04)" : "transparent",
      }}
      data-testid={`${testIdPrefix}-item`}
      data-unread={isUnread ? "true" : "false"}
    >
      <div
        className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5"
        style={{
          background: "rgba(232,160,32,0.10)",
          border: "1px solid rgba(232,160,32,0.20)",
        }}
      >
        <Icon size={14} className="text-[#E8A020]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-[#F0EDE8] leading-snug break-words">
          {item.message}
        </div>
        <div className="text-[10px] uppercase tracking-widest text-[#706D66] mt-1">
          {formatNotificationTime(item.timestamp)}
        </div>
      </div>
    </li>
  );
}
