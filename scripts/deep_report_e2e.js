/* 缺陷1 深度报告端到端真实回归（禁 mock，打生产）
 * 流程：拉题→暂存→提交→生成报告→POST /reports/:id/generate→轮询 generateStatus 到 done
 * 用法：set DR_TOKEN=<生产真实access token> && node scripts/deep_report_e2e.js
 */
const BASE = 'https://innerquestapi-production.up.railway.app/api/v1';
const TOKEN = process.env.DR_TOKEN;
const ORIGIN = 'https://innerquest.online';

if (!TOKEN) { console.error('缺少 DR_TOKEN 环境变量'); process.exit(1); }

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Origin': ORIGIN,
      'Authorization': 'Bearer ' + TOKEN,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // 0. 创建测评记录（若已有可复用则拉题会返回 recordId）
  let recordId = process.env.DR_RECORD;

  // 1. 拉题库
  const q = await call('GET', '/assessments/questions');
  const d = q.json?.data;
  let questions = Array.isArray(d) ? d : (d?.questions || d?.list || d?.items || []);
  if (!recordId && d?.recordId) recordId = String(d.recordId);
  console.log('题库题数:', questions.length, 'HTTP', q.status, 'recordId:', recordId);
  if (!questions.length) { console.log('data:', JSON.stringify(d).slice(0, 400)); return; }

  // 若无 recordId，尝试创建
  if (!recordId) {
    const start = await call('POST', '/assessments/records', {});
    recordId = String(start.json?.data?.recordId || start.json?.data?.id || '');
    console.log('创建记录 HTTP', start.status, 'recordId:', recordId, JSON.stringify(start.json?.data));
  }
  if (!recordId) { console.log('无法取得 recordId，终止'); return; }

  // 2. 构造答案：每题选第 3 个选项(中立)
  const answers = questions.map((it) => ({
    questionId: Number(it.id),
    optionId: Number(it.options[2].id),
  }));

  // 3. 暂存
  const save = await call('PATCH', `/assessments/records/${recordId}/answers`, { answers });
  console.log('暂存 HTTP', save.status, 'code', save.json?.code);

  // 4. 提交
  const submit = await call('POST', `/assessments/records/${recordId}/submit`);
  console.log('提交 HTTP', submit.status, 'code', submit.json?.code, JSON.stringify(submit.json?.data));

  // 5. 生成报告
  const gen = await call('POST', '/reports', { recordId: Number(recordId) });
  const reportId = String(gen.json?.data?.id || gen.json?.data?.reportId || '');
  console.log('生成报告 HTTP', gen.status, 'code', gen.json?.code, 'reportId:', reportId);
 if (!reportId) { console.log('无 reportId，data:', JSON.stringify(gen.json?.data)); return; }

  // 6. 触发深度生成
  const t0 = Date.now();
  const dg = await call('POST', `/reports/${reportId}/generate`, {});
  console.log('触发深度生成 HTTP', dg.status, 'code', dg.json?.code, 'generateStatus:', dg.json?.data?.generateStatus);

  // 7. 轮询 generateStatus 至 done/failed（最多 30 次，每次 2s）
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const r = await call('GET', `/reports/${reportId}`);
    const gs = r.json?.data?.generateStatus;
    console.log(`  轮询#${i + 1} generateStatus=${gs} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    if (gs === 'done' || gs === 'failed') {
      console.log('最终态:', gs, '耗时', ((Date.now() - t0) / 1000).toFixed(1) + 's');
      const secs = r.json?.data?.sections || [];
      console.log('章节数:', secs.length);
      const sample = JSON.stringify(secs).slice(0, 500);
      console.log('章节内容样例:', sample);
      return;
    }
  }
  console.log('超时未落定终态');
})();