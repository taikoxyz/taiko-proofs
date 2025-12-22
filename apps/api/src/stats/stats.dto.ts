import { IsIn, IsISO8601, IsOptional, IsBooleanString } from "class-validator";

export class RangeQueryDto {
  @IsOptional()
  @IsISO8601()
  start?: string;

  @IsOptional()
  @IsISO8601()
  end?: string;
}

export class LatencyQueryDto extends RangeQueryDto {
  @IsOptional()
  @IsIn(["proving", "verification"])
  type?: "proving" | "verification";

  @IsOptional()
  @IsBooleanString()
  verifiedOnly?: string;
}
