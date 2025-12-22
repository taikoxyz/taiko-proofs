import { encodeAbiParameters, encodeFunctionData } from "viem";
import { taikoInboxAbi } from "../src/chain/taikoInboxAbi";
import { ProofClassifierService } from "../src/indexer/proof-classifier.service";
import { ProofSystem } from "@taikoproofs/shared";
import { VerifierRegistryService } from "../src/indexer/verifier-registry.service";

const mockRegistry = {
  hasMappingFor: jest.fn(),
  hydrateComposeVerifier: jest.fn(),
  getSystemsFor: jest.fn()
};

describe("ProofClassifierService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("extracts proof data from proveBatches input", () => {
    const proofPayload = encodeAbiParameters(
      [
        {
          name: "subProofs",
          type: "tuple[]",
          components: [
            { name: "verifier", type: "address" },
            { name: "proof", type: "bytes" }
          ]
        }
      ],
      [[{ verifier: "0x0000000000000000000000000000000000000001", proof: "0x1234" }]]
    );

    const txInput = encodeFunctionData({
      abi: taikoInboxAbi,
      functionName: "proveBatches",
      args: ["0x", proofPayload]
    });

    const service = new ProofClassifierService(
      mockRegistry as unknown as VerifierRegistryService
    );
    const extracted = service.extractProofData(txInput);

    expect(extracted).toBe(proofPayload);
  });

  it("decodes sub-verifier addresses from proof payload", () => {
    const proofPayload = encodeAbiParameters(
      [
        {
          name: "subProofs",
          type: "tuple[]",
          components: [
            { name: "verifier", type: "address" },
            { name: "proof", type: "bytes" }
          ]
        }
      ],
      [
        [
          { verifier: "0x0000000000000000000000000000000000000001", proof: "0x" },
          { verifier: "0x0000000000000000000000000000000000000002", proof: "0x" }
        ]
      ]
    );

    const service = new ProofClassifierService(
      mockRegistry as unknown as VerifierRegistryService
    );
    const addresses = service.decodeSubVerifiers(proofPayload);

    expect(addresses).toEqual([
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000002"
    ]);
  });

  it("classifies proof systems using registry", async () => {
    mockRegistry.hasMappingFor.mockReturnValue(true);
    mockRegistry.getSystemsFor.mockReturnValue(["SP1"] as ProofSystem[]);

    const service = new ProofClassifierService(
      mockRegistry as unknown as VerifierRegistryService
    );
    const result = await service.classifyProofSystems(
      "0x0000000000000000000000000000000000000001",
      null
    );

    expect(result).toEqual(["SP1"]);
    expect(mockRegistry.hydrateComposeVerifier).not.toHaveBeenCalled();
  });
});
