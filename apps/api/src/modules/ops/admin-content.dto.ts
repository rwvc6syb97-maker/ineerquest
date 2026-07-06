import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** T4-16 内容管理 DTO：职业库 / 学习资源库 CRUD。 */

export class CreateCareerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  careerCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  category!: string;

  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() responsibility?: string;
  @IsOptional() @IsInt() salaryMin?: number;
  @IsOptional() @IsInt() salaryMax?: number;
  @IsOptional() @IsString() prospect?: string;
  @IsOptional() @IsString() @MaxLength(128) suitTypes?: string;
  @IsOptional() @IsInt() @IsIn([0, 1]) status?: number;
}

export class UpdateCareerDto {
  @IsOptional() @IsString() @MaxLength(64) name?: string;
  @IsOptional() @IsString() @MaxLength(32) category?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() responsibility?: string;
  @IsOptional() @IsInt() salaryMin?: number;
  @IsOptional() @IsInt() salaryMax?: number;
  @IsOptional() @IsString() prospect?: string;
  @IsOptional() @IsString() @MaxLength(128) suitTypes?: string;
  @IsOptional() @IsInt() @IsIn([0, 1]) status?: number;
}

export class CreateResourceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  title!: string;

  @IsInt()
  resourceType!: number;

  @IsOptional() @IsString() @MaxLength(512) url?: string;
  @IsOptional() @IsString() @MaxLength(255) skillTags?: string;
  @IsOptional() @IsString() careerId?: string;
  @IsOptional() @IsString() @MaxLength(64) provider?: string;
  @IsOptional() @IsInt() @IsIn([0, 1]) status?: number;
}

export class UpdateResourceDto {
  @IsOptional() @IsString() @MaxLength(128) title?: string;
  @IsOptional() @IsInt() resourceType?: number;
  @IsOptional() @IsString() @MaxLength(512) url?: string;
  @IsOptional() @IsString() @MaxLength(255) skillTags?: string;
  @IsOptional() @IsString() careerId?: string;
  @IsOptional() @IsString() @MaxLength(64) provider?: string;
  @IsOptional() @IsInt() @IsIn([0, 1]) status?: number;
}

/** 删除/下线等敏感操作附理由 + 二次确认。 */
export class ContentActionDto {
  @IsOptional() @IsString() @MaxLength(255) reason?: string;
  @IsOptional() @IsBoolean() confirm?: boolean;
}

/** T4-16 话题管理 DTO：创建 / 更新 / 审核话题。 */
export class CreateTopicDto {
  @IsString() @IsNotEmpty() @MaxLength(128) title!: string;
  @IsString() @IsNotEmpty() content!: string;
  @IsOptional() @IsString() @MaxLength(32) category?: string;
  @IsOptional() @IsString() @MaxLength(255) tags?: string;
  @IsOptional() @IsInt() @IsIn([0, 1]) isPinned?: number;
}

export class UpdateTopicDto {
  @IsOptional() @IsString() @MaxLength(128) title?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsString() @MaxLength(32) category?: string;
  @IsOptional() @IsString() @MaxLength(255) tags?: string;
  @IsOptional() @IsInt() @IsIn([0, 1]) isPinned?: number;
  @IsOptional() @IsInt() @IsIn([0, 1]) status?: number;
}

export class ReviewTopicDto {
  @IsInt() @IsIn([1, 2]) auditStatus!: number; // 1=通过 2=驳回
  @IsOptional() @IsString() @MaxLength(255) auditRemark?: string;
}