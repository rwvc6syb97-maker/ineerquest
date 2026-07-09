/**
 * 隐私设置 / 账户注销 React Query hooks
 * 对齐后端设计文档 §8/§10：GET|PUT /users/me/privacy、POST /users/me/deactivate。
 * 数据一律来自后端，不做默认全开兜底：查询/更新失败时抛出真实 ApiError，
 * 由页面 isError / mutation onError 呈现错误态 + 重试，避免用假状态误导用户隐私选择。
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userApi } from '../api';
import type { PrivacySetting } from '../api/modules/user.api';

export const privacyKeys = {
  detail: ['privacy', 'me'] as const,
};

/** 查询隐私设置（失败抛 ApiError，交由页面错误态） */
export function usePrivacy() {
  return useQuery<PrivacySetting>({
    queryKey: privacyKeys.detail,
    queryFn: () => userApi.getPrivacy(),
  });
}

/** 更新隐私设置 mutation（失败抛 ApiError；成功后写回缓存） */
export function useUpdatePrivacy() {
  const qc = useQueryClient();
  return useMutation<PrivacySetting, unknown, Partial<PrivacySetting>>({
    mutationFn: (payload) => userApi.updatePrivacy(payload),
    onSuccess: (next) => {
      qc.setQueryData(privacyKeys.detail, next);
    },
  });
}

/** 申请账户注销 mutation（进入冷静期） */
export function useDeactivateAccount() {
  return useMutation({
    mutationFn: (reason: string) => userApi.deactivateAccount(reason),
  });
}