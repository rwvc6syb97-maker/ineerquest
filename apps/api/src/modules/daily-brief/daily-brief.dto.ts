import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** §4.3 获取日报查询参数（GET /ai/daily-brief）。 */
export class DailyBriefQueryDto {
  @ApiPropertyOptional({ description: '日期 YYYY-MM-DD，缺省今日', example: '2026-07-12' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date 格式须为 YYYY-MM-DD' })
  date?: string;
}

/** 日报条目。 */
export class DailyBriefItemVo {
  @ApiProperty({ description: '标题' })
  title!: string;

  @ApiProperty({ description: '摘要' })
  summary!: string;

  @ApiPropertyOptional({ description: '关联职业 ID' })
  careerId?: string;
}

/** 日报返回。 */
export class DailyBriefVo {
  @ApiProperty({ description: '日报 ID' })
  briefId!: string;

  @ApiProperty({ description: '日期 YYYY-MM-DD' })
  date!: string;

  @ApiProperty({ type: [DailyBriefItemVo] })
  items!: DailyBriefItemVo[];
}

/** §4.3 订阅设置入参（PUT /ai/daily-brief/subscription）。 */
export class SubscriptionUpdateDto {
  @ApiProperty({ description: '是否开启订阅' })
  @IsBoolean({ message: 'enabled 须为布尔' })
  enabled!: boolean;

  @ApiProperty({ description: '订阅品类', type: [String], example: ['互联网', '金融'] })
  @IsArray({ message: 'categories 须为数组' })
  @IsString({ each: true, message: 'categories 元素须为字符串' })
  @MaxLength(32, { each: true, message: 'categories 元素超长' })
  categories!: string[];
}

/** 订阅设置返回。 */
export class SubscriptionVo {
  @ApiProperty({ description: '是否开启' })
  enabled!: boolean;

  @ApiProperty({ description: '订阅品类', type: [String] })
  categories!: string[];
}