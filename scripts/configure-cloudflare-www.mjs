#!/usr/bin/env node

import { createInterface } from 'readline';
import https from 'https';

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
  console.log('Cloudflare www 子域名配置脚本');
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

    console.log('[2/2] 创建 www CNAME 记录...');
    console.log();

    try {
      const record = await createDnsRecord(apiToken, zoneId, {
        type: 'CNAME',
        name: 'www',
        content: domain,
        ttl: 1,
        proxied: true,
      });
      console.log(`      ✅ CNAME记录 www -> ${domain} 创建成功`);
    } catch (e) {
      console.log(`      ❌ CNAME记录 www -> ${domain} 创建失败: ${e.message}`);
    }

    console.log();
    console.log('='.repeat(60));
    console.log('www 子域名配置完成！');
    console.log('='.repeat(60));
    console.log();
    console.log('现在可以在 GitHub Pages 中配置自定义域名为:');
    console.log('  innerquest.online');
    console.log();

  } catch (e) {
    console.error();
    console.error('❌ 配置失败:', e.message);
    console.error();
  }

  rl.close();
}

main();
