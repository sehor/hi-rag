import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

/**
 * 模拟搜索问题测试
 * 测试为什么"键盘谷"会匹配到不相关的文档
 */
async function testSearchIssue() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('=== 模拟搜索问题测试 ===\n');

  // 测试关键词
  const problematicQueries = ['键盘谷', '混吃混喝'];

  for (const query of problematicQueries) {
    console.log(`\n🔍 测试查询: "${query}"`);
    console.log('=' .repeat(50));

    // 模拟searchService.ts中fallbackKeywordSearch的逻辑
    console.log('\n1️⃣ 模拟关键词提取失败的情况（使用原始查询）:');
    
    try {
      // 当关键词提取失败时，searchTerms = [query]
      const searchTerms = [query];
      console.log('   搜索词:', searchTerms);
      
      // 构建搜索条件 - 模拟searchService.ts的逻辑
      const searchConditions = searchTerms.map(term => 
        `content.ilike.%${term}%`
      ).join(',');
      
      console.log('   搜索条件:', searchConditions);
      
      // 执行查询
      const { data: chunks, error } = await supabase
        .from('document_chunks')
        .select(`
          id,
          content,
          documents!inner(
            title
          )
        `)
        .or(searchConditions)
        .limit(5);
      
      if (error) {
        console.error('   ❌ 查询错误:', error.message);
      } else if (chunks && chunks.length > 0) {
        console.log(`   📊 找到 ${chunks.length} 个结果:`);
        chunks.forEach((chunk, index) => {
          console.log(`   ${index + 1}. ${chunk.documents?.title}`);
          console.log(`      内容片段: ${chunk.content.substring(0, 100)}...`);
        });
      } else {
        console.log('   📭 没有找到匹配结果');
      }
      
    } catch (err) {
      console.error('   💥 测试错误:', err.message);
    }
  }

  // 测试正常情况
  console.log('\n\n🔍 测试正常查询: "提高搜索效果"');
  console.log('=' .repeat(50));
  
  try {
    const { data: chunks, error } = await supabase
      .from('document_chunks')
      .select(`
        id,
        content,
        documents!inner(
          title
        )
      `)
      .ilike('content', '%提高搜索效果%')
      .limit(3);
    
    if (error) {
      console.error('❌ 查询错误:', error.message);
    } else if (chunks && chunks.length > 0) {
      console.log(`📊 找到 ${chunks.length} 个结果:`);
      chunks.forEach((chunk, index) => {
        console.log(`${index + 1}. ${chunk.documents?.title}`);
        console.log(`   内容片段: ${chunk.content.substring(0, 150)}...`);
      });
    } else {
      console.log('📭 没有找到匹配结果');
    }
    
  } catch (err) {
    console.error('💥 测试错误:', err.message);
  }
}

// 运行测试
testSearchIssue().catch(console.error);