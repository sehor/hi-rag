import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

/**
 * 测试聊天API功能
 * 验证API能否正确处理搜索请求并返回合适的回答
 */
async function testChatAPI() {
  console.log('=== 测试聊天API功能 ===\n');

  // 测试查询
  const testQueries = [
    '键盘谷',
    '混吃混喝',
    '键盘谷和混吃混喝是什么？',
    '告诉我关于修仙门派的信息'
  ];

  for (const query of testQueries) {
    console.log(`\n🔍 测试查询: "${query}"`);
    console.log('=' .repeat(60));
    
    try {
      // 调用聊天API
      const response = await fetch('http://localhost:3001/api/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: query }],
          userId: '1c85a367-057d-4842-9db9-845e7928686f', // 使用真实的用户UUID
          categoryId: null
        })
      });
      
      console.log(`📊 HTTP状态码: ${response.status}`);
      
      if (!response.ok) {
        console.error(`❌ API请求失败: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.error('错误详情:', errorText);
        continue;
      }
      
      const responseText = await response.text();
      console.log('\n📄 原始响应内容:');
      console.log('响应长度:', responseText.length);
      console.log('响应内容:', responseText.substring(0, 500));
      
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ JSON解析失败:', parseError.message);
        continue;
      }
      
      // 分析返回结果
      console.log('\n📋 API响应结构:');
      console.log('- response字段:', result.response ? '✅ 存在' : '❌ 缺失');
      console.log('- sources字段:', result.sources ? '✅ 存在' : '❌ 缺失');
      console.log('- debug字段:', result.debug ? '✅ 存在' : '❌ 缺失');
      
      // 显示搜索到的文档来源
      if (result.sources && result.sources.length > 0) {
        console.log(`\n📚 找到 ${result.sources.length} 个相关文档来源:`);
        result.sources.forEach((source, index) => {
          console.log(`${index + 1}. ${source}`);
        });
      } else {
        console.log('\n📭 没有找到相关文档来源');
      }
      
      // 显示AI回答
      if (result.response) {
        console.log(`\n🤖 AI回答 (${result.response.length} 字符):`);
        console.log('---');
        console.log(result.response);
        console.log('---');
        
        // 检查回答质量
        const hasRelevantContent = query.includes('键盘谷') || query.includes('混吃混喝') ?
          result.response.includes('键盘谷') || result.response.includes('混吃混喝') :
          result.response.length > 50;
        
        console.log(`\n📈 回答质量评估: ${hasRelevantContent ? '✅ 相关' : '⚠️ 可能不相关'}`);
      } else {
        console.log('\n❌ 没有AI回答');
      }
      
      // 显示调试信息
      if (result.debug) {
        console.log('\n🔧 调试信息:');
        if (result.debug.searchResults) {
          console.log(`- 搜索结果数量: ${result.debug.searchResults.length}`);
        }
        if (result.debug.searchTime) {
          console.log(`- 搜索耗时: ${result.debug.searchTime}ms`);
        }
        if (result.debug.totalTime) {
          console.log(`- 总耗时: ${result.debug.totalTime}ms`);
        }
      }
      
    } catch (error) {
      console.error(`❌ 测试失败:`, error.message);
      if (error.code === 'ECONNREFUSED') {
        console.error('💡 提示: 请确保后端服务器正在运行 (npm run dev:api)');
      }
    }
    
    // 添加延迟避免请求过快
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  console.log('\n=== 聊天API测试完成 ===');
}

// 运行测试
testChatAPI().catch(console.error);