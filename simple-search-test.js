import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { generateQueryEmbedding } from './api/services/embeddingService.js';
import { extractKeywords } from './api/services/keywordService.js';

// 加载环境变量
dotenv.config();

/**
 * 简化的搜索测试，只显示关键信息
 */
async function simpleSearchTest() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const query = '我想混吃混喝，是否适合加入键盘谷？';
  const userId = '1c85a367-057d-4842-9db9-845e7928686f';
  const limit = 5;

  console.log('=== 搜索测试结果分析 ===\n');
  console.log(`查询: "${query}"\n`);

  // 1. 向量搜索测试
  console.log('🎯 向量搜索结果:');
  try {
    const queryEmbedding = await generateQueryEmbedding(query);
    
    if (queryEmbedding && queryEmbedding.length > 0) {
      const { data: vectorChunks, error } = await supabase
        .rpc('search_similar_chunks_with_category', {
          query_embedding: queryEmbedding,
          target_user_id: userId,
          match_threshold: 0.3,
          match_count: limit,
          category_filter: null
        });
      
      if (error) {
        console.log('❌ 向量搜索失败:', error.message);
      } else if (vectorChunks && vectorChunks.length > 0) {
        vectorChunks.forEach((chunk, index) => {
          console.log(`  ${index + 1}. "${chunk.title}" (相似度: ${chunk.similarity?.toFixed(4)})`);
          
          // 检查不相关文档
          if (chunk.title.includes('supabase平台') || chunk.title.includes('提高搜索效果')) {
            console.log('     ⚠️ 不相关文档！');
          }
          if (chunk.title.includes('搞笑修仙门派谱')) {
            console.log('     ✅ 相关文档');
          }
        });
      } else {
        console.log('  无结果');
      }
    } else {
      console.log('  向量生成失败');
    }
  } catch (error) {
    console.log('❌ 向量搜索异常:', error.message);
  }

  // 2. 关键词搜索测试
  console.log('\n🔑 关键词搜索结果:');
  try {
    const keywords = await extractKeywords(query);
    const searchTerms = keywords.length > 0 ? keywords : [query];
    console.log(`  关键词: [${searchTerms.join(', ')}]`);
    
    let queryBuilder = supabase
      .from('document_chunks')
      .select(`
        id,
        content,
        documents!inner(
          title
        )
      `)
      .eq('documents.user_id', userId);

    const searchConditions = searchTerms.map(term => 
      `content.ilike.%${term}%`
    ).join(',');
    
    queryBuilder = queryBuilder.or(searchConditions);

    const { data: keywordChunks, error } = await queryBuilder
      .limit(limit)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.log('❌ 关键词搜索失败:', error.message);
    } else if (keywordChunks && keywordChunks.length > 0) {
      // 按文档分组
      const docGroups = {};
      keywordChunks.forEach(chunk => {
        const title = chunk.documents.title;
        if (!docGroups[title]) {
          docGroups[title] = [];
        }
        docGroups[title].push(chunk);
      });
      
      Object.keys(docGroups).forEach((title, index) => {
        console.log(`  ${index + 1}. "${title}" (${docGroups[title].length} 个块)`);
        
        // 检查不相关文档
        if (title.includes('supabase平台') || title.includes('提高搜索效果')) {
          console.log('     ⚠️ 不相关文档！');
        }
        if (title.includes('搞笑修仙门派谱')) {
          console.log('     ✅ 相关文档');
        }
      });
    } else {
      console.log('  无结果');
    }
  } catch (error) {
    console.log('❌ 关键词搜索异常:', error.message);
  }

  console.log('\n=== 结论 ===');
  console.log('请查看上述结果，确定哪种搜索返回了不相关文档。');
}

// 运行测试
simpleSearchTest().catch(console.error);