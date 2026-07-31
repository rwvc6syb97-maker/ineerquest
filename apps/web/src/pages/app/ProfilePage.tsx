/**
 * P09 用户中心概览
 * - 展示用户信息、最近人格报告（数据源：后端 GET /reports 列表，倒序取 list[0]）
 * - 新增「AI 工作台」聚合卡区：收录 7 项 AI 功能，Bento 网格布局。
 * - 基础入口精简为「我的报告」/「账户设置」（职业匹配已并入 AI 工作台）。
 *
 * 契约对齐：
 *  - 最新报告来自 useReportList()（listReports），字段 id / reportNo / mbtiType / createdAt
 *    以 report.api.ts 的 Report 类型（Swagger v2.1）为准。
 *  - 免费化：全功能免费开放，已移除会员/套餐状态卡与付费判定。
 *  - 全程无 mock 兜底：接口失败呈现异常提示，data 读取均做可选判空，防 undefined 崩溃。
 *  - 依赖报告 id 的功能在无 latestReportId 时置灰，禁止跳空页。
 */
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useReportList } from '../../hooks/useReport';
import { SpringButton } from '../../components/system/SpringButton';
import { COLORS } from '../../theme/tokens';

/** 基础入口（职业匹配已并入 AI 工作台） */
const ENTRIES = [
  { path: '/app/report/history', title: '我的报告', desc: '查看历史测评与人格报告' },
  { path: '/app/settings', title: '账户设置', desc: '资料、隐私与退出登录' },
];

/** AI 工作台功能定义（字段/路由冻结，不可私改） */
type AiTool = {
  key: string;
  title: string;
  desc: string;
  /** 生成目标路由；requiresReport 为 true 时接收 latestReportId */
  to: (reportId?: string | number) => string;
  /** 是否依赖最新报告 id */
  requiresReport: boolean;
  /** true = 大卡（核心功能） */
  large: boolean;
};

const AI_TOOLS: AiTool[] = [
  { key: 'coaching', title: 'AI 深度对话', desc: '教练式对话，陪你把洞察落成行动', to: () => '/app/coaching', requiresReport: false, large: true },
  { key: 'resume', title: 'AI 简历优化', desc: '上传简历，AI 逐条对照给出改写建议', to: () => '/app/resume', requiresReport: false, large: true },
  { key: 'collab', title: '团队协作分析', desc: '解析团队人格构成与协作风格', to: () => '/app/collab', requiresReport: false, large: false },
  { key: 'career-match', title: '职业匹配推荐', desc: '基于你的报告推荐契合职业', to: (id) => `/app/career?reportId=${id}`, requiresReport: true, large: false },
  { key: 'skills-gap', title: '技能差距分析', desc: '选定目标职业，定位技能缺口', to: () => '/app/career', requiresReport: true, large: false },
  { key: 'daily-brief', title: '职业热点日报', desc: '每日精选行业与岗位动态', to: () => '/app/daily-brief', requiresReport: false, large: false },
  { key: 'deep-report', title: '深度报告解读', desc: '逐章拆解你的完整人格报告', to: (id) => `/app/report/${id}/full`, requiresReport: true, large: false },
];

