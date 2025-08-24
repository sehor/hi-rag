import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

/**
 * 测试关键词搜索逻辑，模拟fallbackKeywordSearch的行为
 */
async function testKeywordSearchLogic() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('=== 测试关键词搜索逻辑 ===\n');

  const testQueries = [
    { query: '键盘谷', keywords: [] }, // 模拟关键词提取失败的情况
    { query: '混吃混喝', keywords: [] },
    { query: '提高搜索效果', keywords: ['提高', '搜索', '效果'] },
    { query: 'supabase', keywords: ['supabase'] }
  ];

  const userId = '1c85a367-057d-4842-9db9-845e7928686f';

  for (const test of testQueries) {
    console.log(`\n🔍 测试查询: "${test.query}"`);
    console.log(`🔑 模拟关键词: [${test.keywords.join(', ')}]`);
    console.log('='.repeat(60));

    try {
      // 模拟fallbackKeywordSearch的逻辑
      const searchTerms = test.keywords.length > 0 ? test.keywords : [test.query];
      console.log(`📝 实际搜索词: [${searchTerms.join(', ')}]`);

      // 构建查询条件
      let queryBuilder = supabase
        .from('document_chunks')
        .select(`
          id,
          document_id,
          content,
          chunk_index,
          created_at,
          metadata,
          documents!inner(
            id,
            title,
            user_id,
            category_id
          )
        `)
        .eq('documents.user_id', userId);

      // 构建文本搜索条件 - 使用 OR 连接多个关键词
      const searchConditions = searchTerms.map(term => 
        `content.ilike.%${term}%`
      ).join(',');

      console.log(`🔎 搜索条件: ${searchConditions}`);

      queryBuilder = queryBuilder.or(searchConditions);

      const { data: chunks, error } = await queryBuilder
        .limit(10) // 获取更多结果用于分析
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ 搜索失败:', error.message);
        continue;
      }

      if (!chunks || chunks.length === 0) {
        console.log('📭 没有找到匹配结果');
        continue;
      }

      console.log(`✅ 找到 ${chunks.length} 个匹配结果:`);

      chunks.forEach((chunk, index) => {
        console.log(`\n📄 结果 ${index + 1}:`);
        console.log(`📖 文档: "${chunk.documents.title}"`);
        console.log(`🔸 块索引: ${chunk.chunk_index}`);
        
        // 检查每个搜索词的匹配情况
        const content = chunk.content.toLowerCase();
        const matchedTerms = [];
        const matchDetails = [];
        
        searchTerms.forEach(term => {
          const termLower = term.toLowerCase();
          if (content.includes(termLower)) {
            matchedTerms.push(term);
            
            // 找到匹配位置并显示上下文
            const index = content.indexOf(termLower);
            const start = Math.max(0, index - 30);
            const end = Math.min(content.length, index + termLower.length + 30);
            const context = chunk.content.substring(start, end);
            matchDetails.push(`"${term}": ...${context}...`);
          }
        });
        
        console.log(`🎯 匹配词: [${matchedTerms.join(', ')}]`);
        if (matchDetails.length > 0) {
          console.log(`📝 匹配上下文:`);
          matchDetails.forEach(detail => {
            console.log(`   ${detail}`);
          });
        }
        
        // 显示内容预览
        const preview = chunk.content.substring(0, 100) + (chunk.content.length > 100 ? '...' : '');
        console.log(`📄 内容预览: ${preview}`);
      });

    } catch (error) {
      console.error(`💥 测试 "${test.query}" 失败:`, error.message);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('🔍 额外测试：检查"搞笑修仙门派谱"文档内容');
  console.log('='.repeat(80));

  try {
    const { data: chunks, error } = await supabase
      .from('document_chunks')
      .select(`
        id,
        content,
        chunk_index,
        documents!inner(
          id,
          title
        )
      `)
      .eq('documents.title', '搞笑修仙门派谱');

    if (error) {
      console.error('❌ 查询失败:', error.message);
    } else if (chunks && chunks.length > 0) {
      chunks.forEach(chunk => {
        console.log(`\n📄 块 ${chunk.chunk_index}:`);
        console.log(chunk.content);
        console.log('\n' + '-'.repeat(40));
        
        // 检查是否包含测试词
        const content = chunk.content.toLowerCase();
        const testWords = ['键盘谷', '混吃混喝', '加入'];
        testWords.forEach(word => {
          if (content.includes(word.toLowerCase())) {
            console.log(`🎯 包含词语: "${word}"`);
          }
        });
      });
    } else {
      console.log('📭 没有找到该文档');
    }
  } catch (error) {
    console.error('💥 查询文档内容失败:', error.message);
  }
}

// 运行测试
testKeywordSearchLogic().catch(console.error);