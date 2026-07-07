#!/usr/bin/env node

import https from 'https';

async function getZoneId(apiToken, domain) {
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
            reject(new Error(`Failed to get zone ID: ${result.errors?.[0]?.message || 'Unknown error'}`));
          }
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function createCNAME(apiToken, zoneId, name, content) {
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

    const body = JSON.stringify({
      type: 'CNAME',
      name,
      content,
      ttl: 1,
      proxied: false,
    });

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.success) {
            resolve(result.result);
          } else {
            reject(new Error(`Failed to create DNS record: ${result.errors?.[0]?.message || 'Unknown error'}`));
          }
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('='.repeat(60));
  console.log('Cloudflare DNS 配置脚本 - API 子域名');
  console.log('='.repeat(60));
  console.log();

  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const domain = process.env.DOMAIN || 'innerquest.online';
  const railwayDomain = process.env.RAILWAY_DOMAIN || 'innerquestapi-production.up.railway.app';

  if (!apiToken) {
    console.log('❌ 请设置环境变量 CLOUDFLARE_API_TOKEN');
    console.log();
    console.log('获取方式：');
    console.log('1. 登录 Cloudflare: https://dash.cloudflare.com');
    console.log('2. 点击右上角头像 → My Profile');
    console.log('3. API Tokens → Create Token');
    console.log('4. 使用模板 "Edit zone DNS"');
    console.log('5. 选择域名 innerquest.online');
    console.log('6. 创建 Token 并复制');
    console.log();
    console.log('然后运行:');
    console.log('  CLOUDFLARE_API_TOKEN=your-token node scripts/configure-cloudflare-api.mjs');
    process.exit(1);
  }

  try {
    console.log(`📌 配置参数:`);
    console.log(`   域名: ${domain}`);
    console.log(`   API 子域名: api.${domain}`);
    console.log(`   Railway 目标域名: ${railwayDomain}`);
    console.log();

    console.log('🔍 1. 获取 Zone ID...');
    const zoneId = await getZoneId(apiToken, domain);
    console.log(`   ✅ Zone ID: ${zoneId}`);
    console.log();

    console.log('🔍 2. 创建 CNAME 记录...');
    const record = await createCNAME(apiToken, zoneId, 'api', railwayDomain);
    console.log(`   ✅ CNAME 记录创建成功:`);
    console.log(`      名称: ${record.name}`);
    console.log(`      内容: ${record.content}`);
    console.log(`      代理状态: ${record.proxied ? '✅ 开启' : '❌ 关闭'}`);
    console.log();

    console.log('🎉 配置完成！');
    console.log();
    console.log('⏳ DNS 生效时间: 5-30 分钟');
    console.log();
    console.log('📝 验证方法:');
    console.log('   1. 等待 5-30 分钟');
    console.log('   2. 运行: node scripts/verify-api.mjs');
    console.log('   3. 或访问: https://api.innerquest.online/api/v1/health');
    console.log();

  } catch (error) {
    console.log('❌ 配置失败:');
    console.log(`   错误: ${error.message}`);
    console.log();
    console.log('💡 可能的原因:');
    console.log('   1. API Token 无效或权限不足');
    console.log('   2. 域名尚未添加到 Cloudflare');
    console.log('   3. NS 记录尚未生效');
    console.log('   4. 记录已存在（重复创建）');
    process.exit(1);
  }
}

main();
