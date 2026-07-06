import { Outlet, Link } from 'react-router-dom';
import { COLORS } from '../theme/tokens';

// 第二层（认证区）：深蓝底 + 品牌视觉，右侧窄卡片
export function AuthLayout() {
  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{ background: `linear-gradient(140deg, ${COLORS.deep}, ${COLORS.deepAlt})` }}
    >
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 block text-center text-lg font-bold text-white">
          InnerQuest · 向内求索
        </Link>
        <div className="rounded-2xl bg-white p-8 shadow-xl">
          <Outlet />
        </div>
        <p className="mt-4 text-center text-xs text-slate-300">
          登录即代表同意
          <Link to="/legal/terms" className="underline">服务条款</Link>与
          <Link to="/legal/privacy" className="underline">隐私政策</Link>
        </p>
      </div>
    </div>
  );
}