import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from './tokens.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

/** Extracts and verifies the Bearer access token, attaching the user id. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }
  try {
    const claims = verifyAccessToken(header.slice('Bearer '.length));
    req.userId = claims.sub;
    req.userEmail = claims.email;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
