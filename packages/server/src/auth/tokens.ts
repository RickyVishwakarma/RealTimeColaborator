import jwt from 'jsonwebtoken';
import type { AccessTokenClaims } from '@rtc/shared';
import { config } from '../config.js';

export function signAccessToken(userId: string, email: string): string {
  return jwt.sign({ email }, config.JWT_ACCESS_SECRET, {
    subject: userId,
    expiresIn: config.JWT_ACCESS_TTL,
  });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({}, config.JWT_REFRESH_SECRET, {
    subject: userId,
    expiresIn: config.JWT_REFRESH_TTL,
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  return jwt.verify(token, config.JWT_ACCESS_SECRET) as AccessTokenClaims;
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, config.JWT_REFRESH_SECRET) as { sub: string };
}
