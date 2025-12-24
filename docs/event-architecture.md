# Pacaya TaikoInbox Events for Off-Chain Tracking

This document describes the important TaikoInbox events for **proposals**, **proofs**, and
**verification** (finalization), and what to extract from **events** vs **function calldata**.

Scope: Pacaya (batch-based) flow on L1 TaikoInbox.
Authoritative definitions: `packages/protocol/contracts/layer1/based/ITaikoInbox.sol`.

## Event overview (what to monitor)

1) Proposal:
   - `BatchProposed(BatchInfo info, BatchMetadata meta, bytes txList)`
2) Proofs:
   - `BatchesProved(address verifier, uint64[] batchIds, Transition[] transitions)`
   - `ConflictingProof(uint64 batchId, TransitionState oldTran, Transition newTran)` (optional but important)
3) Verification (finalization):
   - `BatchesVerified(uint64 batchId, bytes32 blockHash)`

## Structs used in calldata (ABI decoding targets)

These are the logical shapes of data encoded in function calldata. They are required to
decode `_params` for `proposeBatch` and `proveBatches`.

```text
BatchParams {
  address proposer
  address coinbase
  bytes32 parentMetaHash
  uint64 anchorBlockId
  uint64 lastBlockTimestamp
  bool revertIfNotFirstProposal
  BlobParams blobParams
  BlockParams[] blocks
}

BlobParams {
  bytes32[] blobHashes
  uint8 firstBlobIndex
  uint8 numBlobs
  uint32 byteOffset
  uint32 byteSize
  uint64 createdIn
}

BlockParams {
  uint16 numTransactions
  uint8 timeShift
  bytes32[] signalSlots
}

BatchMetadata {
  bytes32 infoHash
  address proposer
  uint64 batchId
  uint64 proposedAt
}

Transition {
  bytes32 parentHash
  bytes32 blockHash
  bytes32 stateRoot
}
```

## Proposal: BatchProposed

Emitted by `proposeBatch(bytes _params, bytes _txList)`.

### Extract from the event
- `meta.batchId` (primary batch identifier)
- `meta.proposedAt` (proposal timestamp)
- `meta.proposer`
- `meta.infoHash` (hash of `BatchInfo`)
- `info.blocks[]` (numTransactions, timeShift, signalSlots)
- `info.blobHashes` (resolved blob hashes used for DA)
- `info.txsHash` (hash of `_txList` + blob hashes)
- `info.anchorBlockId`, `info.anchorBlockHash`
- `info.lastBlockId`, `info.lastBlockTimestamp`
- `info.proposedIn` (L1 block number)
- `info.blobCreatedIn`, `info.blobByteOffset`, `info.blobByteSize`
- `info.coinbase`, `info.gasLimit`, `info.baseFeeConfig`
- `txList` (raw calldata tx list; may be empty if using blobs)

The event contains almost everything you need for batch construction.

### Extract from calldata (optional but sometimes important)
Decode `_params` as `BatchParams` to get fields that are **not** emitted:
- `parentMetaHash` (chain continuity check during proposal)
- `revertIfNotFirstProposal` (proposal gating)
- `blobParams.firstBlobIndex` and `blobParams.numBlobs` (only needed if you want to
  reconstruct the original call; the event already includes `blobHashes`)
- `blobParams.blobHashes` (raw input; event contains resolved hashes)

## Proofs: BatchesProved

Emitted by `proveBatches(bytes _params, bytes _proof)`.

### Extract from the event
- `verifier` (verifier contract address)
- `batchIds[]` (batches whose transitions were proved)
- `transitions[]` with:
  - `parentHash`
  - `blockHash`
  - `stateRoot`

The event is enough to track that a batch has a proved transition.

### Extract from calldata (required if you need metadata or proof bytes)
Decode `_params` as `(BatchMetadata[] metas, Transition[] transitions)`:
- `metas[]` **are not emitted** and include:
  - `infoHash` (matches `BatchProposed.meta.infoHash`)
  - `proposer`
  - `batchId`
  - `proposedAt`
- `_proof` contains the aggregated proof bytes (only needed if you store or verify proofs).

Indexing rule: `metas[i]` and `transitions[i]` correspond to `batchIds[i]` in the event.

### How to decode `_proof` (MainnetVerifier)

`MainnetVerifier` inherits `ComposeVerifier`, which expects `_proof` to be an ABI-encoded
array of sub-proofs:

```text
SubProof {
  address verifier
  bytes proof
}
```

Decoding rule:

```text
SubProof[] subProofs = abi.decode(_proof, (SubProof[]));
```

Each `subProof.verifier` is called with the same `_ctxs` and its corresponding `subProof.proof`.

Mainnet-specific constraints (enforced in `MainnetVerifier`):
- There must be **exactly 2** sub-proofs.
- One verifier must be `sgxGethVerifier`.
- The other must be one of: `sgxRethVerifier`, `risc0RethVerifier`, or `sp1RethVerifier`.
- Verifiers must be strictly **ascending by address** in the array.

These constraints determine the encoding order and the accepted proof combinations.

### Optional: ConflictingProof

If a conflicting transition is submitted, `ConflictingProof` is emitted and the
contract is paused. You may want to alert on this or flag affected batches.

Extract from the event:
- `batchId`
- `oldTran` (prior transition)
- `newTran` (conflicting transition)

No additional calldata is required beyond what you already decode for `proveBatches`.

## Verification: BatchesVerified

Emitted when `_verifyBatches` advances verification.
This can happen after **propose**, after **prove**, or via **verifyBatches**.

### Extract from the event
- `batchId` (the **last** verified batch in this transaction)
- `blockHash` (hash of the last verified batch)

### How to mark all batches verified in this tx

Verification always advances **sequentially** from `lastVerifiedBatchId + 1` and stops
at the first gap. Therefore, all batches verified in a transaction form a **contiguous
range**. You do **not** need to re-check parent hashes off-chain.

Pseudo-code:

```text
on BatchesVerified(event):
    new_last = event.batchId
    prev_last = load_last_verified_batch_id(chain_id)

    if new_last <= prev_last:
        return

    for batch_id in range(prev_last + 1, new_last + 1):
        mark_batch_verified(batch_id, event.tx_hash, event.block_number, event.block_time)

    save_last_verified_batch_id(chain_id, new_last)
```

### Calldata
`verifyBatches(uint64 _length)` has no additional data needed for verification tracking.
You may parse `_length` for debugging or analytics only.

## Minimal monitoring checklist

- Always monitor `BatchProposed`, `BatchesProved`, and `BatchesVerified` from the TaikoInbox.
- Parse calldata only when you need fields **not emitted** (notably `BatchMetadata` for
  proofs, and `parentMetaHash` for proposals).
- Use `BatchesVerified` plus your last known verified batch to mark the full range
  verified in that transaction.
