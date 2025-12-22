import { Controller, Get, Post } from "@nestjs/common";
import { IndexerService } from "./indexer.service";

@Controller("admin")
export class IndexerController {
  constructor(private readonly indexer: IndexerService) {}

  @Post("index")
  async index() {
    return this.indexer.runIndexing();
  }

  @Get("index")
  async indexGet() {
    return this.indexer.runIndexing();
  }
}
