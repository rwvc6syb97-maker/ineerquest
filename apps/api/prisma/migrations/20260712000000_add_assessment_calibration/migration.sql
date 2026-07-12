-- AlterTable: AI 追问式测评校准字段（契约 v1.0 §1.3, Batch P0 / L-P0-3）
-- calibrated: 是否已校准（0=未校准/默认, 1=已校准），用于幂等拦截重复提交（4009）
-- calibration_data: 校准明细 JSON（追问答案、调整前后维度分值、校准时间等），可空
ALTER TABLE `assessment_result`
    ADD COLUMN `calibrated` TINYINT NOT NULL DEFAULT 0,
    ADD COLUMN `calibration_data` JSON NULL;