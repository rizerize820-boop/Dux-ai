# Dux AI Cloudflare Worker

This folder is a separate Cloudflare Worker API. It does not build or deploy the Expo app.

## Deploy with Cloudflare Workers Builds

Set the repository build settings to:

- Root directory: `worker`
- Build command: leave empty
- Deploy command: `npx wrangler deploy`

Wrangler uses `wrangler.toml` in this folder. The `[ai]` binding exposes Cloudflare Workers AI as `env.AI`.

## Local development

From this folder:

```sh
npm install
npm run dev
```

## Routes

- `GET /health` — service health check.
- `POST /api/image` — generates an image with FLUX Schnell.

Example request:

```sh
curl -X POST http://localhost:8787/api/image \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"A small robot exploring a neon city at night"}' \
  --output image.jpg
```

## Before public release

The starter endpoint currently has permissive CORS and no user authentication or per-user quota. Add abuse protection, authentication, and usage limits before exposing it publicly. Do not put provider API keys in the Expo app or commit them to Git.

Video generation and text-to-speech are not wired yet: providers have different asynchronous job and media-download APIs, so those routes should be implemented against the provider actually selected for Dux AI. Workers AI availability and account limits depend on the Cloudflare account.
