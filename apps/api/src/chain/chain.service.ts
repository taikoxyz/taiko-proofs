import { Injectable } from "@nestjs/common";
import { createPublicClient, http, PublicClient } from "viem";
import { AppConfigService } from "../config/app-config.service";

@Injectable()
export class ChainService {
  private client: PublicClient;

  constructor(private readonly config: AppConfigService) {
    this.client = createPublicClient({
      transport: http(this.config.rpcUrl)
    });
  }

  getClient(): PublicClient {
    return this.client;
  }
}
