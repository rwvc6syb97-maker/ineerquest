

const OXYGENT_URL = process.env.OXYGENT_URL || 'http://localhost:8001';
const TEST_MESSAGE = process.env.TEST_MESSAGE || '请介绍一下你自己';

console.log('='.repeat(60));
console.log('OxyGent 多智能体服务测试脚本');
console.log('='.repeat(60));
console.log(`OxyGent 地址: ${OXYGENT_URL}`);
console.log(`测试消息: ${TEST_MESSAGE}`);
console.log('='.repeat(60));

async function testHealth() {
  console.log('\n[Step 1] 健康检查...');
  try {
    const response = await fetch(`${OXYGENT_URL}/health`);
    const data = await response.json();
    console.log(`状态: ${data.status}`);
    console.log(`服务: ${data.service}`);
    console.log(`可用: ${data.available}`);
    return data.available;
  } catch (err) {
    console.error(`❌ 健康检查失败: ${err.message}`);
    return false;
  }
}

async function testChatStream() {
  console.log('\n[Step 2] 测试流式聊天...');
  console.log('─────────────────────────────────────');

  const startTime = Date.now();
  let fullResponse = '';
  let firstTokenTime = null;

  try {
    const response = await fetch(`${OXYGENT_URL}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: TEST_MESSAGE }],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`❌ 请求失败: ${response.status}`);
      console.error(text);
      return false;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    console.log('AI 回复 (流式):');
    process.stdout.write('> ');

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data:')) {
          const dataStr = trimmed.slice(5).trim();
          
          try {
            const data = JSON.parse(dataStr);
            
            if (data.done && !data.delta) {
              console.log('\n─────────────────────────────────────');
              console.log(`✅ 流式传输完成`);
              console.log(`总耗时: ${Date.now() - startTime}ms`);
              console.log(`首 token 耗时: ${firstTokenTime ? firstTokenTime - startTime : 'N/A'}ms`);
              console.log(`完整回复长度: ${fullResponse.length} 字符`);
              console.log(`是否降级: ${data.degraded || false}`);
              if (data.degrade_reason) {
                console.log(`降级原因: ${data.degrade_reason}`);
              }
              return true;
            }
            
            if (data.delta) {
              if (!firstTokenTime) firstTokenTime = Date.now();
              fullResponse += data.delta;
              process.stdout.write(data.delta);
            }
          } catch (e) {
            console.error(`\n❌ JSON 解析错误: ${e.message}`);
          }
        }
      }
    }

    return true;
  } catch (err) {
    console.error(`\n❌ 测试失败: ${err.message}`);
    return false;
  }
}

async function testChat() {
  console.log('\n[Step 3] 测试非流式聊天...');
  
  try {
    const response = await fetch(`${OXYGENT_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: TEST_MESSAGE }],
      }),
    });

    const data = await response.json();
    console.log(`✅ 是否降级: ${data.degraded}`);
    console.log(`回复摘要: ${data.text.slice(0, 150)}...`);
  } catch (err) {
    console.error(`❌ 测试失败: ${err.message}`);
  }
}

async function main() {
  const healthy = await testHealth();
  
  if (!healthy) {
    console.log('\n❌ OxyGent 服务未启动，请先运行: python apps/oxygent/main.py');
    process.exit(1);
  }

  const streamSuccess = await testChatStream();

  if (streamSuccess) {
    await testChat();
    console.log('\n🎉 OxyGent 服务测试通过！');
  } else {
    console.log('\n❌ OxyGent 测试失败');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`\n❌ 脚本执行异常: ${err.message}`);
  process.exit(1);
});
