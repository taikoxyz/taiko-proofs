# TaikoProofs Runbook

## Local setup
1. Copy envs:
   - `apps/api/.env.example` -> `apps/api/.env`
   - `apps/web/.env.example` -> `apps/web/.env`
2. (Optional) Start Postgres via Docker:
   - `cp .env.example .env`
   - `docker compose up -d`
   - Default port is `5433`, update `DATABASE_URL` if you change it.
3. Ensure Postgres is running and `DATABASE_URL` is correct.
4. Install deps: `pnpm install` from `taikoproofs/`.
5. Run migrations: `pnpm --filter @taikoproofs/api exec prisma migrate deploy`.
6. Start dev servers:
   - API: `pnpm --filter @taikoproofs/api dev`
   - Web: `pnpm --filter @taikoproofs/web dev`

## Indexing
- One-off indexer run: `pnpm --filter @taikoproofs/api indexer`
- Vercel cron will call `GET /admin/index` every 10 minutes.
- Batches verified before `START_BLOCK` are stored as verified-only and may show limited details.

## Vercel setup
- Create two projects with explicit roots:
  - Web root: `apps/web`
  - API root: `apps/api` (keeps `vercel.json` + `api/` at project root)
- Web build command: `pnpm --filter @taikoproofs/web build`
- API build command: `pnpm --filter @taikoproofs/shared build && pnpm --filter @taikoproofs/api build`
- Run Prisma migrations outside Vercel builds (e.g. `db-migrate` workflow or `pnpm --filter @taikoproofs/api exec prisma migrate deploy`).

## Verifier mapping
- Update verifier mapping via JSON file and set `VERIFIER_CONFIG_PATH`.
- Format:
  ```json
  {"tee": ["0x..."], "sp1": ["0x..."], "risc0": ["0x..."]}
  ```

## Troubleshooting
- If batches show empty proof systems, verify the address mapping and RPC health.
- If latency metrics are empty, ensure `proposed_at` and `proven_at` are populated.
