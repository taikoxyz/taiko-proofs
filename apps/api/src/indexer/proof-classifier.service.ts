import { Injectable, Logger } from "@nestjs/common";
import { ProofSystem, TeeVerifier } from "@taikoproofs/shared";
import { decodeAbiParameters, decodeFunctionData } from "viem";
import { taikoInboxAbi } from "../chain/taikoInboxAbi";
import { VerifierRegistryService } from "./verifier-registry.service";

@Injectable()
export class ProofClassifierService {
  private readonly logger = new Logger(ProofClassifierService.name);

  constructor(private readonly registry: VerifierRegistryService) {}

  extractProofData(txInput: `0x${string}`): `0x${string}` | null {
    try {
      const decoded = decodeFunctionData({
        abi: taikoInboxAbi,
        data: txInput
      });

      if (decoded.functionName !== "proveBatches") {
        return null;
      }

      const args = decoded.args as [`0x${string}`, `0x${string}`];
      return args[1];
    } catch (error) {
      this.logger.warn("Failed to decode proveBatches tx input", error as Error);
      return null;
    }
  }

  decodeSubVerifiers(proofData: `0x${string}`): string[] {
    try {
      const [subProofs] = decodeAbiParameters(
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
        proofData
      );

      const verifierAddresses = (
        subProofs as readonly { verifier: string }[]
      ).map((proof) => proof.verifier);

      return verifierAddresses.filter(Boolean);
    } catch {
      return [];
    }
  }

  async classifyProof(
    verifierAddress: string,
    proofData: `0x${string}` | null
  ): Promise<{ proofSystems: ProofSystem[]; teeVerifiers: TeeVerifier[] }> {
    const normalizedVerifier = verifierAddress.toLowerCase();
    if (!this.registry.hasMappingFor(normalizedVerifier)) {
      await this.registry.hydrateComposeVerifier(verifierAddress);
    }

    const subVerifiers = proofData ? this.decodeSubVerifiers(proofData) : [];
    const addressesToCheck = subVerifiers.length
      ? subVerifiers
      : [verifierAddress];

    const systems = this.registry.getSystemsFor(addressesToCheck);
    const teeVerifiers = this.registry.getTeeVerifiersFor(addressesToCheck);

    if (!systems.length) {
      this.logger.warn(
        `No proof system mapping found for verifier(s): ${addressesToCheck.join(", ")}`
      );
    }

    return { proofSystems: systems, teeVerifiers };
  }

  async classifyProofSystems(
    verifierAddress: string,
    proofData: `0x${string}` | null
  ): Promise<ProofSystem[]> {
    const result = await this.classifyProof(verifierAddress, proofData);
    return result.proofSystems;
  }
}
