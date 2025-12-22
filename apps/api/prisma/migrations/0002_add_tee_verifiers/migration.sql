ALTER TABLE "batches"
ADD COLUMN "tee_verifiers" TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE "batch_proofs"
ADD COLUMN "tee_verifiers" TEXT[] NOT NULL DEFAULT '{}';
