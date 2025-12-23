import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    const start = Date.now();
    console.log("[prisma] connect start");
    try {
      await this.$connect();
      console.log(`[prisma] connect ok in ${Date.now() - start}ms`);
    } catch (error) {
      console.error("[prisma] connect failed", error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
