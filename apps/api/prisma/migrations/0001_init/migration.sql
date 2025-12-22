CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "BatchStatus" AS ENUM ('proposed', 'proven', 'verified');
CREATE TYPE "ProofSystem" AS ENUM ('TEE', 'SP1', 'RISC0');

CREATE TABLE "batches" (
  "batch_id" BIGINT PRIMARY KEY,
  "proposed_at" TIMESTAMPTZ NOT NULL,
  "proposed_block" BIGINT NOT NULL,
  "proposer" VARCHAR(42) NOT NULL,
  "proven_at" TIMESTAMPTZ,
  "proven_block" BIGINT,
  "proof_tx_hash" VARCHAR(66),
  "verifier_address" VARCHAR(42),
  "proof_systems" "ProofSystem"[] NOT NULL DEFAULT '{}',
  "verified_at" TIMESTAMPTZ,
  "verified_block" BIGINT,
  "status" "BatchStatus" NOT NULL DEFAULT 'proposed',
  "transition_parent_hash" VARCHAR(66),
  "transition_block_hash" VARCHAR(66),
  "transition_state_root" VARCHAR(66),
  "is_contested" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "batch_proofs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "batch_id" BIGINT NOT NULL,
  "verifier_address" VARCHAR(42) NOT NULL,
  "proof_systems" "ProofSystem"[] NOT NULL DEFAULT '{}',
  "proof_tx_hash" VARCHAR(66) NOT NULL,
  "proven_at" TIMESTAMPTZ NOT NULL,
  "proven_block" BIGINT NOT NULL,
  "transition_parent_hash" VARCHAR(66) NOT NULL,
  "transition_block_hash" VARCHAR(66) NOT NULL,
  "transition_state_root" VARCHAR(66) NOT NULL,
  "is_verified" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "batch_proofs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("batch_id") ON DELETE CASCADE
);

CREATE TABLE "daily_stats" (
  "date" DATE PRIMARY KEY,
  "proven_total" INTEGER NOT NULL DEFAULT 0,
  "zk_proven_total" INTEGER NOT NULL DEFAULT 0,
  "tee_total" INTEGER NOT NULL DEFAULT 0,
  "sp1_total" INTEGER NOT NULL DEFAULT 0,
  "risc0_total" INTEGER NOT NULL DEFAULT 0,
  "proving_avg_seconds" DOUBLE PRECISION,
  "verification_avg_seconds" DOUBLE PRECISION,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "indexing_state" (
  "chain_id" INTEGER PRIMARY KEY,
  "last_processed_block" BIGINT NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "batch_proofs_batch_id_proof_tx_hash_key" ON "batch_proofs"("batch_id", "proof_tx_hash");
CREATE INDEX "batches_proven_at_idx" ON "batches"("proven_at");
CREATE INDEX "batches_verified_at_idx" ON "batches"("verified_at");
CREATE INDEX "batch_proofs_batch_id_idx" ON "batch_proofs"("batch_id");
CREATE INDEX "batch_proofs_proven_at_idx" ON "batch_proofs"("proven_at");
