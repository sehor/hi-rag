import dotenv from 'dotenv';
import { searchRelevantChunks } from './api/services/searchService.js';

// 加载环境变量
dotenv.config();

/**
 * 测试直接调用搜索服务
 * 直接调用searchRelevantChunks函数进行搜索
 */
async function testDirectSearch() {
  console.log('=== 测试直接搜索服务 ===\n');

  // 测试查询
  const testQueries = [
    '键盘谷',
    '混吃混喝',
    '键盘谷, 混吃混喝'
  ];

  const userId = '1c85a367-057d-4842-9db9-845e7928686f'; // 使用真实的用户UUID
  const categoryId = null;
  const limit = 5;

  for (const query of testQueries) {
    console.log(`\n🔍 搜索查询: "${query}"`);
    console.log('=' .repeat(60));
    
    try {
      // 直接调用搜索服务
      const searchResults = await searchRelevantChunks(query, userId, limit, categoryId);
      
      console.log(`📊 搜索完成，找到 ${searchResults.length} 个结果`);
      
      if (searchResults.length > 0) {
        console.log('\n📚 搜索结果详情:');
        searchResults.forEach((chunk, index) => {
          console.log(`\n${index + 1}. 文档: ${chunk.documents?.title || '未知标题'}`);
          console.log(`   文档ID: ${chunk.document_id}`);
          console.log(`   块ID: ${chunk.id}`);
          console.log(`   内容片段: ${chunk.content.substring(0, 200)}...`);
          
          // 显示分数信息
          if (chunk.hybrid_score !== undefined) {
            console.log(`   混合分数: ${chunk.hybrid_score.toFixed(4)}`);
          }
          if (chunk.vector_score !== undefined) {
            console.log(`   向量分数: ${chunk.vector_score.toFixed(4)}`);
          }
          if (chunk.keyword_score !== undefined) {
            console.log(`   关键词分数: ${chunk.keyword_score}`);
          }
          if (chunk.keyword_match_ratio !== undefined) {
            console.log(`   关键词匹配率: ${(chunk.keyword_match_ratio * 100).toFixed(1)}%`);
          }
          
          console.log(`   创建时间: ${chunk.created_at}`);
        });
      } else {
        console.log('📭 没有找到相关文档');
      }
      
    } catch (error) {
      console.error(`❌ 搜索失败:`, error.message);
      console.error('错误堆栈:', error.stack);
    }
    
    // 添加延迟避免请求过快
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// 运行测试
testDirectSearch().catch(console.error);