/**
 * React Query 数据 hook 样板
 * 展示查询/变更的标准封装：queryKey 约定、错误由 ApiError 冒泡、缓存失效。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '../api';
import type { LoginPayload, UserProfile } from '../api/modules/user.api';
import { useAuthStore } from '../stores/auth.store';

/** queryKey 命名空间约定：[域, 资源, ...参数] */
export const queryKeys = {
  profile: ['user', 'profile'] as const,
};

/** 查询当前用户资料 */
export function useProfile() {
  return useQuery<UserProfile>({
    queryKey: queryKeys.profile,
    queryFn: () => userApi.getProfile(),
    enabled: useAuthStore.getState().isAuthenticated(),
    staleTime: 5 * 60 * 1000,
  });
}

/** 登录变更：成功后写入 store 并失效 profile 缓存 */
export function useLogin() {
  const qc = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  return useMutation({
    mutationFn: (payload: LoginPayload) => userApi.login(payload),
    onSuccess: async () => {
      const user = await userApi.getProfile();
      setUser(user);
      await qc.invalidateQueries({ queryKey: queryKeys.profile });
    },
  });
}