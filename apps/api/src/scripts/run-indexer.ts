import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { IndexerService } from "../indexer/indexer.service";

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"]
  });

  const indexer = app.get(IndexerService);
  const result = await indexer.runIndexing();
  // eslint-disable-next-line no-console
  console.log(result);
  await app.close();
}

run();
