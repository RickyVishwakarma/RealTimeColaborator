import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { AuthResponse, User } from '@rtc/shared';
import { query } from '../db/pool.js';
import { config } from '../config.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from './tokens.js';
import { requireAuth } from './middleware.js';

export const authRouter = Router();

const REFRESH_COOKIE = 'rtc_refresh';

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  password_hash: string;
  created_at: Date;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at.toISOString(),
  };
}

function setRefreshCookie(res: import('express').Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: config.JWT_REFRESH_TTL * 1000,
    path: '/api/auth',
  });
}

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(255),
});

authRouter.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }
  const { email, password, displayName } = parsed.data;

  const existing = await query<UserRow>('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rowCount && existing.rowCount > 0) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await query<UserRow>(
    `INSERT INTO users (email, display_name, password_hash)
     VALUES ($1, $2, $3) RETURNING *`,
    [email, displayName, passwordHash],
  );
  const user = toUser(result.rows[0]);

  setRefreshCookie(res, signRefreshToken(user.id));
  const body: AuthResponse = { user, accessToken: signAccessToken(user.id, user.email) };
  res.status(201).json(body);
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }
  const { email, password } = parsed.data;

  const result = await query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
  const row = result.rows[0];
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const user = toUser(row);
  setRefreshCookie(res, signRefreshToken(user.id));
  const body: AuthResponse = { user, accessToken: signAccessToken(user.id, user.email) };
  res.json(body);
});

authRouter.post('/refresh', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) {
    res.status(401).json({ error: 'No refresh token' });
    return;
  }
  try {
    const { sub } = verifyRefreshToken(token);
    const result = await query<UserRow>('SELECT * FROM users WHERE id = $1', [sub]);
    const row = result.rows[0];
    if (!row) {
      res.status(401).json({ error: 'User no longer exists' });
      return;
    }
    const user = toUser(row);
    // Rotate refresh token on every use.
    setRefreshCookie(res, signRefreshToken(user.id));
    const body: AuthResponse = { user, accessToken: signAccessToken(user.id, user.email) };
    res.json(body);
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const result = await query<UserRow>('SELECT * FROM users WHERE id = $1', [req.userId]);
  const row = result.rows[0];
  if (!row) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ user: toUser(row) });
});
