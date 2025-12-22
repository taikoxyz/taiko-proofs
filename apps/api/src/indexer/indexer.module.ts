import { Module } from "@nestjs/common";
import { IndexerService } from "./indexer.service";
import { IndexerController } from "./indexer.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { ChainModule } from "../chain/chain.module";
import { AppConfigModule } from "../config/app-config.module";
import { ProofClassifierService } from "./proof-classifier.service";
import { VerifierRegistryService } from "./verifier-registry.service";
import { StatsModule } from "../stats/stats.module";

@Module({
  imports: [PrismaModule, ChainModule, AppConfigModule, StatsModule],
  providers: [IndexerService, ProofClassifierService, VerifierRegistryService],
  controllers: [IndexerController]
})
export class IndexerModule {}
