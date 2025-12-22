export const composeVerifierAbi = [
  {
    type: "function",
    name: "sgxGethVerifier",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "tdxGethVerifier",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "sgxRethVerifier",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "risc0RethVerifier",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "sp1RethVerifier",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view"
  }
] as const;
