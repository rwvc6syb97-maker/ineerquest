import { URL } from 'url';

const API_BASE = process.env.API_URL || 'http://localhost:3000';
const TEST_MESSAGE = process.env.TEST_MESSAGE || '请介绍一下你自己';
const USE_MOCK = (process.env.USE_MOCK ?? 'true').toLowerCase() === 'true';

console.log('='.repeat(60));
console.log('InnerQuest AI 流式输出测试脚本');
console.log('='.repeat(60));
console.log(`API 地址: ${API_BASE}`);
console.log(`测试消息: ${TEST_MESSAGE}`);
console.log(`使用 Mock: ${USE_MOCK}`);
console.log('='.repeat(60));

async function createConversation() {
  console.log('\n[Step 1] 创建会话...');
  try {
    const response = await fetch(`${API_BASE}/api/v1/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: '测试会话' }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`❌ 创建会话失败: ${response.status} - ${text}`);
      return null;
    }

    const data = await response.json();
    const conversationId = data.data.id;
    console.log(`✅ 会话创建成功: ${conversationId}`);
    return conversationId;
  } catch (err) {
    console.error(`❌ 创建会话异常: ${err.message}`);
    return null;
  }
}

async function testStreamMessage(conversationId) {
  console.log('\n[Step 2] 测试流式消息...');
  console.log('─────────────────────────────────────');

  const url = new URL(`${API_BASE}/api/v1/conversations/${conversationId}/messages`);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({ content: TEST_MESSAGE }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`❌ 流式请求失败: ${response.status}`);
    console.error(text);
    return false;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullResponse = '';
  let eventType = 'message';
  let startTime = Date.now();
  let firstTokenTime = null;

  console.log('AI 回复 (流式):');
  process.stdout.write('> ');

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        
        if (trimmed.startsWith('event:')) {
          eventType = trimmed.slice(6).trim();
        } else if (trimmed.startsWith('data:')) {
          const dataStr = trimmed.slice(5).trim();
          
          try {
            const data = JSON.parse(dataStr);
            
            if (eventType === 'error') {
              console.error(`\n❌ 错误事件: ${data.message} (code: ${data.code})`);
              return false;
            }
            
            if (eventType === 'done') {
              console.log('\n─────────────────────────────────────');
              console.log(`✅ 流式传输完成`);
              console.log(`总耗时: ${Date.now() - startTime}ms`);
              console.log(`首 token 耗时: ${firstTokenTime ? firstTokenTime - startTime : 'N/A'}ms`);
              console.log(`完整回复长度: ${fullResponse.length} 字符`);
              return true;
            }
            
            if (data.delta) {
              if (!firstTokenTime) firstTokenTime = Date.now();
              fullResponse += data.delta;
              process.stdout.write(data.delta);
            }
          } catch (e) {
            console.error(`\n❌ JSON 解析错误: ${e.message}`);
            console.error(`原始数据: ${dataStr}`);
          }
        }
      }
    }
    
    console.log('\n─────────────────────────────────────');
    console.log('✅ 流式传输完成 (无 done 事件)');
    console.log(`总耗时: ${Date.now() - startTime}ms`);
    console.log(`完整回复长度: ${fullResponse.length} 字符`);
    return true;
  } catch (err) {
    console.error(`\n❌ 流式读取异常: ${err.message}`);
    return false;
  }
}

async function testDirectChat() {
  console.log('\n[可选] 测试非流式聊天接口...');
  
  try {
    const response = await fetch(`${API_BASE}/api/v1/llm/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: {
          user: TEST_MESSAGE,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`❌ 聊天接口失败: ${response.status} - ${text}`);
      return;
    }

    const data = await response.json();
    console.log(`✅ 响应时间: ${data.data?.responseTime ?? 'N/A'}ms`);
    console.log(`Provider: ${data.data?.provider ?? 'N/A'}`);
    console.log(`是否降级: ${data.data?.degraded ?? false}`);
    console.log(`回复摘要: ${(data.data?.text ?? '').slice(0, 100)}...`);
  } catch (err) {
    console.error(`❌ 聊天接口异常: ${err.message}`);
  }
}

async function main() {
  const conversationId = await createConversation();
  
  if (!conversationId) {
    console.log('\n❌ 测试终止：无法创建会话');
    process.exit(1);
  }

  const streamSuccess = await testStreamMessage(conversationId);

  if (streamSuccess) {
    console.log('\n🎉 所有测试通过！AI 流式输出正常工作');
    await testDirectChat();
  } else {
    console.log('\n❌ 测试失败');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`\n❌ 脚本执行异常: ${err.message}`);
  process.exit(1);
});
