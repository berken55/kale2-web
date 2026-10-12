import crypto from 'node:crypto';
import type { NextFunction, Request, Response, Router } from 'express';
import express from 'express';

export interface AuthConfig {
  username: string;
  password: string;
  secret: string;
  secureCookie: boolean;
}

const COOKIE = 'kale2_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function sign(payload: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function createToken(username: string, secret: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: now + SESSION_TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyToken(token: string | undefined, secret: string): string | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig || !safeEqual(sig, sign(payload, secret))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { u: string; exp: number };
    return data.exp > Date.now() ? data.u : null;
  } catch {
    return null;
  }
}

export function authRouter(config: AuthConfig): Router {
  const router = express.Router();

  // Basit kaba kuvvet koruması: IP başına 15 dakikada 10 hatalı deneme
  const failures = new Map<string, { count: number; until: number }>();

  router.post('/login', (req, res) => {
    const key = req.ip ?? 'unknown';
    const entry = failures.get(key);
    if (entry && entry.count >= 10 && entry.until > Date.now()) {
      return res.status(429).json({ error: 'Çok fazla hatalı deneme. Lütfen daha sonra tekrar deneyin.' });
    }
    const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
    if (
      typeof username !== 'string' ||
      typeof password !== 'string' ||
      !safeEqual(username, config.username) ||
      !safeEqual(password, config.password)
    ) {
      const next = entry && entry.until > Date.now() ? entry.count + 1 : 1;
      failures.set(key, { count: next, until: Date.now() + 15 * 60 * 1000 });
      return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
    }
    failures.delete(key);
    res.cookie(COOKIE, createToken(username, config.secret), {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.secureCookie,
      maxAge: SESSION_TTL_MS,
    });
    res.json({ username });
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(COOKIE);
    res.json({ ok: true });
  });

  router.get('/me', (req, res) => {
    const user = verifyToken(req.cookies?.[COOKIE], config.secret);
    if (!user) return res.status(401).json({ error: 'Oturum açılmamış.' });
    res.json({ username: user });
  });

  return router;
}

export function requireAuth(config: AuthConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (verifyToken(req.cookies?.[COOKIE], config.secret)) return next();
    res.status(401).json({ error: 'Bu işlem için giriş yapmalısınız.' });
  };
}
