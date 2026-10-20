// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import { loadEnv } from 'vite';

const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');

// https://astro.build/config
export default defineConfig({
  site: env.PUBLIC_SITE_URL || 'https://portfolio-fadi.pages.dev',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  prefetch: { defaultStrategy: 'hover' },
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Big Shoulders',
      cssVariable: '--font-display',
      weights: ['300 900'],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['Impact', 'sans-serif'],
    },
    {
      provider: fontProviders.google(),
      name: 'Instrument Serif',
      cssVariable: '--font-serif',
      weights: [400],
      styles: ['italic'],
      subsets: ['latin'],
      fallbacks: ['Georgia', 'serif'],
    },
    {
      provider: fontProviders.google(),
      name: 'Geist',
      cssVariable: '--font-sans',
      weights: ['300 600'],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['ui-sans-serif', 'system-ui', 'sans-serif'],
    },
    {
      provider: fontProviders.google(),
      name: 'Geist Mono',
      cssVariable: '--font-mono',
      weights: [400, 500],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['ui-monospace', 'monospace'],
    },
  ],
});
