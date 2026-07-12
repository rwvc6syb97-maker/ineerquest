/**
 * L4 收藏 hooks（React Query 接入真实后端接口）
 * -------------------------------------------------------------
 * 数据一律来自后端（GET/POST/DELETE /careers/favorites）。
 * 不做任何 localStorage 兜底：接口失败抛真实 ApiError，交由页面 isError / onError 呈现，
 * 收藏态由服务端列表驱动（跨设备一致），对齐 useCareer / useReport 做法。
 * 契约见《需求文档-接口与测试用例权威规范》§7.1-7.4。
 */
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careerApi } from '../api';
import { useAuthStore } from '../stores/auth.store';
import type {
  FavoriteAddResult,
  FavoriteItem,
  FavoriteListResult,
  FavoriteRemoveResult,
} from '../api/modules/career.api';

export const favoriteKeys = {
  list: (params: { page?: number; pageSize?: number } = {}) =>
    ['career', 'favorites', params.page ?? 1, params.pageSize ?? 20] as const,
};

/**
 * 我的收藏列表（需登录）。未登录时 enabled=false，不发请求。
 * 失败抛 ApiError，交由页面 isError 错误态呈现。
 */
export function useFavoriteList(params: { page?: number; pageSize?: number } = {}) {
  const authed = useAuthStore((s) => s.isAuthenticated)();
  return useQuery<FavoriteListResult>({
    queryKey: favoriteKeys.list(params),
    enabled: authed,
    queryFn: () => careerApi.listFavorites(params),
    staleTime: 60 * 1000,
  });
}

/**
 * 收藏操作 hook：收藏 / 取消 / 判断收藏态。
 * - 收藏态基于服务端列表数据（favoriteIds），非本地。
 * - mutation onSuccess 后 invalidate 收藏列表 queryKey，保证一致。
 * - 失败抛 ApiError（含未登录 4010 / 重复 4403 / 职业不存在 4402），由调用方 onError 处理。
 */
export function useFavoriteActions() {
  const qc = useQueryClient();

  const invalidateList = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['career', 'favorites'] });
  }, [qc]);

  const addMutation = useMutation<FavoriteAddResult, unknown, string | number>({
    mutationFn: (careerId) => careerApi.addFavorite(careerId),
    onSuccess: invalidateList,
  });

  const removeMutation = useMutation<FavoriteRemoveResult, unknown, string | number>({
    mutationFn: (careerId) => careerApi.removeFavorite(careerId),
    onSuccess: invalidateList,
  });

  return {
    addFavorite: addMutation.mutateAsync,
    removeFavorite: removeMutation.mutateAsync,
    isMutating: addMutation.isPending || removeMutation.isPending,
  };
}

/**
 * 便捷组合：给需要「列表 + 是否已收藏 + 切换」的页面（如职业列表）使用。
 * isFavorite 基于服务端收藏列表的 careerId 判断（字符串比较，兼容 number/string id）。
 */
export function useFavorites(params: { page?: number; pageSize?: number } = {}) {
  const listQuery = useFavoriteList(params);
  const { addFavorite, removeFavorite, isMutating } = useFavoriteActions();

  const items: FavoriteItem[] = listQuery.data?.list ?? [];

  const isFavorite = useCallback(
    (careerId: string | number) => items.some((it) => String(it.careerId) === String(careerId)),
    [items],
  );

  const toggleFavorite = useCallback(
    async (careerId: string | number) => {
      if (isFavorite(careerId)) {
        await removeFavorite(careerId);
      } else {
        await addFavorite(careerId);
      }
    },
    [isFavorite, addFavorite, removeFavorite],
  );

  return {
    items,
    total: listQuery.data?.total ?? 0,
    isLoading: listQuery.isLoading,
    isError: listQuery.isError,
    error: listQuery.error,
    refetch: listQuery.refetch,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    isMutating,
  };
}