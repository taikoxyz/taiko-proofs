import { Injectable } from "@nestjs/common";
import { createPublicClient, http, PublicClient, webSocket } from "viem";
import { AppConfigService } from "../config/app-config.service";

function rpcTransport(rpcUrl: string) {
  const url = new URL(rpcUrl);
  if (url.protocol === "ws:" || url.protocol === "wss:") {
    return webSocket(rpcUrl);
  }

  if (url.protocol === "http:" || url.protocol === "https:") {
    return http(rpcUrl);
  }

  throw new Error(`RPC_URL must use http(s) or ws(s), got protocol "${url.protocol}"`);
}

@Injectable()
export class ChainService {
  private client: PublicClient;

  constructor(private readonly config: AppConfigService) {
    this.client = createPublicClient({
      transport: rpcTransport(this.config.rpcUrl)
    });
  }

  getClient(): PublicClient {
    return this.client;
  }
}
