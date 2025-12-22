import { Module } from "@nestjs/common";
import { BatchesService } from "./batches.service";
import { BatchesController } from "./batches.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { AppConfigModule } from "../config/app-config.module";

@Module({
  imports: [PrismaModule, AppConfigModule],
  providers: [BatchesService],
  controllers: [BatchesController]
})
export class BatchesModule {}
