/**
 * P11 账户设置页
 * - 展示账户资料
 * - 隐私设置（GET/PUT /users/me/privacy）
 * - 隐私/条款入口
 * - 清除本地测评草稿
 * - 账户注销冷静期（POST /users/me/deactivate）
 * - 退出登录（清 Token + 状态，回登录页）
 * 视觉统一为玻璃/圆角组件库风格；危险操作区以红色边框区分。
 */
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useAssessmentStore } from '../../stores/assessment.store';
import { Card, SpringButton } from '../../components';
import { usePrivacy, useUpdatePrivacy, useDeactivateAccount } from '../../hooks/usePrivacy';
import type { PrivacySetting } from '../../api/modules/user.api';

/** 隐私项文案配置 */
const PRIVACY_ITEMS: { key: keyof PrivacySetting; label: string; desc: string }[] = [
  { key: 'profilePublic', label: '公开我的资料', desc: '允许他人查看你的昵称与人格名片。' },
  { key: 'allowRecommend', label: '个性化推荐', desc: '基于测评结果为你推荐更契合的内容。' },
  { key: 'shareAnonymous', label: '匿名数据改进', desc: '允许匿名数据用于产品体验改进。' },
  { key: 'receiveNotifications', label: '成长提醒通知', desc: '接收测评复盘与成长计划相关提醒。' },
];

/** 轻量受控开关（组件库暂无 Switch，用 Tailwind 实现） */
function Switch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? 'bg-brand-accent-500' : 'bg-neutral-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const resetDraft = useAssessmentStore((s) => s.reset);

  // —— 局部轻量 toast（自包含，无需全局挂载） ——
  const [notice, setNotice] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);
  const toast = useCallback((text: string, tone: 'success' | 'error' = 'success') => {
    setNotice({ text, tone });
    window.setTimeout(() => setNotice(null), 2600);
  }, []);

  // —— 隐私设置 ——
  const { data: privacy } = usePrivacy();
  const updatePrivacy = useUpdatePrivacy();
  const [pendingKey, setPendingKey] = useState<keyof PrivacySetting | null>(null);

  const handleTogglePrivacy = (key: keyof PrivacySetting, value: boolean) => {
    setPendingKey(key);
    updatePrivacy.mutate(
      { [key]: value } as Partial<PrivacySetting>,
      {
        onSuccess: () => toast('隐私设置已保存'),
        onError: () => toast('保存失败，请稍后重试', 'error'),
        onSettled: () => setPendingKey(null),
      },
    );
  };

  // —— 账户注销 ——
  const deactivate = useDeactivateAccount();
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [reason, setReason] = useState('');

  const handleDeactivate = () => {
    if (!reason.trim()) {
      toast('请填写注销理由', 'error');
      return;
    }
    deactivate.mutate(reason.trim(), {
      onSuccess: (res) => {
        setShowDeactivate(false);
        setReason('');
        const days = res?.coolingDays ?? 15;
        if (
          window.confirm(
            `已进入 ${days} 天冷静期，期间登录可撤销注销。是否现在退出登录？`,
          )
        ) {
          void handleLogout();
        } else {
          toast(`已进入 ${days} 天冷静期，期间登录可撤销`);
        }
      },
      onError: () => toast('提交失败，请稍后重试', 'error'),
    });
  };

  const handleLogout = async () => {
    await logout();
    navigate('/auth/login', { replace: true });
  };

  return (
    <section className="mx-auto max-w-lg pb-16">
      <h1 className="font-display text-2xl font-bold text-brand-primary-950">账户设置</h1>

      {/* 资料 */}
      <Card padding="lg" className="mt-6">
        <h2 className="text-sm font-semibold text-neutral-700">个人资料</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-neutral-400">昵称</dt>
            <dd className="text-neutral-800">{user?.nickname || '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-400">账号</dt>
            <dd className="text-neutral-800">{user?.email || '—'}</dd>
          </div>
        </dl>
      </Card>

      {/* 隐私设置 */}
      <Card padding="lg" className="mt-4">
        <h2 className="text-sm font-semibold text-neutral-700">隐私设置</h2>
        <ul className="mt-4 space-y-4">
          {PRIVACY_ITEMS.map((item) => (
            <li key={item.key} className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-neutral-800">{item.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-neutral-400">{item.desc}</p>
              </div>
              <Switch
                checked={privacy?.[item.key] ?? false}
                disabled={pendingKey === item.key}
                onChange={(v) => handleTogglePrivacy(item.key, v)}
              />
            </li>
          ))}
        </ul>
      </Card>

      {/* 隐私条款入口 */}
      <Card padding="sm" className="mt-4">
        {[
          { label: '隐私政策', path: '/legal/privacy' },
          { label: '服务条款', path: '/legal/terms' },
          { label: '关于我们', path: '/about' },
        ].map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            {item.label}
            <span className="text-neutral-300">›</span>
          </button>
        ))}
      </Card>

      {/* 数据管理 */}
      <Card padding="lg" className="mt-4">
        <h2 className="text-sm font-semibold text-neutral-700">数据管理</h2>
        <button
          onClick={() => {
            resetDraft();
            toast('本地测评草稿已清除');
          }}
          className="mt-3 text-sm text-neutral-500 underline"
        >
          清除本地测评草稿
        </button>
      </Card>

      {/* 危险操作区：账户注销 */}
      <div className="mt-8 rounded-2xl border border-red-200 bg-red-50/40 p-5">
        <h2 className="text-sm font-semibold text-red-600">危险操作</h2>
        <p className="mt-2 text-xs leading-relaxed text-red-500/80">
          注销账户将进入冷静期，期间登录即可撤销；冷静期结束后账户及数据将被清除，操作不可逆。
        </p>

        {!showDeactivate ? (
          <button
            onClick={() => setShowDeactivate(true)}
            className="mt-4 rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
          >
            申请注销账户
          </button>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block text-xs font-medium text-red-600">
              请填写注销理由（必填）
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="告诉我们你离开的原因，帮助我们改进…"
              className="w-full resize-none rounded-xl border border-red-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-red-400"
            />
            <div className="flex gap-3">
              <button
                onClick={handleDeactivate}
                disabled={deactivate.isPending}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                {deactivate.isPending ? '提交中…' : '确认注销'}
              </button>
              <button
                onClick={() => {
                  setShowDeactivate(false);
                  setReason('');
                }}
                className="rounded-xl px-4 py-2 text-sm text-neutral-500 hover:text-neutral-700"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 退出登录 */}
      <div className="mt-8">
        <SpringButton variant="ghost" className="w-full" onClick={handleLogout}>
          退出登录
        </SpringButton>
      </div>

      {/* 局部 toast */}
      {notice ? (
        <div
          className={`fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm text-white shadow-lg ${
            notice.tone === 'error' ? 'bg-red-600' : 'bg-neutral-900'
          }`}
        >
          {notice.text}
        </div>
      ) : null}
    </section>
  );
}

export default SettingsPage;