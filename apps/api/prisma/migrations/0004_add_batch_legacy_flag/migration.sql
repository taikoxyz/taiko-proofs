ALTER TABLE "batches" ADD COLUMN "is_legacy" BOOLEAN NOT NULL DEFAULT false;

UPDATE "batches"
SET "is_legacy" = true
WHERE "status" = 'verified'
  AND "proposer" = '0x0000000000000000000000000000000000000000'
  AND "proof_tx_hash" IS NULL;
