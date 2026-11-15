// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// GitHub Pages serves the project under /<repo>/; Vercel (which sets VERCEL
// while it builds) serves it at the root of its domain. BASE_PATH and
// SITE_URL override both.
const onVercel = Boolean(process.env.VERCEL);
const base = process.env.BASE_PATH ?? (onVercel ? '/' : '/shaolin-chile');
const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;

export default defineConfig({
  site: process.env.SITE_URL ?? (onVercel && vercelUrl ? `https://${vercelUrl}` : 'https://marcoandresrivas.github.io'),
  base,
  trailingSlash: 'ignore',
  integrations: [react()],
});
