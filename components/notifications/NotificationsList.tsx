"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Briefcase, CheckCheck, PartyPopper, XCircle } from "lucide-react";

import { markAllNotificationsRead, markNotificationRead, type NotificationRow } from "@/actions/notifications";
import { formatTimeAgo } from "@/lib/utils";

const ICONS: Record<string, typeof Bell> = {
  status_interviewing: Briefcase,
  status_offered: PartyPopper,
  status_rejected: XCircle,
};

function NotificationRowItem({ notification, onRead }: { notification: NotificationRow; onRead: (id: string) => void }) {
  const Icon = ICONS[notification.type] ?? Bell;
  const isUnread = !notification.read_at;
  // Deferred to client-only, same reason as every other time-dependent
  // inline render in this app (JobActionBar's foundAtLabel) — avoids an
  // SSR/hydration text mismatch on the exact wall-clock moment.
  const [timeLabel, setTimeLabel] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setTimeLabel(formatTimeAgo(notification.created_at)), 0);
    return () => clearTimeout(timer);
  }, [notification.created_at]);

  const content = (
    <div
      className={`flex items-start gap-3 rounded-xl border p-4 transition-colors ${
        isUnread ? "border-accent/30 bg-accent-muted/40" : "border-border bg-surface"
      }`}
      onClick={() => isUnread && onRead(notification.id)}
    >
      <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface-secondary">
        <Icon className="h-4 w-4 text-text-secondary" />
      </span>
      <div className="flex-1">
        <p className="text-sm font-medium text-text-primary">{notification.title}</p>
        {notification.body && <p className="mt-0.5 text-sm text-text-secondary">{notification.body}</p>}
        <p className="mt-1 text-xs text-text-muted">{timeLabel}</p>
      </div>
      {isUnread && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-accent" />}
    </div>
  );

  return notification.link ? (
    <Link href={notification.link} onClick={() => isUnread && onRead(notification.id)}>
      {content}
    </Link>
  ) : (
    content
  );
}

export function NotificationsList({ initialNotifications }: { initialNotifications: NotificationRow[] }) {
  const [notifications, setNotifications] = useState(initialNotifications);

  function handleRead(id: string): void {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    markNotificationRead(id);
  }

  function handleMarkAll(): void {
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    markAllNotificationsRead();
  }

  const hasUnread = notifications.some((n) => !n.read_at);

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-12 text-center shadow-card">
        <Bell className="h-6 w-6 text-text-muted" />
        <p className="text-sm text-text-secondary">No notifications yet</p>
        <p className="max-w-xs text-xs text-text-muted">
          Real milestones on your tracked applications — moving to interviewing, an offer, or a rejection — will
          show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {hasUnread && (
        <button
          type="button"
          onClick={handleMarkAll}
          className="inline-flex w-fit items-center gap-1.5 self-end rounded-full border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary"
        >
          <CheckCheck className="h-3.5 w-3.5" />
          Mark all read
        </button>
      )}
      {notifications.map((notification) => (
        <NotificationRowItem key={notification.id} notification={notification} onRead={handleRead} />
      ))}
    </div>
  );
}
