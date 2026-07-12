/** 前端 API 层统一出口 */
export { http, request, ApiError } from './client';
export * from './token';
export * as userApi from './modules/user.api';
export * as authApi from './modules/auth.api';
export * as assessmentApi from './modules/assessment.api';
export * as reportApi from './modules/report.api';
export * as careerApi from './modules/career.api';
export * as paymentApi from './modules/payment.api';
export * as membershipApi from './modules/membership.api';
export * as aiChatApi from './modules/ai-chat.api';
export * as aiPlusApi from './modules/ai-plus.api';
export * as careerPlanApi from './modules/career-plan.api';
export * as coachingApi from './modules/coaching.api';

// ---- 运营后台（scope=admin，独立 token 通道）----
export { adminHttp, adminRequest } from './admin-client';
export * from './admin-token';
export * as adminAuthApi from './modules/admin-auth.api';
export * as adminAnalyticsApi from './modules/admin-analytics.api';
export * as adminQuestionsApi from './modules/admin-questions.api';
export * as adminUsersApi from './modules/admin-users.api';
export * as adminCoachesApi from './modules/admin-coaches.api';
export * as adminContentApi from './modules/admin-content.api';
export * as adminActivationApi from './modules/admin-activation.api';
export * as adminMembershipApi from './modules/admin-membership.api';