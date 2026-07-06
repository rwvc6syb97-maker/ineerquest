import { Module } from '@nestjs/common';
import { CareerController } from './career.controller';
import { CareerService } from './career.service';

/** 职业规划服务：职业库、详情、MBTI 推荐 TOP10、检索（T1-16） */
@Module({
  controllers: [CareerController],
  providers: [CareerService],
  exports: [CareerService],
})
export class CareerModule {}