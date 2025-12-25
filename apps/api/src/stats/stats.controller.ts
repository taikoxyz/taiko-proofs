import { Controller, Get, Query } from "@nestjs/common";
import { StatsService } from "./stats.service";
import { LatencyQueryDto, RangeQueryDto } from "./stats.dto";
import { parseDateRange } from "../common/date";

@Controller("stats")
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get("metadata")
  async getMetadata() {
    return this.stats.getMetadata();
  }

  @Get("zk")
  async getZkShare(@Query() query: RangeQueryDto) {
    const { startDate, endDate, endIsDateOnly } = parseDateRange(
      query.start,
      query.end,
      7
    );
    return this.stats.getZkShare(startDate, endDate, endIsDateOnly);
  }

  @Get("proof-systems")
  async getProofSystems(@Query() query: RangeQueryDto) {
    const { startDate, endDate } = parseDateRange(query.start, query.end, 7);
    return this.stats.getProofSystemUsage(startDate, endDate);
  }

  @Get("latency")
  async getLatency(@Query() query: LatencyQueryDto) {
    const { startDate, endDate, endIsDateOnly } = parseDateRange(
      query.start,
      query.end,
      7
    );
    const type = query.type ?? "proving";
    const verifiedOnly = query.verifiedOnly ? query.verifiedOnly === "true" : true;
    return this.stats.getLatency(type, startDate, endDate, endIsDateOnly, verifiedOnly);
  }
}
