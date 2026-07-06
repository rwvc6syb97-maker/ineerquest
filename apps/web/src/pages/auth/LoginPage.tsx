/**
 * P29 登录页：手机号验证码 + 邮箱密码 双模式登录
 * - SMS 模式：手机号 + 验证码，60s 倒计时防重复发码
 * - Email 模式：邮箱 + 密码登录，支持注册新账号
 * - 登录成功后按 redirect 参数回跳，默认 /app
 */
import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore, isMockAuthEnabled } from '../../stores/auth.store';
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
  password: string;
  nickname?: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const loginBySms = useAuthStore((s) => s.loginBySms);
  const loginByEmail = useAuthStore((s) => s.loginByEmail);
  const registerByEmail = useAuthStore((s) => s.registerByEmail);

  const [mode, setMode] = useState<AuthMode>('sms');
  const [isRegister, setIsRegister] = useState(false);
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
    setError: emailSetErr,
    formState: { errors: emailErrors, isSubmitting: emailSubmitting },
  } = useForm<EmailForm>({ defaultValues: { email: '', password: '', nickname: '' } });

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
    if (isMockAuthEnabled()) {
      startCountdown();
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

  const onSmsSubmit = smsSubmit(async (values) => {
    try {
      await loginBySms(values.phone, values.code);
      const redirect = params.get('redirect');
      navigate(redirect ? decodeURIComponent(redirect) : '/app', { replace: true });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : '登录失败，请重试';
      smsSetErr('root', { message: msg });
    }
  });

  const onEmailSubmit = emailSubmit(async (values) => {
    try {
      if (isRegister) {
        await registerByEmail(values.email, values.password, values.nickname || undefined);
      } else {
        await loginByEmail(values.email, values.password);
      }
      const redirect = params.get('redirect');
      navigate(redirect ? decodeURIComponent(redirect) : '/app', { replace: true });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (isRegister ? '注册失败，请重试' : '登录失败，请重试');
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

          {isMockAuthEnabled() && (
            <p className="text-xs text-slate-400 text-center">
              开发模式：手机号 13800000000 + 验证码 888888 直接登录
            </p>
          )}
        </form>
      )}

      {/* Email Login/Register Form */}
      {mode === 'email' && (
        <form onSubmit={onEmailSubmit} noValidate className="mt-4 flex flex-col gap-4">
          {isRegister && (
            <div>
              <label htmlFor="nickname" className="mb-1 block text-sm text-slate-600">昵称（选填）</label>
              <input
                id="nickname"
                type="text"
                placeholder="给自己取个名字"
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                {...emailReg('nickname', { maxLength: 64 })}
              />
            </div>
          )}

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
            <label htmlFor="password" className="mb-1 block text-sm text-slate-600">密码</label>
            <input
              id="password"
              type="password"
              placeholder={isRegister ? '至少 6 位密码' : '请输入密码'}
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
              {...emailReg('password', {
                required: '请输入密码',
                minLength: { value: 6, message: '密码至少 6 位' },
              })}
            />
            {emailErrors.password && <span className="mt-1 block text-xs text-red-500" role="alert">{emailErrors.password.message}</span>}
          </div>

          {emailErrors.root && <p className="text-sm text-red-500" role="alert">{emailErrors.root.message}</p>}

          <SpringButton type="submit" disabled={emailSubmitting} className="w-full">
            {emailSubmitting ? (isRegister ? '注册中…' : '登录中…') : (isRegister ? '注册' : '登录')}
          </SpringButton>

          <button
            type="button"
            onClick={() => { setIsRegister(!isRegister); emailSetErr('root', { message: '' }); }}
            className="text-center text-sm"
            style={{ color: COLORS.brand }}
          >
            {isRegister ? '已有账号？去登录' : '没有账号？去注册'}
          </button>
        </form>
      )}
    </div>
  );
}
