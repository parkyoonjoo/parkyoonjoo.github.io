import { defineConfig } from 'astro/config';

// GitHub Pages(프로젝트 주소)에서는 SITE_BASE=/저장소이름 으로 빌드합니다. Vercel은 비워 둡니다.
export default defineConfig({
  site: process.env.SITE_URL || undefined,
  base: process.env.SITE_BASE || '/',
  trailingSlash: 'ignore',
  devToolbar: { enabled: false },
});
