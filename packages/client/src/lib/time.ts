/** Compact relative time, e.g. "just now", "5m ago", "3h ago", "2d ago". */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.floor((Date.now() - then) / 1000);

  if (seconds < 45) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
