import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app.ts';
import { openDatabase } from '../server/db.ts';

describe('public launcher patch channel', () => {
  it('serves manifests without caching, immutable blobs, and never SPA HTML for missing files', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kale2-patch-api-'));
    const patchDir = path.join(directory, 'patches');
    fs.mkdirSync(path.join(patchDir, 'windows'), { recursive: true });
    fs.mkdirSync(path.join(patchDir, 'blobs'));
    fs.writeFileSync(path.join(patchDir, 'windows/manifest.json'), JSON.stringify({ format: 1 }));
    fs.writeFileSync(path.join(patchDir, 'blobs', 'a'.repeat(64)), 'fixture');
    const db = openDatabase(':memory:');
    try {
      const app = createApp({ db, uploadDir: path.join(directory, 'uploads'), patchDir, auth: { username: 'admin', password: 'test', secret: 'test', secureCookie: false } });
      const manifest = await request(app).get('/patches/windows/manifest.json').expect(200);
      expect(manifest.body.format).toBe(1);
      expect(manifest.headers['cache-control']).toBe('no-cache');
      const blob = await request(app).get(`/patches/blobs/${'a'.repeat(64)}`).expect(200);
      expect(blob.headers['cache-control']).toContain('immutable');
      await request(app).get('/patches/windows/missing.json').expect(404).expect('Content-Type', /json/);
      await request(app).get('/patches/').expect(404);
    } finally { db.close(); }
  });
});
