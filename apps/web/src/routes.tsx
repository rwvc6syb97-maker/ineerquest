import { Routes, Route, Navigate } from 'react-router-dom';
import { RootLayout } from './layouts/RootLayout';
import { PublicLayout } from './layouts/PublicLayout';
import { AuthLayout } from './layouts/AuthLayout';
import { AssessmentLayout } from './layouts/AssessmentLayout';
import { AppLayout } from './layouts/AppLayout';
import { AdminLayout } from './layouts/AdminLayout';
import { NotFound } from './pages/system/NotFound';
import { ErrorPage } from './pages/system/ErrorPage';
import { Privacy } from './pages/system/Privacy';
import { Terms } from './pages/system/Terms';
import { About } from './pages/system/About';

// 业务页面
import { HomePage } from './pages/public/HomePage';
import { PersonalityTypesPage } from './pages/public/PersonalityTypesPage';
import { PersonalityTypeDetailPage } from './pages/public/PersonalityTypeDetailPage';
import { CollabAnalyzePage } from './pages/public/CollabAnalyzePage';
import { LoginPage } from './pages/auth/LoginPage';
import { IntroPage } from './pages/assessment/IntroPage';
import { QuizPage } from './pages/assessment/QuizPage';
import { GeneratingPage } from './pages/assessment/GeneratingPage';
import { ResumePage } from './pages/assessment/ResumePage';
import { ReportPage } from './pages/app/ReportPage';
import { FullReportPage } from './pages/app/FullReportPage';
import { DailyBriefPage } from './pages/app/DailyBriefPage';
import { SharePage } from './pages/app/SharePage';
import { CareerListPage } from './pages/app/CareerListPage';
import { CareerDetailPage } from './pages/app/CareerDetailPage';
// 补齐页面（P28 职业百科 / P11 报告对比 / P10 章节详情 / P18 职业路线图）
import { CareerWikiPage } from './pages/app/CareerWikiPage';
import { ReportComparePage } from './pages/app/ReportComparePage';
import { ReportSectionPage } from './pages/app/ReportSectionPage';
import { CareerRoadmapPage } from './pages/app/CareerRoadmapPage';
import { ProfilePage } from './pages/app/ProfilePage';
import { HistoryPage } from './pages/app/HistoryPage';
import { MyPlanPage } from './pages/app/MyPlanPage';
import { FavoritesPage } from './pages/app/FavoritesPage';
import { SettingsPage } from './pages/app/SettingsPage';
// 付费拓展（T2-08 / T2-09 / T2-11）
import { PricingPage } from './pages/app/PricingPage';
import { CheckoutPage } from './pages/app/CheckoutPage';
import { PaymentResultPage } from './pages/app/PaymentResultPage';
import { OrdersPage } from './pages/app/OrdersPage';
// AI 对话与职业规划扩展（T3-08 / T3-09）
import { AiChatPage } from './pages/app/AiChatPage';
import { SkillsGapPage } from './pages/app/SkillsGapPage';
import { LearningResourcesPage } from './pages/app/LearningResourcesPage';
// 辅导咨询（P19-P22 / P26，T4-07 / T4-08 / T4-09）
import { CoachListPage } from './pages/app/CoachListPage';
import { CoachDetailPage } from './pages/app/CoachDetailPage';
import { CoachBookingPage } from './pages/app/CoachBookingPage';
import { CoachingSessionPage } from './pages/app/CoachingSessionPage';
import { MyCoachingPage } from './pages/app/MyCoachingPage';

// 运营后台页面（T4-17 / T4-18）
import { AdminLoginPage } from './pages/admin/AdminLoginPage';
import { AnalyticsPage } from './pages/admin/AnalyticsPage';
import { QuestionsPage } from './pages/admin/QuestionsPage';
import { UsersPage } from './pages/admin/UsersPage';
import { CoachesPage } from './pages/admin/CoachesPage';
import { ContentPage } from './pages/admin/ContentPage';
import { CareerDraftsPage } from './pages/admin/CareerDraftsPage';
import { ActivationCodesPage } from './pages/admin/ActivationCodesPage';
import { PlansPage } from './pages/admin/PlansPage';

// 路由守卫
import { RequireAuth } from './components/guards/RequireAuth';
import { RequireResult } from './components/guards/RequireResult';
import { RequirePaid } from './components/guards/RequirePaid';
import { RequireAdmin } from './components/guards/RequireAdmin';

