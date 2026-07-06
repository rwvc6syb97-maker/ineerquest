/**
 * 登录表单样板（react-hook-form + React Query + ApiError）
 * 展示三者协作范式，供各业务表单参照。
 */
import { useForm } from 'react-hook-form';
import { useLogin } from '../hooks/useProfile';
import { ApiError } from '../api';

interface LoginFormValues {
  email: string;
  password: string;
}

export function LoginForm() {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    defaultValues: { email: '', password: '' },
  });

  const login = useLogin();

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values);
      // 成功后由上层路由守卫跳转
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '登录失败，请重试';
      setError('root', { message });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <div>
        <label htmlFor="email">邮箱</label>
        <input
          id="email"
          type="email"
          {...register('email', {
            required: '请输入邮箱',
            pattern: { value: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: '邮箱格式不正确' },
          })}
        />
        {errors.email && <span role="alert">{errors.email.message}</span>}
      </div>

      <div>
        <label htmlFor="password">密码</label>
        <input
          id="password"
          type="password"
          {...register('password', {
            required: '请输入密码',
            minLength: { value: 6, message: '密码至少 6 位' },
          })}
        />
        {errors.password && <span role="alert">{errors.password.message}</span>}
      </div>

      {errors.root && <p role="alert">{errors.root.message}</p>}

      <button type="submit" disabled={isSubmitting || login.isPending}>
        {isSubmitting || login.isPending ? '登录中…' : '登录'}
      </button>
    </form>
  );
}