import { Module } from '@nestjs/common';
import { CareerController } from './career.controller';
import { CareerService } from './career.service';
import { CareerFavoriteService } from './career-favorite.service';
import { CareerPlanController } from './career-plan.controller';
import { CareerPlanService } from './career-plan.service';

/** 职业规划服务：职业库、详情、MBTI 推荐 TOP10、检索（T1-16）；技能差距/学习资源/成长计划（P16-P18）；收藏（L4） */
@Module({
  controllers: [CareerController, CareerPlanController],
  providers: [CareerService, CareerFavoriteService, CareerPlanService],
  exports: [CareerService, CareerFavoriteService, CareerPlanService],
})
export class CareerModule {}