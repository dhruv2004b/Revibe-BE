import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { unauthorized } from '../domain/errors.js';

export interface AuthUser {
  uid: string;
  name: string | null;
}

export type TokenVerifier = (token: string) => Promise<AuthUser>;

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

/**
 * Local-only verifier: "dev:<uid>" signs in as <uid>.
 * config.assertSafeConfig refuses this in production.
 */
export const mockVerifier: TokenVerifier = async (token) => {
  const m = /^dev:([A-Za-z0-9_-]{1,64})$/.exec(token);
  if (!m) throw unauthorized('Invalid dev token. Use "dev:<uid>".');
  return { uid: m[1]!, name: null };
};

export async function firebaseVerifier(): Promise<TokenVerifier> {
  const { getAuth } = await import('firebase-admin/auth');
  const auth = getAuth();
  return async (token) => {
    try {
      const decoded = await auth.verifyIdToken(token);
      return { uid: decoded.uid, name: (decoded.name as string | undefined) ?? null };
    } catch {
      throw unauthorized('Session expired. Please sign in again.');
    }
  };
}

export function requireAuth(verify: TokenVerifier): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return next(unauthorized());
    try {
      req.user = await verify(token);
      next();
    } catch (e) {
      next(e);
    }
  };
}

export function uidOf(req: Request): string {
  if (!req.user) throw unauthorized();
  return req.user.uid;
}
