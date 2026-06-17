import type { PresenceUser } from './CollaborativeEditor';

interface Props {
  users: PresenceUser[];
  selfName: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

/** Overlapping avatar stack of the collaborators currently in the document. */
export function PresenceAvatars({ users, selfName }: Props) {
  if (users.length === 0) return null;

  // De-duplicate per client; cap the visible stack and summarise the rest.
  const visible = users.slice(0, 5);
  const overflow = users.length - visible.length;

  return (
    <div className="avatars" title={`${users.length} here`}>
      {visible.map((u) => (
        <span
          key={u.clientId}
          className="avatar"
          style={{ background: u.color }}
          title={u.name === selfName ? `${u.name} (you)` : u.name}
        >
          {initials(u.name)}
        </span>
      ))}
      {overflow > 0 && <span className="avatar avatar-more">+{overflow}</span>}
    </div>
  );
}
