import { describe, it, expect, beforeAll } from 'vitest';

// Ensure required env exists before importing config-dependent modules.
beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
  process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
  process.env.DATABASE_URL ??= 'postgres://localhost/test';
  process.env.REDIS_URL ??= 'redis://localhost:6379';
});

describe('token round-trip', () => {
  it('signs and verifies an access token', async () => {
    const { signAccessToken, verifyAccessToken } = await import('./tokens.js');
    const token = signAccessToken('user-123', 'a@b.com');
    const claims = verifyAccessToken(token);
    expect(claims.sub).toBe('user-123');
    expect(claims.email).toBe('a@b.com');
  });

  it('rejects a tampered token', async () => {
    const { verifyAccessToken } = await import('./tokens.js');
    expect(() => verifyAccessToken('not.a.jwt')).toThrow();
  });
});
