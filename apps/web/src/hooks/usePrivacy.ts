/**
 * 隐私设置 / 账户注销 React Query hooks
 * 对齐后端设计文档 §8/§10：GET|PUT /users/me/privacy、POST /users/me/deactivate。
 * 无真实后端时用 mock 兜底（默认全开隐私项）。TODO(blocked)：联调后删除 fallback。
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userApi } from '../api';
import type { PrivacySetting } from '../api/modules/user.api';

export const privacyKeys = {
  detail: ['privacy', 'me'] as const,
};

/** 无后端兜底：默认全开隐私项 */
const DEFAULT_PRIVACY: PrivacySetting = {
  profilePublic: true,
  allowRecommend: true,
  shareAnonymous: true,
  receiveNotifications: true,
};

/** 查询隐私设置（失败返回默认全开兜底） */
export function usePrivacy() {
  return useQuery<PrivacySetting>({
    queryKey: privacyKeys.detail,
    queryFn: async () => {
      try {
        return await userApi.getPrivacy();
      } catch {
        return { ...DEFAULT_PRIVACY }; // 无后端兜底
      }
    },
  });
}

/** 更新隐私设置 mutation（成功后写回缓存） */
export function useUpdatePrivacy() {
  const qc = useQueryClient();
  return useMutation<PrivacySetting, unknown, Partial<PrivacySetting>>({
    mutationFn: async (payload) => {
      try {
        return await userApi.updatePrivacy(payload);
      } catch {
        // 无后端兜底：以当前缓存合并本次改动，保证 UI 可用
        const prev = qc.getQueryData<PrivacySetting>(privacyKeys.detail) ?? DEFAULT_PRIVACY;
        return { ...prev, ...payload };
      }
    },
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

export { DEFAULT_PRIVACY };