import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Notification } from '@rtc/shared';
import { api } from '../api';
import { timeAgo } from '../lib/time';

const POLL_MS = 30_000;

export function NotificationBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const { notifications, unread } = await api.listNotifications();
      setItems(notifications);
      setUnread(unread);
    } catch {
      /* ignore transient errors */
    }
  }, []);

  // Initial load + lightweight polling.
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Element)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function handleOpen() {
    setOpen((v) => !v);
    if (!open) await refresh();
  }

  async function handleClick(n: Notification) {
    if (!n.readAt) {
      await api.markNotificationRead(n.id);
      setUnread((u) => Math.max(0, u - 1));
      setItems((list) => list.map((i) => (i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i)));
    }
    setOpen(false);
    if (n.documentId) navigate(`/doc/${n.documentId}`);
  }

  async function handleMarkAll() {
    await api.markAllNotificationsRead();
    setUnread(0);
    setItems((list) => list.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })));
  }

  return (
    <div className="notif-bell" ref={ref}>
      <button className="secondary bell-btn" onClick={() => void handleOpen()} title="Notifications">
        🔔
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-dropdown card">
          <div className="notif-header">
            <strong>Notifications</strong>
            {unread > 0 && (
              <button className="link" onClick={() => void handleMarkAll()}>
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="muted notif-empty">You're all caught up.</p>
          ) : (
            <ul className="notif-list">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`notif-item${n.readAt ? '' : ' unread'}`}
                  onClick={() => void handleClick(n)}
                >
                  <span className="notif-body">{n.body}</span>
                  {n.documentTitle && <span className="muted notif-doc">{n.documentTitle}</span>}
                  <span className="muted notif-time" title={new Date(n.createdAt).toLocaleString()}>
                    {timeAgo(n.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
