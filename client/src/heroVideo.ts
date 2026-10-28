/** Anasayfa hero videosu — build sırasında VITE_HERO_VIDEO_URL ile Cloudflare R2 / CDN bağlanır. */
export const HERO_VIDEO_SRC = (import.meta.env.VITE_HERO_VIDEO_URL || '/assets/hero.mp4').trim();
export const HERO_VIDEO_POSTER = (import.meta.env.VITE_HERO_VIDEO_POSTER || '/assets/campaign/hero.webp').trim();
