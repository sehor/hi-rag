import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { generateQueryEmbedding } from './api/services/embeddingService.js';
import { extractKeywords } from './api/services/keywordService.js';

// 加载环境变量
dotenv.config();

/**
 * 分别测试向量搜索和关键词搜索
 * 用于确定哪种搜索方式返回了不相关的文档
 */
async function testSearchSeparation() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const query = '我想混吃混喝，是否适合加入键盘谷？';
  const userId = '1c85a367-057d-4842-9db9-845e7928686f';
  const limit = 5;

  console.log('=== 分别测试向量搜索和关键词搜索 ===\n');
  console.log(`🔍 测试查询: "${query}"`);
  console.log(`👤 用户ID: ${userId}`);
  console.log(`📊 结果限制: ${limit}\n`);

  // 1. 测试向量搜索
  console.log('🎯 === 向量搜索测试 ===');
  console.log('='.repeat(60));
  
  try {
    console.log('📝 生成查询向量...');
    const queryEmbedding = await generateQueryEmbedding(query);
    
    if (!queryEmbedding || queryEmbedding.length === 0) {
      console.log('❌ 向量生成失败');
    } else {
      console.log(`✅ 向量生成成功，维度: ${queryEmbedding.length}`);
      
      // 执行向量搜索
      const { data: vectorChunks, error: vectorError } = await supabase
        .rpc('search_similar_chunks_with_category', {
          query_embedding: queryEmbedding,
          target_user_id: userId,
          match_threshold: 0.3,
          match_count: limit,
          category_filter: null
        });
      
      if (vectorError) {
        console.error('❌ 向量搜索失败:', vectorError.message);
      } else {
        console.log(`\n📊 向量搜索结果: ${vectorChunks?.length || 0} 个`);
        
        if (vectorChunks && vectorChunks.length > 0) {
          vectorChunks.forEach((chunk, index) => {
            console.log(`\n📄 向量结果 ${index + 1}:`);
            console.log(`📖 文档标题: "${chunk.title}"`);
            console.log(`🎯 相似度分数: ${chunk.similarity?.toFixed(4) || 'N/A'}`);
            console.log(`🔸 块索引: ${chunk.chunk_index}`);
            console.log(`📝 内容预览: ${chunk.content.substring(0, 150)}...`);
            
            // 检查是否为不相关文档
            const irrelevantTitles = [
              '关于supabase平台的安全和性能警告已经数据库迁移文件的问题',
              '提高搜索效果'
            ];
            
            if (irrelevantTitles.some(title => chunk.title.includes(title))) {
              console.log(`⚠️  这是不相关文档！`);
            }
            
            if (chunk.title.includes('搞笑修仙门派谱')) {
              console.log(`✅ 这是相关文档`);
            }
          });
        } else {
          console.log('📭 向量搜索无结果');
        }
      }
    }
  } catch (error) {
    console.error('💥 向量搜索测试失败:', error.message);
  }

  // 2. 测试关键词搜索
  console.log('\n\n🔑 === 关键词搜索测试 ===');
  console.log('='.repeat(60));
  
  try {
    console.log('📝 提取关键词...');
    const keywords = await extractKeywords(query);
    console.log(`🔑 提取的关键词: [${keywords.join(', ')}]`);
    
    // 如果没有关键词，使用原始查询
    const searchTerms = keywords.length > 0 ? keywords : [query];
    console.log(`🔍 实际搜索词: [${searchTerms.join(', ')}]`);
    
    // 执行关键词搜索
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

    // 构建文本搜索条件
    const searchConditions = searchTerms.map(term => 
      `content.ilike.%${term}%`
    ).join(',');
    
    console.log(`🔎 搜索条件: ${searchConditions}`);
    queryBuilder = queryBuilder.or(searchConditions);

    const { data: keywordChunks, error: keywordError } = await queryBuilder
      .limit(limit)
      .order('created_at', { ascending: false });
    
    if (keywordError) {
      console.error('❌ 关键词搜索失败:', keywordError.message);
    } else {
      console.log(`\n📊 关键词搜索结果: ${keywordChunks?.length || 0} 个`);
      
      if (keywordChunks && keywordChunks.length > 0) {
        // 计算关键词匹配分数
        const scoredChunks = keywordChunks.map(chunk => {
          const content = chunk.content.toLowerCase();
          let score = 0;
          let matchedTerms = [];
          
          searchTerms.forEach(term => {
            const termLower = term.toLowerCase();
            const matches = (content.match(new RegExp(termLower, 'g')) || []).length;
            if (matches > 0) {
              score += matches;
              matchedTerms.push(`${term}(${matches})`);
            }
          });
          
          return {
            ...chunk,
            keyword_score: score,
            matched_terms: matchedTerms
          };
        }).sort((a, b) => b.keyword_score - a.keyword_score);
        
        scoredChunks.forEach((chunk, index) => {
          console.log(`\n📄 关键词结果 ${index + 1}:`);
          console.log(`📖 文档标题: "${chunk.documents.title}"`);
          console.log(`🎯 关键词分数: ${chunk.keyword_score}`);
          console.log(`🔍 匹配词: [${chunk.matched_terms.join(', ')}]`);
          console.log(`🔸 块索引: ${chunk.chunk_index}`);
          console.log(`📝 内容预览: ${chunk.content.substring(0, 150)}...`);
          
          // 检查是否为不相关文档
          const irrelevantTitles = [
            '关于supabase平台的安全和性能警告已经数据库迁移文件的问题',
            '提高搜索效果'
          ];
          
          if (irrelevantTitles.some(title => chunk.documents.title.includes(title))) {
            console.log(`⚠️  这是不相关文档！`);
            
            // 显示匹配的具体位置
            searchTerms.forEach(term => {
              const termLower = term.toLowerCase();
              const contentLower = chunk.content.toLowerCase();
              const index = contentLower.indexOf(termLower);
              if (index !== -1) {
                const start = Math.max(0, index - 30);
                const end = Math.min(chunk.content.length, index + term.length + 30);
                const context = chunk.content.substring(start, end);
                console.log(`   🎯 "${term}" 匹配上下文: ...${context}...`);
              }
            });
          }
          
          if (chunk.documents.title.includes('搞笑修仙门派谱')) {
            console.log(`✅ 这是相关文档`);
          }
        });
      } else {
        console.log('📭 关键词搜索无结果');
      }
    }
  } catch (error) {
    console.error('💥 关键词搜索测试失败:', error.message);
  }

  // 3. 总结分析
  console.log('\n\n📋 === 分析总结 ===');
  console.log('='.repeat(60));
  console.log('🔍 请查看上述结果，确定哪种搜索方式返回了不相关文档:');
  console.log('   - 如果向量搜索返回了不相关文档，问题可能在于向量相似度计算');
  console.log('   - 如果关键词搜索返回了不相关文档，问题可能在于关键词匹配逻辑');
  console.log('   - 如果两种搜索都返回了不相关文档，需要进一步优化搜索策略');
}

// 运行测试
testSearchSeparation().catch(console.error);