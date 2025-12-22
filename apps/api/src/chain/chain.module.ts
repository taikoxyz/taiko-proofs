import { Module } from "@nestjs/common";
import { ChainService } from "./chain.service";
import { AppConfigModule } from "../config/app-config.module";

@Module({
  imports: [AppConfigModule],
  providers: [ChainService],
  exports: [ChainService]
})
export class ChainModule {}
