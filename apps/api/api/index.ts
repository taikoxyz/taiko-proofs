import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ExpressAdapter } from "@nestjs/platform-express";
import serverless from "serverless-http";
import express from "express";
import { AppModule } from "../src/app.module";

const expressApp = express();
let cachedHandler: serverless.Handler | null = null;

async function bootstrap(): Promise<serverless.Handler> {
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

  await app.init();
  return serverless(expressApp);
}

export default async function handler(req: express.Request, res: express.Response) {
  if (!cachedHandler) {
    cachedHandler = await bootstrap();
  }

  return cachedHandler(req, res);
}
