import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** T1-16 职业列表查询 */
export class ListCareerQueryDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

/** T1-16 推荐查询（可选指定报告） */
export class RecommendQueryDto {
  @IsOptional()
  @IsString()
  reportId?: string;
}

/** T1-16 检索查询 */
export class SearchCareerQueryDto {
  @IsString()
  keyword!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}