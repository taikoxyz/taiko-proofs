import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppConfigModule } from "./config/app-config.module";
import { PrismaModule } from "./prisma/prisma.module";
import { BatchesModule } from "./batches/batches.module";
import { StatsModule } from "./stats/stats.module";
import { IndexerModule } from "./indexer/indexer.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AppConfigModule,
    PrismaModule,
    BatchesModule,
    StatsModule,
    IndexerModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
