import { useState, type FormEvent } from 'react';
import type { User } from '@rtc/shared';
import { api } from '../api';
import { useAuth } from '../store';

interface Props {
  user: User;
  onClose: () => void;
}

export function SettingsDialog({ user, onClose }: Props) {
  const setUser = useAuth((s) => s.setUser);

  const [displayName, setDisplayName] = useState(user.displayName);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    setProfileErr(null);
    try {
      const { user } = await api.updateProfile(displayName.trim());
      setUser(user);
      setProfileMsg('Profile updated');
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : 'Failed to update');
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    setPwErr(null);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setPwMsg('Password changed');
    } catch (err) {
      setPwErr(err instanceof Error ? err.message : 'Failed to change password');
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <form className="settings-section" onSubmit={saveProfile}>
          <label>
            Display name
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </label>
          <label>
            Email
            <input value={user.email} disabled />
          </label>
          {profileMsg && <p className="success">{profileMsg}</p>}
          {profileErr && <p className="error">{profileErr}</p>}
          <button type="submit" disabled={!displayName.trim()}>
            Save profile
          </button>
        </form>

        <form className="settings-section" onSubmit={savePassword}>
          <strong className="settings-heading">Change password</strong>
          <label>
            Current password
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label>
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          {pwMsg && <p className="success">{pwMsg}</p>}
          {pwErr && <p className="error">{pwErr}</p>}
          <button type="submit" disabled={!currentPassword || newPassword.length < 8}>
            Update password
          </button>
        </form>

        <div className="row">
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
