/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Hero MP4 — Cloudflare R2 public URL veya site içi yol (ör. /assets/hero.mp4) */
  readonly VITE_HERO_VIDEO_URL?: string;
  readonly VITE_HERO_VIDEO_POSTER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
