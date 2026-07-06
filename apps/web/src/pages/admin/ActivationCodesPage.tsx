/**
 * 运营后台 - 激活码管理
 * -------------------------------------------------------------
 * - 批量生成：选择套餐 + 数量 + 过期天数
 * - 列表：按 planCode/status/batchNo 筛选 + 分页
 * - 发送：邮件或短信触达用户
 * - 生成后展示明文列表，可一键复制
 *
 * 设计对齐：brand-accent-500 为强调 CTA，color-neutral-* 体系为骨架，
 * radius-2xl/lg 统一圆角，shadow-sm/md 层级阴影，font-mono 用于码值。
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminActivationApi, membershipApi } from '../../api';
import type { ActivationCodeItem, GenerateResult } from '../../api/modules/admin-activation.api';
import { Card } from '../../components/ui/Card';
import {
  StatusBadge,
  Pagination,
  useToast,
  errMsg,
} from './_shared';

const STATUS_MAP: Record<number, { text: string; tone: 'green' | 'amber' | 'slate' }> = {
  0: { text: '未使用', tone: 'green' },
  1: { text: '已使用', tone: 'slate' },
  2: { text: '已过期', tone: 'amber' },
};

const CHANNEL_MAP: Record<number, string> = {
  1: '邮件',
  2: '短信',
};

export function ActivationCodesPage() {
  const qc = useQueryClient();
  const toast = useToast();

  // ---- 列表筛选 ----
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [filterPlanCode, setFilterPlanCode] = useState('');
  const [filterStatus, setFilterStatus] = useState<number | ''>('');

  const { data: listData, isLoading } = useQuery({
    queryKey: ['admin', 'activation-codes', page, filterPlanCode, filterStatus],
    queryFn: () => adminActivationApi.listCodes({
      page,
      pageSize,
      planCode: filterPlanCode || undefined,
      status: filterStatus !== '' ? Number(filterStatus) : undefined,
    }),
  });

  const { data: plans = [] } = useQuery({
    queryKey: ['membership', 'plans'],
    queryFn: () => membershipApi.listPlans(),
  });

  // ---- 生成弹窗 ----
  const [showGenerate, setShowGenerate] = useState(false);
  const [genPlanCode, setGenPlanCode] = useState('');
  const [genCount, setGenCount] = useState(10);
  const [genExpireDays, setGenExpireDays] = useState(365);
  const [genNote, setGenNote] = useState('');
  const [genResult, setGenResult] = useState<GenerateResult | null>(null);

  const generateMutation = useMutation({
    mutationFn: () => adminActivationApi.generateCodes({
      planCode: genPlanCode,
      count: genCount,
      expireDays: genExpireDays > 0 ? genExpireDays : undefined,
      note: genNote || undefined,
    }),
    onSuccess: (res) => {
      setGenResult(res);
      qc.invalidateQueries({ queryKey: ['admin', 'activation-codes'] });
      toast(`已生成 ${res.count} 个激活码`, 'success');
    },
    onError: (err) => toast(errMsg(err), 'error'),
  });

  // ---- 发送弹窗 ----
  const [sendTarget, setSendTarget] = useState<ActivationCodeItem | null>(null);
  const [sendEmail, setSendEmail] = useState('');
  const [sendPhone, setSendPhone] = useState('');
  const [sendChannel, setSendChannel] = useState<1 | 2>(1);

  const sendMutation = useMutation({
    mutationFn: () => adminActivationApi.sendCode(sendTarget!.id, {
      channel: sendChannel,
      email: sendChannel === 1 ? sendEmail : undefined,
      phone: sendChannel === 2 ? sendPhone : undefined,
    }),
    onSuccess: () => {
      setSendTarget(null);
      qc.invalidateQueries({ queryKey: ['admin', 'activation-codes'] });
      toast('已发送', 'success');
    },
    onError: (err) => toast(errMsg(err), 'error'),
  });

  // ---- 复制 ----
  const copyCodes = () => {
    if (!genResult) return;
    navigator.clipboard.writeText(genResult.codes.join('\n')).then(
      () => toast('已复制到剪贴板', 'success'),
      () => toast('复制失败', 'error'),
    );
  };

  const labelStyle: React.CSSProperties = { color: 'var(--color-neutral-500)', fontSize: '0.75rem' };
  const inputStyle: React.CSSProperties = {
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--color-neutral-300)',
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    width: '100%',
    backgroundColor: 'var(--color-neutral-50)',
    color: 'var(--color-neutral-900)',
  };

  return (
    <div className="flex flex-col gap-4">
      <h1
        className="text-xl font-bold"
        style={{ color: 'var(--color-neutral-900)' }}
      >
        激活码管理
      </h1>

      {/* 操作栏 */}
      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="inline-flex items-center rounded-lg px-4 py-1.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0"
            style={{
              backgroundColor: 'var(--brand-accent-500)',
              boxShadow: 'var(--shadow-accent)',
            }}
            onClick={() => {
              setGenResult(null);
              setShowGenerate(true);
            }}
          >
            + 生成激活码
          </button>
          <select
            className="rounded-lg border px-2 py-1.5 text-sm"
            style={{
              borderColor: 'var(--color-neutral-300)',
              backgroundColor: 'var(--color-neutral-50)',
              color: 'var(--color-neutral-700)',
            }}
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value === '' ? '' : Number(e.target.value)); setPage(1); }}
          >
            <option value="">全部状态</option>
            <option value="0">未使用</option>
            <option value="1">已使用</option>
            <option value="2">已过期</option>
          </select>
          <select
            className="rounded-lg border px-2 py-1.5 text-sm"
            style={{
              borderColor: 'var(--color-neutral-300)',
              backgroundColor: 'var(--color-neutral-50)',
              color: 'var(--color-neutral-700)',
            }}
            value={filterPlanCode}
            onChange={(e) => { setFilterPlanCode(e.target.value); setPage(1); }}
          >
            <option value="">全部套餐</option>
            {plans.map((p) => (
              <option key={p.code} value={p.code}>{p.name}</option>
            ))}
          </select>
        </div>
      </Card>

      {/* 数据表格 */}
      <Card padding="none">
        <table className="w-full text-left text-sm">
          <thead>
            <tr
              className="border-b text-xs font-medium"
              style={{ borderColor: 'var(--color-neutral-200)', color: 'var(--color-neutral-400)' }}
            >
              <th className="px-4 py-2.5">激活码</th>
              <th className="px-4 py-2.5">套餐</th>
              <th className="px-4 py-2.5">状态</th>
              <th className="px-4 py-2.5">批次</th>
              <th className="px-4 py-2.5">发送</th>
              <th className="px-4 py-2.5">使用人</th>
              <th className="px-4 py-2.5">操作</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center" style={{ color: 'var(--color-neutral-400)' }}>
                  加载中...
                </td>
              </tr>
            ) : listData?.list.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center" style={{ color: 'var(--color-neutral-400)' }}>
                  暂无数据
                </td>
              </tr>
            ) : (
              listData?.list.map((row) => (
                <tr
                  key={row.id}
                  className="border-b transition-colors hover:bg-neutral-50"
                  style={{ borderColor: 'var(--color-neutral-100)' }}
                >
                  <td
                    className="px-4 py-2.5 font-mono text-xs tracking-wider"
                    style={{ color: 'var(--color-neutral-800)' }}
                  >
                    {row.code}
                  </td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--color-neutral-600)' }}>{row.planCode}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge
                      text={STATUS_MAP[row.status]?.text ?? String(row.status)}
                      tone={STATUS_MAP[row.status]?.tone ?? 'slate'}
                    />
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--color-neutral-400)' }}>
                    {row.batchNo ?? '-'}
                  </td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--color-neutral-400)' }}>
                    {row.sentTo ? `${row.sentTo} (${CHANNEL_MAP[row.sentChannel ?? 1]})` : '-'}
                  </td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--color-neutral-400)' }}>
                    {row.usedBy ?? '-'}
                  </td>
                  <td className="px-4 py-2.5">
                    {row.status === 0 && (
                      <button
                        className="text-xs font-medium transition-colors hover:underline"
                        style={{ color: 'var(--brand-primary-500)' }}
                        onClick={() => {
                          setSendTarget(row);
                          setSendEmail('');
                          setSendPhone('');
                          setSendChannel(1);
                        }}
                      >
                        发送
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {listData && (
          <Pagination page={page} pageSize={pageSize} total={listData.total} onChange={setPage} />
        )}
      </Card>

      {/* 生成弹窗 */}
      {showGenerate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
          onClick={() => setShowGenerate(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6"
            style={{ boxShadow: 'var(--shadow-xl)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold" style={{ color: 'var(--color-neutral-900)' }}>
              生成激活码
            </h2>
            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label className="mb-1 block" style={labelStyle}>套餐</label>
                <select style={inputStyle} value={genPlanCode} onChange={(e) => setGenPlanCode(e.target.value)}>
                  <option value="">选择套餐</option>
                  {plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block" style={labelStyle}>数量</label>
                <input type="number" min={1} max={1000} style={inputStyle} value={genCount} onChange={(e) => setGenCount(Number(e.target.value))} />
              </div>
              <div>
                <label className="mb-1 block" style={labelStyle}>过期天数 (0=永不过期)</label>
                <input type="number" min={0} style={inputStyle} value={genExpireDays} onChange={(e) => setGenExpireDays(Number(e.target.value))} />
              </div>
              <div>
                <label className="mb-1 block" style={labelStyle}>备注 (选填)</label>
                <input type="text" style={inputStyle} value={genNote} onChange={(e) => setGenNote(e.target.value)} />
              </div>
            </div>

            {genResult && (
              <div
                className="mt-4 rounded-lg p-3"
                style={{ backgroundColor: 'var(--color-neutral-50)' }}
              >
                <p className="text-xs" style={{ color: 'var(--color-neutral-500)' }}>
                  {genResult.planName} x {genResult.count} 个 (批次 {genResult.batchNo})
                </p>
                <pre
                  className="mt-2 max-h-40 overflow-y-auto font-mono text-xs leading-relaxed select-all"
                  style={{ color: 'var(--color-neutral-700)' }}
                >
                  {genResult.codes.join('\n')}
                </pre>
                <button
                  className="mt-2 text-xs font-medium transition-colors hover:underline"
                  style={{ color: 'var(--brand-primary-500)' }}
                  onClick={copyCodes}
                >
                  复制全部
                </button>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-neutral-100"
                style={{ borderColor: 'var(--color-neutral-300)', color: 'var(--color-neutral-700)' }}
                onClick={() => setShowGenerate(false)}
              >
                关闭
              </button>
              <button
                className="inline-flex items-center rounded-lg px-4 py-1.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--brand-accent-500)',
                  boxShadow: 'var(--shadow-accent)',
                }}
                disabled={!genPlanCode || generateMutation.isPending}
                onClick={() => generateMutation.mutate()}
              >
                {generateMutation.isPending ? '生成中...' : '生成'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 发送弹窗 */}
      {sendTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
          onClick={() => setSendTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6"
            style={{ boxShadow: 'var(--shadow-xl)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold" style={{ color: 'var(--color-neutral-900)' }}>
              发送激活码
            </h2>
            <p className="mt-1 font-mono text-xs" style={{ color: 'var(--color-neutral-400)' }}>
              {sendTarget.code}
            </p>
            <div className="mt-4 flex gap-3">
              <label className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--color-neutral-700)' }}>
                <input type="radio" name="channel" checked={sendChannel === 1} onChange={() => setSendChannel(1)} />
                邮件
              </label>
              <label className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--color-neutral-700)' }}>
                <input type="radio" name="channel" checked={sendChannel === 2} onChange={() => setSendChannel(2)} />
                短信
              </label>
            </div>
            <div className="mt-3">
              {sendChannel === 1 ? (
                <input type="email" placeholder="用户邮箱" style={inputStyle} value={sendEmail} onChange={(e) => setSendEmail(e.target.value)} />
              ) : (
                <input type="tel" placeholder="用户手机号" style={inputStyle} value={sendPhone} onChange={(e) => setSendPhone(e.target.value)} />
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-neutral-100"
                style={{ borderColor: 'var(--color-neutral-300)', color: 'var(--color-neutral-700)' }}
                onClick={() => setSendTarget(null)}
              >
                取消
              </button>
              <button
                className="inline-flex items-center rounded-lg px-4 py-1.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--brand-accent-500)',
                  boxShadow: 'var(--shadow-accent)',
                }}
                disabled={sendMutation.isPending || (sendChannel === 1 ? !sendEmail : !sendPhone)}
                onClick={() => sendMutation.mutate()}
              >
                {sendMutation.isPending ? '发送中...' : '发送'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ActivationCodesPage;
