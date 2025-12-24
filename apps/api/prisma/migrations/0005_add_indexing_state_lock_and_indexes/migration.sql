ALTER TABLE "indexing_state"
ADD COLUMN "lock_id" UUID,
ADD COLUMN "lock_expires_at" TIMESTAMPTZ,
ADD COLUMN "last_run_started_at" TIMESTAMPTZ,
ADD COLUMN "last_run_finished_at" TIMESTAMPTZ,
ADD COLUMN "last_run_status" TEXT,
ADD COLUMN "last_run_error" TEXT;

CREATE INDEX "batches_proposed_at_idx" ON "batches"("proposed_at");
CREATE INDEX "batches_proven_block_idx" ON "batches"("proven_block");
CREATE INDEX "batches_verified_block_idx" ON "batches"("verified_block");
CREATE INDEX "batches_proof_systems_idx" ON "batches" USING GIN("proof_systems");
CREATE INDEX "batches_tee_verifiers_idx" ON "batches" USING GIN("tee_verifiers");
CREATE INDEX "batch_proofs_proven_block_idx" ON "batch_proofs"("proven_block");
