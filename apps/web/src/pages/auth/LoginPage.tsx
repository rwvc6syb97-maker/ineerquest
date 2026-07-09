/**
 * P29 登录页：手机号验证码 + 邮箱验证码 双模式登录
 * - SMS 模式：手机号 + 验证码，60s 倒计时防重复发码
 * - Email 模式：邮箱 + 验证码，自动注册
 * - 登录成功后按 redirect 参数回跳，默认 /app
 */
import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  const navigate = useNavigate();
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

  // 登录成功后跳转：优先前端路由跳转；下一帧若 URL 仍停在登录页，
  // 说明 navigate 被状态更新/守卫时序吞掉，则回退为整页导航强制跳转。
  const goAfterLogin = (target: string) => {
    navigate(target, { replace: true });
    setTimeout(() => {
      if (window.location.pathname.startsWith('/auth/login')) {
        window.location.assign(target);
      }
    }, 50);
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

      {/* SMS Login Form */}
      {mode === 'sms' && (
        <form onSubmit={onSmsSubmit} noValidate className="mt-4 flex flex-col gap-4">
          <div>
            <label htmlFor="phone" className="mb-1 block text-sm text-slate-600">手机号</label>
            <input
              id="phone"
              type="tel"
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
