import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store';
import { Logo } from '../components/Logo';

const HIGHLIGHTS = [
  'Real-time editing with live cursors',
  'Comments, threads & version history',
  'Templates, export & full-text search',
];

export function LoginPage() {
  const navigate = useNavigate();
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await signup(email, password, displayName);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-split">
      <aside className="auth-brand">
        <Logo size={30} />
        <div className="auth-brand-body">
          <h1 className="auth-headline">Write together, in real time.</h1>
          <p className="auth-sub">
            A collaborative editor where your team drafts, comments, and ships — on the same page,
            literally.
          </p>
          <ul className="auth-highlights">
            {HIGHLIGHTS.map((h) => (
              <li key={h}>
                <span className="check">✓</span> {h}
              </li>
            ))}
          </ul>
        </div>
        <span className="auth-foot muted">Built with CRDTs, WebSockets & Yjs.</span>
      </aside>

      <main className="auth-form-side">
        <form className="auth-card" onSubmit={handleSubmit}>
          <div className="auth-mobile-logo">
            <Logo size={26} />
          </div>
          <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="muted auth-card-sub">
            {mode === 'login' ? 'Log in to continue to your documents.' : 'Start collaborating in seconds.'}
          </p>

          {mode === 'signup' && (
            <label>
              Display name
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ada Lovelace"
                required
              />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
              minLength={8}
              required
            />
          </label>

          {error && <p className="error">{error}</p>}

          <button type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>

          <p className="auth-switch muted">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              type="button"
              className="link"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setError(null);
              }}
            >
              {mode === 'login' ? 'Sign up' : 'Log in'}
            </button>
          </p>
        </form>
      </main>
    </div>
  );
}
