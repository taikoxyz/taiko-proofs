import { Transform } from "class-transformer";
import { IsISO8601, IsIn, IsInt, IsOptional, Min } from "class-validator";
import { BatchStatus, ProofSystem } from "@taikoproofs/shared";

const batchStatusValues: BatchStatus[] = ["proposed", "proven", "verified"];
const proofSystemValues: ProofSystem[] = ["TEE", "SP1", "RISC0"];

export class BatchesQueryDto {
  @IsOptional()
  @IsIn(batchStatusValues)
  status?: BatchStatus;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string" ? value.split(",").filter(Boolean) : value
  )
  @IsIn(proofSystemValues, { each: true })
  system?: ProofSystem[];

  @IsOptional()
  search?: string;

  @IsOptional()
  @IsISO8601()
  start?: string;

  @IsOptional()
  @IsISO8601()
  end?: string;

  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  pageSize?: number;
}
