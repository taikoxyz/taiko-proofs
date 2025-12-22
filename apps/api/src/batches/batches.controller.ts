import { BadRequestException, Controller, Get, Param, Query } from "@nestjs/common";
import { BatchesService } from "./batches.service";
import { BatchesQueryDto } from "./batches.dto";

@Controller("batches")
export class BatchesController {
  constructor(private readonly batches: BatchesService) {}

  @Get()
  async list(@Query() query: BatchesQueryDto) {
    return this.batches.listBatches(query);
  }

  @Get(":batchId")
  async getBatch(@Param("batchId") batchId: string) {
    if (!/^[0-9]+$/.test(batchId)) {
      throw new BadRequestException("batchId must be a number");
    }

    return this.batches.getBatch(batchId);
  }
}
