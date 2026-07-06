/**
 *P24 收藏 hook（localStorage 持久化）
 * -------------------------------------------------------------
 * 后端暂无收藏接口，用 localStorage 持久化收藏的职业卡片（含展示所需字段）。
 * key: 'iq:favorites'，存储 CareerCard[] 快照，支持添加 / 取消 / 判断。
 * TODO(blocked)：后端收藏接口就绪后迁移为 React Query。
 */
import { useCallback, useEffect, useState } from 'react';
import type { CareerCard } from '../api/modules/career.api';

export const FAVORITES_KEY = 'iq:favorites';

function loadFavorites(): CareerCard[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as CareerCard[]) : [];
  } catch {
    return [];
  }
}

function persist(list: CareerCard[]) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
  } catch {
    /* 忽略写入失败（隐私模式等） */
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<CareerCard[]>(loadFavorites);

  // 跨标签页同步
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === FAVORITES_KEY) setFavorites(loadFavorites());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const isFavorite = useCallback(
    (id: string) => favorites.some((c) => c.id === id),
    [favorites],
  );

  const addFavorite = useCallback((career: CareerCard) => {
    setFavorites((prev) => {
      if (prev.some((c) => c.id === career.id)) return prev;
      const next = [...prev, career];
      persist(next);
      return next;
    });
  }, []);

  const removeFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = prev.filter((c) => c.id !== id);
      persist(next);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback(
    (career: CareerCard) => {
      setFavorites((prev) => {
        const exists = prev.some((c) => c.id === career.id);
        const next = exists ? prev.filter((c) => c.id !== career.id) : [...prev, career];
        persist(next);
        return next;
      });
    },
    [],
  );

  return { favorites, isFavorite, addFavorite, removeFavorite, toggleFavorite };
}