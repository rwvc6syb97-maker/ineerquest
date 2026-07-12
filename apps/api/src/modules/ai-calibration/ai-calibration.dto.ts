import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/** 单条追问答案：维度键 + 所选倾向（first=偏 polarity1 字母极，second=偏 polarity2 字母极）。 */
export class CalibrationAnswerDto {
  @ApiProperty({ description: '维度键', enum: ['EI', 'SN', 'TF', 'JP'], example: 'EI' })
  @IsString()
  @IsIn(['EI', 'SN', 'TF', 'JP'])
  dimension!: string;

  @ApiProperty({ description: '所选倾向：first=第一极(E/S/T/J)，second=第二极(I/N/F/P)', enum: ['first', 'second'] })
  @IsString()
  @IsIn(['first', 'second'])
  choice!: string;
}

/** POST 提交追问答案请求体。 */
export class SubmitCalibrationDto {
  @ApiProperty({ description: '追问答案数组（仅需覆盖临界维度）', type: [CalibrationAnswerDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => CalibrationAnswerDto)
  answers!: CalibrationAnswerDto[];
}

/** GET 追问题目单元。 */
export class CalibrationQuestionVo {
  @ApiProperty({ description: '维度键', example: 'EI' })
  dimension!: string;

  @ApiProperty({ description: '当前该维度偏好百分比(0-100，越接近50越模糊)', example: 52.5 })
  currentPercent!: number;

  @ApiProperty({ description: '追问题干'})
  question!: string;

  @ApiProperty({ description: '两极选项', example: [{ choice: 'first', label: '...' }, { choice: 'second', label: '...' }] })
  options!: Array<{ choice: string; label: string }>;
}

/** GET 校准判定出参。 */
export class CalibrationCheckVo {
  @ApiProperty({ description: '结果ID' })
  resultId!: string;

  @ApiProperty({ description: '当前 MBTI 类型' })
  mbtiType!: string;

  @ApiProperty({ description: '是否已完成过校准（幂等标记）' })
  calibrated!: boolean;

  @ApiProperty({ description: '临界维度追问题目（无临界时为空数组）', type: [CalibrationQuestionVo] })
  questions!: CalibrationQuestionVo[];
}

/** POST 校准结果出参。 */
export class CalibrationResultVo {
  @ApiProperty({ description: '结果ID' })
  resultId!: string;

  @ApiProperty({ description: '校准前 MBTI 类型' })
  originalType!: string;

  @ApiProperty({ description: '校准后 MBTI 类型' })
  calibratedType!: string;

  @ApiProperty({ description: '本次是否发生类型变化' })
  changed!: boolean;
}