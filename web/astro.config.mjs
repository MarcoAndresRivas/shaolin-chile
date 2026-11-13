// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// GitHub Pages serves the project under /<repo>/. Override with BASE_PATH
// when the site moves to its own domain (BASE_PATH=/).
const base = process.env.BASE_PATH ?? '/shaolin-chile';

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://marcoandresrivas.github.io',
  base,
  trailingSlash: 'ignore',
  integrations: [react()],
});
