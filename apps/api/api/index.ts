import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ExpressAdapter } from "@nestjs/platform-express";
import serverless from "serverless-http";
import express from "express";
import { AppModule } from "../src/app.module";

const expressApp = express();
let cachedHandler: serverless.Handler | null = null;

function hostFromUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).host;
  } catch {
    return "invalid";
  }
}

function logEnvSummary() {
  console.log("[bootstrap] env summary", {
    nodeEnv: process.env.NODE_ENV ?? "unset",
    vercelEnv: process.env.VERCEL_ENV ?? "unset",
    region: process.env.VERCEL_REGION ?? "unset",
    databaseHost: hostFromUrl(process.env.DATABASE_URL),
    rpcHost: hostFromUrl(process.env.RPC_URL),
    chainId: process.env.CHAIN_ID ?? "unset",
    taikoInboxAddressSet: Boolean(process.env.TAIKO_INBOX_ADDRESS),
    verifierConfigPathSet: Boolean(process.env.VERIFIER_CONFIG_PATH)
  });
}

async function bootstrap(): Promise<serverless.Handler> {
  const start = Date.now();
  logEnvSummary();
  console.log("[bootstrap] starting Nest app");

  try {
    const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
      logger: ["error", "warn"]
    });

    app.enableCors();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true
      })
    );

    console.log("[bootstrap] initializing Nest app");
    await app.init();
    console.log(`[bootstrap] Nest app ready in ${Date.now() - start}ms`);
    return serverless(expressApp);
  } catch (error) {
    console.error("[bootstrap] Nest app failed to initialize", error);
    throw error;
  }
}

export default async function handler(req: express.Request, res: express.Response) {
  if (!cachedHandler) {
    cachedHandler = await bootstrap();
  }

  return cachedHandler(req, res);
}
