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
    <section className="mx-auto max-w-2xl pb-16">
      {/* 用户卡 */}
      <header
        className="flex items-center gap-4 rounded-2xl px-6 py-6 text-white"
        style={{ background: `linear-gradient(135deg, ${COLORS.brand}, ${COLORS.deepAlt})` }}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-xl font-bold">
          {(user?.nickname || '访客').slice(0, 1)}
        </div>
        <div>
          <div className="text-lg font-bold">{user?.nickname || '未登录用户'}</div>
          <div className="text-sm text-white/70">{user?.email || '登录以同步你的测评数据'}</div>
        </div>
      </header>

      {/* 最近结果 */}
      {resultId && (
        <div className="mt-6 flex items-center justify-between rounded-2xl border border-slate-200 p-5">
          <div>
            <div className="text-sm font-semibold text-slate-800">你有一份最近的人格报告</div>
            <div className="text-xs text-slate-400">点击查看完整解读</div>
          </div>
          <SpringButton onClick={() => navigate(`/app/report/${resultId}`)}>查看报告</SpringButton>
        </div>
      )}

      {/* 功能入口 */}
      <div className="mt-6 grid grid-cols-1 gap-4">
        {ENTRIES.map((e) => (
          <button
            key={e.path}
            onClick={() => navigate(e.path)}
            className="flex items-center justify-between rounded-2xl border border-slate-200 p-5 text-left transition-shadow hover:shadow-md"
          >
            <div>
              <div className="text-sm font-semibold text-slate-800">{e.title}</div>
              <div className="text-xs text-slate-400">{e.desc}</div>
            </div>
            <span className="text-slate-300">›</span>
          </button>
        ))}
      </div>

      {!resultId && (
        <div className="mt-6 text-center">
          <SpringButton variant="accent" onClick={() => navigate('/assessment')}>
            去做一次测评
          </SpringButton>
        </div>
      )}
    </section>
  );
}