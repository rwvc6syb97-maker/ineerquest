import { IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { RATING_MAX, RATING_MIN } from './coaching.constants';

/** T4-01 辅导师列表查询：分页 + 关键词/专长筛选。 */
export class ListCoachesDto {
  /** 页码，从 1 开始，默认 1 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /** 每页条数，默认 10，最大 50 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;

  /** 姓名 / 头衔关键词模糊筛选 */
  @IsOptional()
  @IsString()
  keyword?: string;

  /** 专长标签筛选（命中 expertise 数组任一） */
  @IsOptional()
  @IsString()
  expertise?: string;
}

/** T4-02 辅导预约下单：锁定指定辅导师的指定排期时段。 */
export class BookCoachingDto {
  /** 辅导师 id */
  @IsString()
  coachId!: string;

  /** 排期时段 id（coach_schedule.id） */
  @IsString()
  scheduleId!: string;

  /** 咨询形式：1文字 2语音 3视频，默认 1 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  consultType?: number;
}

/** T4-04 咨询评价请求。 */
export class ReviewCoachingDto {
  /** 评分（1~5 星） */
  @Type(() => Number)
  @IsInt()
  @Min(RATING_MIN)
  @Max(RATING_MAX)
  rating!: number;

  /** 评价文字内容（可选） */
  @IsOptional()
  @IsString()
  content?: string;

  /** 评价标签（可选） */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  /** 是否匿名评价，默认否 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  isAnonymous?: number;
}