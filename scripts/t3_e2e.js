/* T3 端到端联调脚本：自动拉题→暂存40题→提交计分→取结果 */
const BASE = 'https://innerquestapi-production.up.railway.app/api/v1';
const TOKEN = process.env.T3_TOKEN;
const RECORD = process.env.T3_RECORD || '1';
const ORIGIN = 'https://innerquest.online';

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
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

(async () => {
  // 1. 拉题库
  const q = await call('GET', '/assessments/questions');
  const d = q.json?.data;
  console.log('data keys:', JSON.stringify(Object.keys(d || {})));
  let questions = [];
  if (Array.isArray(d)) questions = d;
  else if (Array.isArray(d?.questions)) questions = d.questions;
  else if (Array.isArray(d?.list)) questions = d.list;
  else if (Array.isArray(d?.items)) questions = d.items;
  else {
    // dimensions 分组结构：{EI:[],SN:[],TF:[],JP:[]}
    if (d?.dimensions && typeof d.dimensions === 'object') {
      for (const k of Object.keys(d.dimensions)) {
        if (Array.isArray(d.dimensions[k])) questions = questions.concat(d.dimensions[k]);
      }
    }
  }
  console.log('题库题数:', questions.length, 'HTTP', q.status, 'code', q.json?.code);
  if (!questions.length) { console.log('data样例:', JSON.stringify(d).slice(0, 300)); return; }
  // 2. 构造答案：每题选第3个选项(中立)
  const answers = questions.map((it) => ({
    questionId: Number(it.id),
    optionId: Number(it.options[2].id),
  }));
  // 3. 暂存
  const save = await call('PATCH', `/assessments/records/${RECORD}/answers`, { answers });
  console.log('暂存 HTTP', save.status, 'code', save.json?.code, 'data', JSON.stringify(save.json?.data));
  // 4. 提交
  const submit = await call('POST', `/assessments/records/${RECORD}/submit`);
  console.log('提交 HTTP', submit.status, 'code', submit.json?.code, 'data', JSON.stringify(submit.json?.data));
  // 5. 取结果
  const result = await call('GET', `/assessments/records/${RECORD}/result`);
  console.log('结果 HTTP', result.status, 'code', result.json?.code, 'data', JSON.stringify(result.json?.data));
})();