# Fadi Zakharia · portfolio

Personal portfolio for Fadi Zakharia. Astro 7, static output, with a three.js
particle field, a scroll-drawn circuit trace and GSAP scroll motion.

## Content

Everything comes from the madebyfn Sanity project (`nfwf1z6i/production`).
The site shows the projects whose **Developers** field includes
`developer-fadi-zakharia`, and the profile, bio, skills and portrait from that
developer document. Edit them in the madebyfn Studio (`/admin` on
madebyfn.dev), then rebuild this site. The dataset is public, so builds need
no token.

## Commands

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs dist/
npm run check
```

## Environment (all optional)

| Variable | Default |
| --- | --- |
| `PUBLIC_SANITY_PROJECT_ID` | `nfwf1z6i` |
| `PUBLIC_SANITY_DATASET` | `production` |
| `PUBLIC_SITE_URL` | `https://portfolio-fadi.pages.dev` |
| `PUBLIC_CONTACT_EMAIL` | `fadi.zakharia.qatar@gmail.com` |

## Hosting on Cloudflare Pages

Framework preset **Astro**, build command `npm run build`, output directory
`dist`, environment variable `NODE_VERSION=22`. To rebuild when content
changes, create a Deploy Hook in Pages and add it as a webhook in Sanity
(manage.sanity.io → API → Webhooks).

## Motion

`src/scripts/scene.ts` holds the particle field: four target shapes (core,
orbit, lattice, singularity) blended in the vertex shader by `uMorph`. Each
section sets its shape with `data-morph`. `src/scripts/motion.ts` drives smooth
scroll, the trace through `[data-trace]` anchors, the HUD, text decoding and
the pinned work gallery. Everything falls back to a static, readable page
under `prefers-reduced-motion` or without WebGL.
