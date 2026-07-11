/**
 * P09 用户中心概览
 * - 展示用户信息、最近测评结果入口
 * - 导航至报告历史 P10 / 设置 P11
 */
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useAssessmentStore } from '../../stores/assessment.store';
import { SpringButton } from '../../components/system/SpringButton';
import { COLORS } from '../../theme/tokens';

const ENTRIES = [
  { path: '/app/report/history', title: '我的报告', desc: '查看历史测评与人格报告' },
  { path: '/app/career', title: '职业匹配', desc: '探索契合你的职业方向' },
  { path: '/app/settings', title: '账户设置', desc: '资料、隐私与退出登录' },
];

export function ProfilePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { resultId } = useAssessmentStore();

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

      {/* 最近结果 */}
      {resultId && (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 md:mt-6 md:flex-row md:items-center md:justify-between md:p-5">
          <div>
            <div className="text-sm font-semibold text-slate-800">你有一份最近的人格报告</div>
            <div className="text-xs text-slate-400">点击查看完整解读</div>
          </div>
          <SpringButton onClick={() => navigate(`/app/report/${resultId}`)} className="w-full md:w-auto">
            查看报告
          </SpringButton>
        </div>
      )}

      {/* 功能入口 */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:mt-6 md:gap-4">
        {ENTRIES.map((e) => (
          <button
            key={e.path}
            onClick={() =>
              // BUG1：职业匹配需携带最近报告 id，否则 CareerListPage 拿不到 reportId 不请求推荐
              navigate(
                e.path === '/app/career' && resultId
                  ? `/app/career?reportId=${resultId}`
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

      {!resultId && (
        <div className="mt-4 text-center md:mt-6">
          <SpringButton variant="accent" onClick={() => navigate('/assessment')} className="w-full md:w-auto">
            去做一次测评
          </SpringButton>
        </div>
      )}
    </section>
  );
}