export function ProfilePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  // 最新报告：后端列表倒序取第一条
  const { data: reportPage, isLoading: reportLoading, isError: reportError } = useReportList();
  const latestReport = reportPage?.list?.[0];
  const latestReportId = latestReport?.id;
  const hasReport = !!latestReportId;

  return (
    <section className="mx-auto max-w-2xl pb-8 md:pb-16">
      {/* 用户卡 */}
      <header
        className="flex items-center gap-3 rounded-2xl px-4 py-4 text-white md:gap-4 md:px-6 md:py-6"
        style={{ background: `linear-gradient(135deg, ${COLORS.brand}, ${COLORS.deepAlt})` }}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-lg font-bold md:h-14 md:w-14 md:text-xl">
          {(user?.nickname || '访客').slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-bold md:text-lg">{user?.nickname || '未登录用户'}</div>
          <div className="truncate text-xs text-white/70 md:text-sm">{user?.email || '登录以同步你的测评数据'}</div>
        </div>
      </header>

      {/* 最近人格报告（数据源：后端最新报告） */}
      <div className="mt-4 rounded-2xl border border-slate-200 p-4 md:mt-6 md:p-5">
        {reportLoading ? (
          <div className="space-y-2">
            <div className="h-5 w-48 animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-32 animate-pulse rounded bg-slate-100" />
          </div>
        ) : reportError ? (
          <div className="text-sm text-rose-500">最近报告加载失败，请稍后重试</div>
        ) : latestReport ? (
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-800">
                你有一份最近的人格报告
                {latestReport.mbtiType ? ` · ${latestReport.mbtiType}` : ''}
              </div>
              <div className="text-xs text-slate-400">
                {latestReport.reportNo ? `编号 ${latestReport.reportNo}` : '点击查看完整解读'}
                {latestReport.createdAt ? ` · ${latestReport.createdAt}` : ''}
              </div>
            </div>
            <SpringButton
              onClick={() => navigate(`/app/report/${latestReport.id}`)}
              className="w-full md:w-auto"
            >
              查看报告
            </SpringButton>
          </div>
        ) : (
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-800">暂无人格报告</div>
              <div className="text-xs text-slate-400">完成一次测评即可生成你的专属报告</div>
            </div>
            <SpringButton
              variant="accent"
              onClick={() => navigate('/assessment')}
              className="w-full md:w-auto"
            >
              去做一次测评
            </SpringButton>
          </div>
        )}
      </div>

      {/* ============ AI 工作台聚合卡区（置顶突出） ============ */}
      <div className="mt-6 md:mt-8">
        <div className="mb-3 flex items-center gap-2">
          <span
            className="inline-block h-4 w-1.5 rounded-full"
            style={{ background: COLORS.accent }}
          />
          <h2 className="text-base font-bold text-slate-800 md:text-lg">AI 工作台</h2>
        </div>

        {reportError ? (
          // 报告接口异常：呈现异常态，不 mock 兜底
          <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-6 text-center">
            <div className="text-sm font-semibold text-rose-600">AI 工作台暂时不可用</div>
            <div className="mt-1 text-xs text-rose-400">报告数据加载失败，请稍后重试</div>
          </div>
        ) : !reportLoading && !hasReport ? (
          // 空状态：未做过测评，整体引导
          <div
            className="rounded-2xl border p-6 text-center md:p-8"
            style={{ borderColor: '#fed7aa', background: 'rgba(255,247,237,0.6)' }}
          >
            <div className="text-sm font-bold text-slate-800 md:text-base">完成测评后解锁 AI 工具</div>
            <div className="mt-1 text-xs text-slate-500 md:text-sm">
              AI 深度对话、简历优化、职业匹配等能力将在你生成首份报告后开启。
            </div>
            <SpringButton
              variant="accent"
              onClick={() => navigate('/assessment')}
              className="mt-4"
            >
              去测评，解锁工具
            </SpringButton>
          </div>
        ) : (
          // Bento 网格：核心功能大卡，其余小卡
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4">
            {AI_TOOLS.map((tool) => {
              const disabled = tool.requiresReport && !hasReport;
          const isLarge = tool.large;
              return (
                <button
                  key={tool.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return;
                    navigate(tool.to(latestReportId));
                  }}
                  className={[
                    'flex flex-col rounded-2xl border p-4 text-left transition-all md:p-5',
                    isLarge ? 'sm:col-span-1' : '',
                    disabled
                      ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-60'
                      : 'border-slate-200 hover:-translate-y-0.5 hover:shadow-md',
                  ].join(' ')}
                  style={
                    !disabled && isLarge
                      ? { borderColor: '#bfdbfe', background: 'rgba(239,246,255,0.5)' }
                      : undefined
                  }
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: isLarge ? COLORS.brand : COLORS.accent }}
                    />
                    <span
                      className={
                        isLarge
                          ? 'text-base font-bold text-slate-900'
                          : 'text-sm font-semibold text-slate-800'
                      }
                    >
                      {tool.title}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{tool.desc}</p>
                  {disabled ? (
                    <span className="mt-2 text-xs font-medium text-slate-400">先完成测评后解锁</span>
                  ) : (
                    <span
                      className="mt-2 text-xs font-semibold"
                      style={{ color: isLarge ? COLORS.brand : COLORS.accent }}
                    >
                      进入 →
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 基础入口（精简） */}
      <div className="mt-6 grid grid-cols-1 gap-3 md:mt-8 md:gap-4">
        {ENTRIES.map((e) => (
          <button
            key={e.path}
            type="button"
            onClick={() => navigate(e.path)}
            className="flex items-center justify-between rounded-2xl border border-slate-200 p-4 text-left transition-shadow hover:shadow-md md:p-5"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-800">{e.title}</div>
              <div className="text-xs text-slate-400">{e.desc}</div>
            </div>
            <span className="ml-2 text-slate-300">›</span>
          </button>
        ))}
      </div>
    </section>
  );
}