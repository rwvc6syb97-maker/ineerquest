/**
 * P29 登录页：手机号验证码 + 邮箱验证码 双模式登录
 * - SMS 模式：手机号 + 验证码，60s 倒计时防重复发码
 * - Email 模式：邮箱 + 验证码，自动注册
 * - 登录成功后按 redirect 参数回跳，默认 /app
 */
import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { authApi, ApiError } from '../../api';
import { SpringButton } from '../../components/system/SpringButton';
import { COLORS } from '../../theme/tokens';

type AuthMode = 'sms' | 'email';

interface SmsForm {
  phone: string;
  code: string;
}

interface EmailForm {
  email: string;
  code: string;
}

export function LoginPage() {
  const [params] = useSearchParams();
  const loginBySms = useAuthStore((s) => s.loginBySms);
  const loginByEmailCode = useAuthStore((s) => s.loginByEmailCode);

  const [mode, setMode] = useState<AuthMode>('sms');
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval>>();

  // SMS form
  const {
    register: smsReg,
    handleSubmit: smsSubmit,
    getValues: smsGet,
    setError: smsSetErr,
    formState: { errors: smsErrors, isSubmitting: smsSubmitting },
  } = useForm<SmsForm>({ defaultValues: { phone: '', code: '' } });

  // Email form
  const {
    register: emailReg,
    handleSubmit: emailSubmit,
    getValues: emailGet,
    setError: emailSetErr,
    formState: { errors: emailErrors, isSubmitting: emailSubmitting },
  } = useForm<EmailForm>({ defaultValues: { email: '', code: '' } });

  useEffect(() => () => clearInterval(timer.current), []);

  const startCountdown = () => {
    setCountdown(60);
    timer.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const onSendCode = async () => {
    const phone = smsGet('phone');
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      smsSetErr('phone', { message: '请输入正确的手机号' });
      return;
    }
    setSending(true);
    try {
      await authApi.sendSms(phone);
      startCountdown();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : '验证码发送失败';
      smsSetErr('root', { message: msg });
    } finally {
      setSending(false);
    }
  };

  const onSendEmailCode = async () => {
    const email = emailGet('email');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailSetErr('email', { message: '请输入正确的邮箱地址' });
      return;
    }
    setSending(true);
    try {
      await authApi.sendEmailCode(email);
      startCountdown();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : '验证码发送失败';
      emailSetErr('root', { message: msg });
    } finally {
      setSending(false);
    }
  };

  // 登录成功后跳转：直接整页导航到目标地址。
  // 说明：邮箱/短信验证码登录成功后 token 已写入 localStorage，
  // 此时用 SPA navigate 存在 StrictMode + async 回调 + 守卫时序竞态，
  // 会出现「登录成功但地址/页面不变」。整页导航可 100% 可靠地进入目标页，
  // 且目标页首屏会带最新 token 重新发起鉴权请求。
  const goAfterLogin = (target: string) => {
    window.location.assign(target);
  };

  const onSmsSubmit = smsSubmit(async (values) => {
    try {
      const isNewUser = await loginBySms(values.phone, values.code);
      const redirect = params.get('redirect');
      // 新注册用户引导至套餐页，否则按 redirect 回跳，默认 /app
      const target = isNewUser ? '/app/me/plan' : redirect ? decodeURIComponent(redirect) : '/app';
      goAfterLogin(target);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : '登录失败，请重试';
      smsSetErr('root', { message: msg });
    }
  });

  const onEmailSubmit = emailSubmit(async (values) => {
    try {
      const isNewUser = await loginByEmailCode(values.email, values.code);
      const redirect = params.get('redirect');
      const target = isNewUser ? '/app/me/plan' : redirect ? decodeURIComponent(redirect) : '/app';
      goAfterLogin(target);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : '登录失败，请重试';
      emailSetErr('root', { message: msg });
    }
  });

  const tabClass = (active: boolean) =>
    `flex-1 pb-2 text-sm font-medium text-center border-b-2 transition-colors ${
      active ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'
    }`;

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">欢迎回来</h1>
      <p className="mt-1 text-sm text-slate-500">选择一种方式登录，开启你的向内求索</p>

      {/* Tab switcher */}
      <div className="mt-6 flex gap-0">
        <button type="button" className={tabClass(mode === 'sms')} onClick={() => setMode('sms')}>
          手机号登录
        </button>
        <button type="button" className={tabClass(mode === 'email')} onClick={() => setMode('email')}>
          邮箱登录
        </button>
      </div>

      {/* SMS Login Form —— 手机号登录暂未开放 */}
      {mode === 'sms' && (
        // 手机号登录暂未开放：保留原表单代码，仅叠加遮罩层展示「开发中」，后续上线删除本遮罩即可
        <div className="relative mt-4">
          {/* ↓↓↓ 原手机号登录表单（保留，暂被遮罩覆盖，禁止交互） ↓↓↓ */}
          <form
            onSubmit={onSmsSubmit}
            noValidate
            aria-hidden="true"
            className="flex flex-col gap-4 pointer-events-none select-none blur-[1px] opacity-60"
          >
            <div>
              <label htmlFor="phone" className="mb-1 block text-sm text-slate-600">手机号</label>
              <input
                id="phone"
                type="tel"
                tabIndex={-1}
                placeholder="请输入手机号"
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                {...smsReg('phone', {
                  required: '请输入手机号',
                  pattern: { value: /^1[3-9]\d{9}$/, message: '手机号格式不正确' },
                })}
              />
              {smsErrors.phone && <span className="mt-1 block text-xs text-red-500" role="alert">{smsErrors.phone.message}</span>}
            </div>

            <div>
              <label htmlFor="code" className="mb-1 block text-sm text-slate-600">验证码</label>
              <div className="flex gap-2">
                <input
                  id="code"
                  inputMode="numeric"
                  tabIndex={-1}
                  placeholder="6 位验证码"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                  {...smsReg('code', {
                    required: '请输入验证码',
                    pattern: { value: /^\d{4,6}$/, message: '验证码格式不正确' },
                  })}
                />
                <button
                  type="button"
                  onClick={onSendCode}
                  disabled={countdown > 0 || sending}
                  tabIndex={-1}
                  className="shrink-0 rounded-lg border px-3 text-sm font-medium disabled:opacity-50"
                  style={{ color: COLORS.brand, borderColor: COLORS.brand }}
                >
                  {countdown > 0 ? `${countdown}s` : sending ? '发送中' : '获取验证码'}
                </button>
              </div>
              {smsErrors.code && <span className="mt-1 block text-xs text-red-500" role="alert">{smsErrors.code.message}</span>}
            </div>

            {smsErrors.root && <p className="text-sm text-red-500" role="alert">{smsErrors.root.message}</p>}

            <SpringButton type="submit" disabled={smsSubmitting} className="w-full">
              {smsSubmitting ? '登录中…' : '登录 / 注册'}
            </SpringButton>
          </form>
          {/* ↑↑↑ 原手机号登录表单（保留） ↑↑↑ */}

          {/* 「开发中」遮罩层：上线手机号登录时删除此整块 div 即可 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-white/70 backdrop-blur-[2px]">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-700">
              手机号登录功能正在开发中，敬请期待。<br />请先使用<span className="font-medium">邮箱登录</span>。
            </div>
            <button
              type="button"
              onClick={() => setMode('email')}
              className="rounded-lg border px-4 py-2 text-sm font-medium"
              style={{ color: COLORS.brand, borderColor: COLORS.brand }}
            >
              切换到邮箱登录
            </button>
          </div>
        </div>
      )}

      {/* Email Login Form */}
      {mode === 'email' && (
        <form onSubmit={onEmailSubmit} noValidate className="mt-4 flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm text-slate-600">邮箱</label>
            <input
              id="email"
              type="email"
              placeholder="请输入邮箱地址"
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
              {...emailReg('email', {
                required: '请输入邮箱',
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: '邮箱格式不正确' },
              })}
            />
            {emailErrors.email && <span className="mt-1 block text-xs text-red-500" role="alert">{emailErrors.email.message}</span>}
          </div>

          <div>
            <label htmlFor="email-code" className="mb-1 block text-sm text-slate-600">验证码</label>
            <div className="flex gap-2">
              <input
                id="email-code"
                inputMode="numeric"
                placeholder="6 位验证码"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                {...emailReg('code', {
                  required: '请输入验证码',
                  pattern: { value: /^\d{4,6}$/, message: '验证码格式不正确' },
                })}
              />
              <button
                type="button"
                onClick={onSendEmailCode}
                disabled={countdown > 0 || sending}
                className="shrink-0 rounded-lg border px-3 text-sm font-medium disabled:opacity-50"
                style={{ color: COLORS.brand, borderColor: COLORS.brand }}
              >
                {countdown > 0 ? `${countdown}s` : sending ? '发送中' : '获取验证码'}
              </button>
            </div>
            {emailErrors.code && <span className="mt-1 block text-xs text-red-500" role="alert">{emailErrors.code.message}</span>}
          </div>

          {emailErrors.root && <p className="text-sm text-red-500" role="alert">{emailErrors.root.message}</p>}

          <SpringButton type="submit" disabled={emailSubmitting} className="w-full">
            {emailSubmitting ? '登录中…' : '登录 / 注册'}
          </SpringButton>
        </form>
      )}
    </div>
  );
}
