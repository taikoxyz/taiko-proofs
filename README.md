# TaikoProofs

Full-stack dashboard for Taiko batch proof coverage and latency.

## Projects
- `apps/web` – Next.js UI
- `apps/api` – NestJS API + indexer
- `packages/shared` – shared types

## Quickstart
1. `pnpm install`
2. `docker compose up -d` (optional local Postgres)
3. `pnpm --filter @taikoproofs/api exec prisma migrate deploy`
4. `pnpm --filter @taikoproofs/api dev`
5. `pnpm --filter @taikoproofs/web dev`

See `docs/runbook.md` for details.
