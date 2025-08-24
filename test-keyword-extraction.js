// 由于是TypeScript项目，我们需要直接测试API端点
import fetch from 'node-fetch';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

/**
 * 测试关键词提取功能
 * 用于分析特定查询的关键词提取结果
 */
async function testKeywordExtraction() {
  console.log('=== 测试关键词提取 ===\n');

  // 测试查询
  const testQueries = [
    '键盘谷',
    '混吃混喝', 
    '键盘谷, 混吃混喝',
    '提高搜索效果',
    'supabase平台',
    '如何提高搜索效果？',
    '关于supabase的问题'
  ];

  for (const query of testQueries) {
    console.log(`\n🔍 查询: "${query}"`);
    console.log('=' .repeat(50));
    
    try {
      // 通过API端点测试关键词提取
      const response = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: query,
          userId: 'test-user',
          categoryId: null
        })
      });
      
      if (!response.ok) {
        console.error(`❌ API请求失败: ${response.status} ${response.statusText}`);
        continue;
      }
      
      const result = await response.json();
      console.log(`📝 API响应:`, JSON.stringify(result, null, 2));
      
    } catch (error) {
      console.error(`❌ 测试失败:`, error.message);
    }
  }
}

// 运行测试
testKeywordExtraction().catch(console.error);