// InnerQuest 三层路由骨架
// 第一层 RootLayout → 第二层区域布局（Public/Auth/Assessment/App/Admin）→ 第三层业务页面
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        {/* 公开区 */}
        <Route element={<PublicLayout />}>
          <Route index element={<HomePage />} />
          <Route path="pricing" element={<PricingPage />} />
          {/* 收银台 / 支付结果（游客可下单，支付后回跳报告） */}
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="payment/result" element={<PaymentResultPage />} />
          {/* P02 人格类型总览 / P03 详情 */}
          <Route path="personality-types" element={<PersonalityTypesPage />} />
          <Route path="personality-types/:typeCode" element={<PersonalityTypeDetailPage />} />
          {/* P2-1 团队协作分析（游客可用，派单标注 /app/collab，因 /app 全体守卫改挂 /collab） */}
          <Route path="collab" element={<CollabAnalyzePage />} />
          {/* 系统 / 公共页（S03-S05） */}
          <Route path="about" element={<About />} />
          <Route path="legal/privacy" element={<Privacy />} />
          <Route path="legal/terms" element={<Terms />} />
        </Route>

        {/* 认证区 */}
        <Route path="auth" element={<AuthLayout />}>
          <Route index element={<Navigate to="login" replace />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<LoginPage />} />
        </Route>

        {/* 兼容旧版登录路径 */}
        <Route path="login" element={<Navigate to="/auth/login" replace />} />

        {/* 测评区 */}
        <Route path="assessment" element={<AssessmentLayout />}>
          <Route index element={<IntroPage />} />
          <Route path="quiz" element={<QuizPage />} />
          <Route path="generating" element={<GeneratingPage />} />
          <Route path="resume" element={<ResumePage />} />
        </Route>

        {/* 应用区（登录后） */}
        <Route path="app" element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route index element={<ProfilePage />} />
          <Route path="settings" element={<SettingsPage />} />
          {/* 报告 */}
          <Route path="report/history" element={<HistoryPage />} />
          {/* P11 报告对比（静态段，须置于 report/:id 之前） */}
          <Route path="report/compare" element={<ReportComparePage />} />
          <Route
            path="report/:id"
            element={<RequireResult><ReportPage /></RequireResult>}
          />
          {/* P10 报告章节详情 */}
          <Route
            path="report/:id/section/:sectionId"
            element={<RequireResult><ReportSectionPage /></RequireResult>}
          />
          <Route path="report/:id/share" element={<SharePage />} />
          {/* P09 完整报告（付费解锁全部段落） */}
          <Route
            path="report/:id/full"
            element={
              <RequireResult>
                <RequirePaid>
                  <FullReportPage />
                </RequirePaid>
              </RequireResult>
            }
          />
          {/* P24 我的收藏 / P25 我的成长计划 */}
          <Route path="me/favorites" element={<FavoritesPage />} />
          <Route path="me/plan" element={<MyPlanPage />} />
          {/* 订单（登录后） */}
          <Route path="orders" element={<OrdersPage />} />
          {/* P3-3 职业热点日报（登录可见） */}
          <Route path="daily-brief" element={<DailyBriefPage />} />
          {/* 职业 */}
          <Route path="career" element={<CareerListPage />} />
          {/* P28 职业百科（静态段，须置于 career/:id 之前） */}
          <Route path="careers/wiki" element={<CareerWikiPage />} />
          <Route path="career/:id" element={<CareerDetailPage />} />
          {/* P18 职业路线图 */}
          <Route path="career/:careerId/roadmap" element={<CareerRoadmapPage />} />
          {/* AI 深度对话（P15，T3-08） */}
          <Route path="coaching" element={<AiChatPage />} />
          {/* 技能差距 / 学习资源（P16-P17，T3-09） */}
          <Route path="skills-gap/:careerId" element={<SkillsGapPage />} />
          <Route path="learning/resources" element={<LearningResourcesPage />} />
          {/* 辅导咨询（P19-P22 / P26，T4-07~09） */}
          <Route path="coaching/coaches" element={<CoachListPage />} />
          <Route path="coaching/coaches/:coachId" element={<CoachDetailPage />} />
          <Route path="coaching/booking/:coachId" element={<CoachBookingPage />} />
          <Route path="coaching/session/:sessionId" element={<CoachingSessionPage />} />
          <Route path="coaching/orders" element={<MyCoachingPage />} />
        </Route>

        {/* 运营后台登录（独立，不套 AdminLayout） */}
        <Route path="admin/login" element={<AdminLoginPage />} />

        {/* 管理区（需 admin 鉴权；各页再按权限点二次门控） */}
        <Route
          path="admin"
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        >
          <Route index element={<Navigate to="analytics" replace />} />
          <Route
            path="analytics"
            element={
              <RequireAdmin need="analytics:read">
                <AnalyticsPage />
              </RequireAdmin>
            }
          />
          <Route
            path="questions"
            element={
              <RequireAdmin need="question:read">
                <QuestionsPage />
              </RequireAdmin>
            }
          />
          <Route
            path="users"
            element={
              <RequireAdmin need="user:read">
                <UsersPage />
              </RequireAdmin>
            }
          />
          <Route
            path="coaches"
            element={
              <RequireAdmin need="coach:audit">
                <CoachesPage />
              </RequireAdmin>
            }
          />
          <Route
            path="content"
            element={
              <RequireAdmin need="career:read">
                <ContentPage />
              </RequireAdmin>
            }
          />
          <Route
            path="career-drafts"
            element={
              <RequireAdmin need="career:read">
                <CareerDraftsPage />
              </RequireAdmin>
            }
          />
          <Route
            path="activation-codes"
            element={
              <RequireAdmin need="payment:manage">
                <ActivationCodesPage />
              </RequireAdmin>
            }
          />
          <Route
            path="plans"
            element={
              <RequireAdmin need="membership:plan:manage">
                <PlansPage />
              </RequireAdmin>
            }
          />
        </Route>

        {/* S02 通用错误页（500 / 网络异常兜底） */}
        <Route path="error" element={<ErrorPage />} />

        {/* S01 通配兜底 → 404 */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}