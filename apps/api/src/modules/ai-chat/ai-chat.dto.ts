import { IsInt, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ConversationScene } from './ai-chat.constants';

/** T3-04 创建会话请求。 */
export class CreateConversationDto {
  /** 场景：1 报告解读 2 职业咨询 3 自由对话（默认 3）。 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([ConversationScene.REPORT, ConversationScene.CAREER, ConversationScene.FREE])
  scene?: number;

  /** 关联业务类型：1 报告 2 职业。 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  bizType?: number;

  /** 关联业务 ID。 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  bizId?: number;

  /** 会话标题（可选，缺省取首条消息摘要）。 */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  title?: string;
}

/** T3-05 发送消息请求。 */
export class SendMessageDto {
  /** 本轮用户消息内容。 */
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;
}