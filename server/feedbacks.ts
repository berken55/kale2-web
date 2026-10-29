import type { DB } from './db.ts';
import { HttpError } from './http-error.ts';
import { logActivity } from './db.ts';
import type { FeedbackCategory, FeedbackInput, FeedbackItem } from '../shared/types.ts';

const VALID_CATEGORIES = new Set<FeedbackCategory>(['bug', 'balance', 'feature', 'performance', 'general']);

export function createFeedback(db: DB, raw: FeedbackInput): FeedbackItem {
  const playerName = typeof raw.playerName === 'string' ? raw.playerName.trim() : '';
  const category = (VALID_CATEGORIES.has(raw.category) ? raw.category : 'general') as FeedbackCategory;
  const rating = Math.min(5, Math.max(1, Number(raw.rating) || 5));
  const subject = typeof raw.subject === 'string' ? raw.subject.trim() : '';
  const message = typeof raw.message === 'string' ? raw.message.trim() : '';
  const accountId = Number.isInteger(raw.accountId) && Number(raw.accountId) > 0 ? Number(raw.accountId) : null;

  if (!playerName) {
    throw new HttpError(400, 'Oyuncu adı gereklidir.');
  }
  if (!subject) {
    throw new HttpError(400, 'Geri bildirim konusu gereklidir.');
  }
  if (subject.length > 150) {
    throw new HttpError(400, 'Konu başlığı en fazla 150 karakter olabilir.');
  }
  if (!message) {
    throw new HttpError(400, 'Geri bildirim mesajı gereklidir.');
  }
  if (message.length < 10) {
    throw new HttpError(400, 'Lütfen en az 10 karakterden oluşan açıklayıcı bir geri bildirim yazın.');
  }
  if (message.length > 4000) {
    throw new HttpError(400, 'Geri bildirim mesajı en fazla 4000 karakter olabilir.');
  }

  const stmt = db.prepare(`
    INSERT INTO feedbacks (account_id, player_name, category, rating, subject, message, status)
    VALUES (?, ?, ?, ?, ?, ?, 'new')
  `);

  const info = stmt.run(accountId, playerName, category, rating, subject, message);
  const id = Number(info.lastInsertRowid);

  logActivity(db, 'create', 'feedback', id, `Beta geri bildirimi alındı: [${category}] ${subject} (${playerName})`);

  const row = db.prepare(`
    SELECT 
      id,
      account_id as accountId,
      player_name as playerName,
      category,
      rating,
      subject,
      message,
      status,
      created_at as createdAt
    FROM feedbacks
    WHERE id = ?
  `).get(id) as Record<string, unknown>;

  return {
    id: Number(row.id),
    accountId: row.accountId ? Number(row.accountId) : null,
    playerName: String(row.playerName),
    category: row.category as FeedbackCategory,
    rating: Number(row.rating),
    subject: String(row.subject),
    message: String(row.message),
    status: row.status as FeedbackItem['status'],
    createdAt: String(row.createdAt),
  };
}

export function listFeedbacks(
  db: DB,
  opts: { accountId?: number; limit?: number } = {},
): FeedbackItem[] {
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 20));
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.accountId) {
    conditions.push('account_id = ?');
    params.push(opts.accountId);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db
    .prepare(`
      SELECT 
        id,
        account_id as accountId,
        player_name as playerName,
        category,
        rating,
        subject,
        message,
        status,
        created_at as createdAt
      FROM feedbacks
      ${whereClause}
      ORDER BY id DESC
      LIMIT ?
    `)
    .all(...params, limit) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: Number(r.id),
    accountId: r.accountId ? Number(r.accountId) : null,
    playerName: String(r.playerName),
    category: r.category as FeedbackCategory,
    rating: Number(r.rating),
    subject: String(r.subject),
    message: String(r.message),
    status: r.status as FeedbackItem['status'],
    createdAt: String(r.createdAt),
  }));
}
