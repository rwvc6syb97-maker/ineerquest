/**
 * @deprecated 前端 Mock 题库已废弃并清空（2026-07-11）。
 * -------------------------------------------------------------
 * 原因：测评链路已全面切换真实后端接口（GET /assessments/questions）。
 * mock 题库的字符串 id（mq-EI-1 / opt-1）与后端 BigInt 数字 id 不兼容，
 * 一旦回退或残留到 localStorage 会导致 toAnswers() 的 Number()→NaN，
 * 进而触发后端 BigInt(NaN)/外键 P2003 → PATCH answers 500。
 *
 * 本文件保留为空占位以避免历史 import 断链；请勿再新增 mock 题库回退逻辑。
 * 真实题库基线：version=v2，total=40，questionId 从 401 起、optionId 从 2001 起。
 */
export {};