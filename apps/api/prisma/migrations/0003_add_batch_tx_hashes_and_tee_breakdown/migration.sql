ALTER TABLE "batches"
ADD COLUMN "proposed_tx_hash" VARCHAR(66),
ADD COLUMN "verified_tx_hash" VARCHAR(66);

ALTER TABLE "daily_stats"
ADD COLUMN "tee_sgx_geth_total" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "tee_sgx_reth_total" INTEGER NOT NULL DEFAULT 0;
