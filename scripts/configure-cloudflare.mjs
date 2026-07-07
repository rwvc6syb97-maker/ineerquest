#!/usr/bin/env node

import { createInterface } from 'readline';
import https from 'https';

const GITHUB_PAGES_IPS = [
  '185.199.108.153',
  '185.199.109.153',
  '185.199.110.153',
  '185.199.111.153',
];

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function fetchZoneId(apiToken, domain) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.cloudflare.com',
      path: `/client/v4/zones?name=${domain}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.success && result.result.length > 0) {
            resolve(result.result[0].id);
          } else {
            reject(new Error('Zone not found'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function createDnsRecord(apiToken, zoneId, record) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.cloudflare.com',
      path: `/client/v4/zones/${zoneId}/dns_records`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.success) {
            resolve(result.result);
          } else {
            reject(new Error(result.errors?.[0]?.message || 'Failed to create record'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(record));
    req.end();
  });
}

async function main() {
  console.log('='.repeat(60));
  console.log('Cloudflare DNS 自动配置脚本');
  console.log('='.repeat(60));
  console.log();

  const apiToken = await ask('请输入 Cloudflare API Token: ');
  const domain = 'innerquest.online';

  console.log();
  console.log(`正在配置域名: ${domain}`);
  console.log();

  try {
    console.log('[1/2] 获取 Zone ID...');
    const zoneId = await fetchZoneId(apiToken, domain);
    console.log(`      Zone ID: ${zoneId}`);
    console.log();

    console.log('[2/2] 创建 DNS 记录...');
    console.log();

    for (let i = 0; i < GITHUB_PAGES_IPS.length; i++) {
      const ip = GITHUB_PAGES_IPS[i];
      try {
        const record = await createDnsRecord(apiToken, zoneId, {
          type: 'A',
          name: '@',
          content: ip,
          ttl: 1,
          proxied: true,
        });
        console.log(`      ✅ A记录 @ -> ${ip} 创建成功`);
      } catch (e) {
        console.log(`      ❌ A记录 @ -> ${ip} 创建失败: ${e.message}`);
      }
    }

    console.log();
    console.log('='.repeat(60));
    console.log('DNS 配置完成！');
    console.log('='.repeat(60));
    console.log();
    console.log('下一步：');
    console.log('1. 等待 DNS 生效（5-30分钟）');
    console.log('2. 部署后端到 Railway');
    console.log('3. 添加 api.innerquest.online 的 CNAME 记录');
    console.log();

  } catch (e) {
    console.error();
    console.error('❌ 配置失败:', e.message);
    console.error();
    console.error('请检查：');
    console.error('1. API Token 是否正确');
    console.error('2. 域名是否已添加到 Cloudflare');
    console.error();
  }

  rl.close();
}

main();
