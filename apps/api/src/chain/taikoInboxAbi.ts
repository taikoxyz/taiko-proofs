export const taikoInboxAbi = [
  {
    type: "event",
    name: "BatchProposed",
    inputs: [
      {
        name: "info",
        type: "tuple",
        indexed: false,
        components: [
          { name: "txsHash", type: "bytes32" },
          {
            name: "blocks",
            type: "tuple[]",
            components: [
              { name: "numTransactions", type: "uint16" },
              { name: "timeShift", type: "uint8" },
              { name: "signalSlots", type: "bytes32[]" }
            ]
          },
          { name: "blobHashes", type: "bytes32[]" },
          { name: "extraData", type: "bytes32" },
          { name: "coinbase", type: "address" },
          { name: "proposedIn", type: "uint64" },
          { name: "blobCreatedIn", type: "uint64" },
          { name: "blobByteOffset", type: "uint32" },
          { name: "blobByteSize", type: "uint32" },
          { name: "gasLimit", type: "uint32" },
          { name: "lastBlockId", type: "uint64" },
          { name: "lastBlockTimestamp", type: "uint64" },
          { name: "anchorBlockId", type: "uint64" },
          { name: "anchorBlockHash", type: "bytes32" },
          {
            name: "baseFeeConfig",
            type: "tuple",
            components: [
              { name: "adjustmentQuotient", type: "uint8" },
              { name: "sharingPctg", type: "uint8" },
              { name: "gasIssuancePerSecond", type: "uint32" },
              { name: "minGasExcess", type: "uint64" },
              { name: "maxGasIssuancePerBlock", type: "uint32" }
            ]
          }
        ]
      },
      {
        name: "meta",
        type: "tuple",
        indexed: false,
        components: [
          { name: "infoHash", type: "bytes32" },
          { name: "proposer", type: "address" },
          { name: "batchId", type: "uint64" },
          { name: "proposedAt", type: "uint64" }
        ]
      },
      { name: "txList", type: "bytes", indexed: false }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "BatchesProved",
    inputs: [
      { name: "verifier", type: "address", indexed: false },
      { name: "batchIds", type: "uint64[]", indexed: false },
      {
        name: "transitions",
        type: "tuple[]",
        indexed: false,
        components: [
          { name: "parentHash", type: "bytes32" },
          { name: "blockHash", type: "bytes32" },
          { name: "stateRoot", type: "bytes32" }
        ]
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "BatchesVerified",
    inputs: [
      { name: "batchId", type: "uint64", indexed: false },
      { name: "blockHash", type: "bytes32", indexed: false }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ConflictingProof",
    inputs: [
      { name: "batchId", type: "uint64", indexed: false },
      {
        name: "oldTran",
        type: "tuple",
        indexed: false,
        components: [
          { name: "parentHash", type: "bytes32" },
          { name: "blockHash", type: "bytes32" },
          { name: "stateRoot", type: "bytes32" },
          { name: "prover", type: "address" },
          { name: "inProvingWindow", type: "bool" },
          { name: "createdAt", type: "uint48" }
        ]
      },
      {
        name: "newTran",
        type: "tuple",
        indexed: false,
        components: [
          { name: "parentHash", type: "bytes32" },
          { name: "blockHash", type: "bytes32" },
          { name: "stateRoot", type: "bytes32" }
        ]
      }
    ],
    anonymous: false
  },
  {
    type: "function",
    name: "proveBatches",
    inputs: [
      { name: "_params", type: "bytes" },
      { name: "_proof", type: "bytes" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  }
] as const;
