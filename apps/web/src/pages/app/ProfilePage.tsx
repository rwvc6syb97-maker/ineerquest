/**
 * P09 用户中心概览
 * - 展示用户信息、最近人格报告（数据源：后端 GET /reports 列表，倒序取 list[0]）
 * - 展示会员/套餐状态（后端 GET /memberships/me）
 * - 导航至报告历史 P10 / 职业匹配 / 设置 P11
 *
 * 契约对齐：
 *  - 最新报告来自 useReportList()（listReports），不再依赖前端易失的 store.resultId；
 *    字段 id / reportNo / mbtiType / createdAt 均以 report.api.ts 的 Report 类型（Swagger v2.1）为准。
 *  - 会员状态来自 useMembershipStatus()，字段 level / expireAt / isActive 以 MembershipStatus 类型为准。
 *  - 全程无 mock 兜底：接口失败呈现异常提示，data 读取均做可选判空，防 undefined 崩溃。
 */
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useReportList } from '../../hooks/useReport';
import { useMembershipStatus } from '../../hooks/useMembership';
import { SpringButton } from '../../components/system/SpringButton';
import { COLORS } from '../../theme/tokens';

const ENTRIES = [
  { path: '/app/report/history', title: '我的报告', desc: '查看历史测评与人格报告' },
  { path: '/app/career', title: '职业匹配', desc: '探索契合你的职业方向' },
  { path: '/app/settings', title: '账户设置', desc: '资料、隐私与退出登录' },
];

/** 会员等级映射（展示用；level 语义以后端契约为准：0 免费 / 1 Pro / 2 辅导） */
const LEVEL_LABEL: Record<number, string> = {
  0: '免费用户',
  1: 'Pro 会员',
  2: '辅导会员',
};

export function ProfilePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  // 最新报告：后端列表倒序取第一条
  const { data: reportPage, isLoading: reportLoading, isError: reportError } = useReportList();
  const latestReport = reportPage?.list?.[0];
  const latestReportId = latestReport?.id;

  // 会员状态
  const { data: membership, isLoading: memberLoading, isError: memberError } = useMembershipStatus();
  const memberLevel = membership?.level ?? 0;
  const isPaid = (membership?.isActive ?? false) && memberLevel > 0;

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

      {/* 会员 / 套餐状态（BUG7） */}
      <div className="mt-4 rounded-2xl border border-slate-200 p-4 md:mt-6 md:p-5">
        {memberLoading ? (
          <div className="h-5 w-40 animate-pulse rounded bg-slate-100" />
        ) : memberError ? (
          <div className="text-sm text-rose-500">会员信息加载失败，请稍后重试</div>
        ) : isPaid ? (
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-800">
                {LEVEL_LABEL[memberLevel] ?? `会员等级 ${memberLevel}`}
              </div>
              <div className="text-xs text-slate-400">
                {membership?.expireAt ? `有效期至 ${membership.expireAt}` : '长期有效'}
              </div>
            </div>
            <SpringButton
              variant="accent"
              onClick={() => navigate('/pricing')}
              className="w-full md:w-auto"
            >
              续费 / 升级
            </SpringButton>
          </div>
        ) : (
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-800">{LEVEL_LABEL[0]}</div>
              <div className="text-xs text-slate-400">开通会员解锁完整报告与更多能力</div>
            </div>
            <SpringButton
              variant="accent"
              onClick={() => navigate('/pricing')}
              className="w-full md:w-auto"
            >
              开通会员
            </SpringButton>
          </div>
        )}
      </div>

      {/* 最近人格报告（BUG1&BUG2 数据源：后端最新报告） */}
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

      {/* 功能入口 */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:mt-6 md:gap-4">
        {ENTRIES.map((e) => (
          <button
            key={e.path}
            onClick={() =>
              // BUG1/2：职业匹配需携带最新报告 id，否则 CareerListPage 拿不到 reportId 不请求推荐
              navigate(
                e.path === '/app/career' && latestReportId
                  ? `/app/career?reportId=${latestReportId}`
                  : e.path,
              )
            }
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