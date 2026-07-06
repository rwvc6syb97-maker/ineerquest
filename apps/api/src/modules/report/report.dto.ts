import { IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

/** T1-14 生成报告请求：基于某次测评结果 */
export class GenerateReportDto {
  /** 测评记录 id（record_id） */
  @IsString()
  recordId!: string;
}

/** T1-15 查询报告章节参数（可指定 sectionKey 以触发付费段解锁校验） */
export class GetReportQueryDto {
  @IsOptional()
  @IsString()
  sectionKey?: string;
}

/** T1-17 生成分享请求 */
export class CreateShareDto {
  /** 分享渠道（1=微信 2=朋友圈 3=微博 …），可选 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  channel?: number;
}