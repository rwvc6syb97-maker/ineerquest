import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * L-P0-1 报告人话翻译入参（POST /api/v1/ai/report/plain-talk）。
 * 后端二次校验：reportId 必填、tone 仅限白名单、sectionKey 长度上限。
 * 严禁写入报告本体表——仅只读取报告文本喂 LLM。
 */
export class PlainTalkDto {
  @ApiProperty({ description: '报告 id（GET /reports/:id 返回的 id）', example: '10086' })
  @IsString()
  @IsNotEmpty({ message: 'reportId 不能为空' })
  @MaxLength(32, { message: 'reportId 超长' })
  reportId!: string;

  @ApiPropertyOptional({
    description: '翻译语气：warm 温暖鼓励 / plain 平实直白 / pro 专业理性，缺省 warm',
    enum: ['warm', 'plain', 'pro'],
    default: 'warm',
  })
  @IsOptional()
  @IsIn(['warm', 'plain', 'pro'], { message: 'tone 仅支持 warm/plain/pro' })
  tone?: 'warm' | 'plain' | 'pro';

  @ApiPropertyOptional({
    description: '仅翻译指定章节（sectionKey）；缺省翻译整份报告可见章节',
    example: 'strengths',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: 'sectionKey 超长' })
  sectionKey?: string;
}

/** 报告人话翻译出参。 */
export class PlainTalkVo {
  @ApiProperty({ description: '人话版解读文本', example: '简单说，你是个天生的规划者……' })
  plainText!: string;

  @ApiProperty({ description: '是否走了降级兜底（LLM 失败/超时时为 true）', example: false })
  degraded!: boolean;

  @ApiPropertyOptional({ description: '降级原因（degraded=true 时给出）', example: 'provider_error' })
  degradeReason?: string;
}