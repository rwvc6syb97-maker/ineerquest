#!/usr/bin/env node

import https from 'https';
import http from 'http';

async function fetchHealth(baseUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}/api/v1/health`);
    const protocol = url.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      port: url.port,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    };

    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: result,
          });
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.end();
  });
}

async function main() {
  console.log('='.repeat(60));
  console.log('InnerQuest API 健康检查验证脚本');
  console.log('='.repeat(60));
  console.log();

  const apiUrl = process.env.API_URL || 'https://api.innerquest.online';
  
  console.log(`正在检查: ${apiUrl}/api/v1/health`);
  console.log();

  try {
    const result = await fetchHealth(apiUrl);

    console.log('📊 响应状态:');
    console.log(`   HTTP 状态码: ${result.statusCode}`);
    console.log(`   Content-Type: ${result.headers['content-type']}`);
    console.log();

    console.log('📋 API 返回数据:');
    console.log(JSON.stringify(result.body, null, 2));
    console.log();

    if (result.statusCode === 200 && result.body.status === 'up') {
      console.log('✅ API 健康检查通过！');
      console.log();
      console.log('📝 检查项:');
      console.log(`   ✅ 服务状态: ${result.body.status}`);
      console.log(`   ✅ 已挂载模块: ${result.body.moduleCount} 个`);
      console.log(`   ✅ 模块列表: ${result.body.modules.join(', ')}`);
      console.log();
      console.log('🎉 后端 API 运行正常！');
    } else {
      console.log('❌ API 健康检查失败');
      process.exit(1);
    }

  } catch (error) {
    console.log('❌ 请求失败:');
    console.log(`   错误: ${error.message}`);
    console.log();
    console.log('💡 可能的原因:');
    console.log('   1. 后端服务尚未启动');
    console.log('   2. API URL 配置错误');
    console.log('   3. 网络连接问题');
    console.log('   4. Cloudflare 代理配置问题');
    process.exit(1);
  }
}

main();
