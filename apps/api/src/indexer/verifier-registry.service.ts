import { Injectable, Logger } from "@nestjs/common";
import fs from "fs";
import path from "path";
import { ProofSystem } from "@taikoproofs/shared";
import { AppConfigService } from "../config/app-config.service";
import { ChainService } from "../chain/chain.service";
import { composeVerifierAbi } from "../chain/composeVerifierAbi";

interface VerifierConfigFile {
  tee?: string[];
  sp1?: string[];
  risc0?: string[];
}

@Injectable()
export class VerifierRegistryService {
  private readonly logger = new Logger(VerifierRegistryService.name);
  private readonly mapping: Record<ProofSystem, Set<string>> = {
    TEE: new Set(),
    SP1: new Set(),
    RISC0: new Set()
  };
  private readonly composeCache = new Set<string>();

  constructor(
    private readonly config: AppConfigService,
    private readonly chain: ChainService
  ) {
    this.loadFromFile();
  }

  private normalize(address: string): string {
    return address.toLowerCase();
  }

  private addAddresses(system: ProofSystem, addresses: string[] | undefined) {
    if (!addresses) {
      return;
    }

    for (const address of addresses) {
      if (!address) {
        continue;
      }

      this.mapping[system].add(this.normalize(address));
    }
  }

  private loadFromFile() {
    const defaultPath = path.resolve(__dirname, "../config/verifiers.json");
    const filePath = this.config.verifierConfigPath || defaultPath;

    if (!fs.existsSync(filePath)) {
      this.logger.warn(`Verifier config not found at ${filePath}`);
      return;
    }

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw) as VerifierConfigFile;
      this.addAddresses("TEE", parsed.tee);
      this.addAddresses("SP1", parsed.sp1);
      this.addAddresses("RISC0", parsed.risc0);
    } catch (error) {
      this.logger.warn("Failed to read verifier config", error as Error);
    }
  }

  hasMappingFor(address: string): boolean {
    const normalized = this.normalize(address);
    return (
      this.mapping.TEE.has(normalized) ||
      this.mapping.SP1.has(normalized) ||
      this.mapping.RISC0.has(normalized)
    );
  }

  getSystemsFor(addresses: string[]): ProofSystem[] {
    const systems = new Set<ProofSystem>();

    for (const address of addresses) {
      const normalized = this.normalize(address);
      if (this.mapping.TEE.has(normalized)) {
        systems.add("TEE");
      }
      if (this.mapping.SP1.has(normalized)) {
        systems.add("SP1");
      }
      if (this.mapping.RISC0.has(normalized)) {
        systems.add("RISC0");
      }
    }

    return Array.from(systems);
  }

  async hydrateComposeVerifier(verifierAddress: string): Promise<void> {
    const normalized = this.normalize(verifierAddress);
    if (this.composeCache.has(normalized)) {
      return;
    }

    try {
      const client = this.chain.getClient();
      const [sgxGeth, tdxGeth, sgxReth, risc0Reth, sp1Reth] =
        await Promise.all([
          client.readContract({
            address: verifierAddress as `0x${string}`,
            abi: composeVerifierAbi,
            functionName: "sgxGethVerifier"
          }),
          client.readContract({
            address: verifierAddress as `0x${string}`,
            abi: composeVerifierAbi,
            functionName: "tdxGethVerifier"
          }),
          client.readContract({
            address: verifierAddress as `0x${string}`,
            abi: composeVerifierAbi,
            functionName: "sgxRethVerifier"
          }),
          client.readContract({
            address: verifierAddress as `0x${string}`,
            abi: composeVerifierAbi,
            functionName: "risc0RethVerifier"
          }),
          client.readContract({
            address: verifierAddress as `0x${string}`,
            abi: composeVerifierAbi,
            functionName: "sp1RethVerifier"
          })
        ]);

      this.addAddresses("TEE", [sgxGeth, tdxGeth, sgxReth]);
      this.addAddresses("RISC0", [risc0Reth]);
      this.addAddresses("SP1", [sp1Reth]);
      this.composeCache.add(normalized);
    } catch (error) {
      this.logger.debug(
        `Verifier ${verifierAddress} does not appear to be a ComposeVerifier`
      );
      this.composeCache.add(normalized);
    }
  }
}
