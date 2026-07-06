/**
 * 运营后台登录页（scope=admin）
 * -------------------------------------------------------------
 * - 账号密码登录（对齐后端 /admin/auth/login，与 C 端短信登录完全隔离）。
 * - 成功后按 redirect 回跳，默认 /admin/analytics。
 * - 错误按 ApiError.message 提示；已登录则直接跳转。
 */
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAdminAuthStore } from '../../stores/adminAuth.store';
import { ApiError } from '../../api';
import { SpringButton } from '../../components/system/SpringButton';

interface FormValues {
  username: string;
  password: string;
}

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const login = useAdminAuthStore((s) => s.login);
  const isAuthenticated = useAdminAuthStore((s) => s.isAuthenticated);

  const redirect = params.get('redirect');
  const target = redirect ? decodeURIComponent(redirect) : '/admin/analytics';

  useEffect(() => {
    if (isAuthenticated()) {
      navigate(target, { replace: true });
    }
  }, [isAuthenticated, navigate, target]);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: { username: '', password: '' } });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login(values);
      navigate(target, { replace: true });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : '登录失败，请检查账号密码';
      setError('root', { message: msg });
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="text-xl font-bold text-slate-900">运营后台登录</h1>
        <p className="mt-1 text-sm text-slate-500">InnerQuest 管理控制台</p>

        <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
          <div>
            <label htmlFor="username" className="mb-1 block text-sm text-slate-600">
              账号
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              placeholder="请输入管理员账号"
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
              {...register('username', { required: '请输入账号' })}
            />
            {errors.username && (
              <span className="mt-1 block text-xs text-red-500" role="alert">
                {errors.username.message}
              </span>
            )}
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-slate-600">
              密码
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="请输入密码"
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
              {...register('password', { required: '请输入密码' })}
            />
            {errors.password && (
              <span className="mt-1 block text-xs text-red-500" role="alert">
                {errors.password.message}
              </span>
            )}
          </div>

          {errors.root && (
            <p className="text-sm text-red-500" role="alert">
              {errors.root.message}
            </p>
          )}

          <SpringButton type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? '登录中…' : '登录'}
          </SpringButton>
        </form>
      </div>
    </div>
  );
}