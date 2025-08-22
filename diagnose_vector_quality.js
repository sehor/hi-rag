import { supabaseAdmin } from './api/lib/supabase.ts';
import { generateEmbedding as alibabaGenerateEmbedding } from './api/lib/alibaba-embedding.ts';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

/**
 * 诊断向量搜索质量问题
 */
async function diagnoseVectorQuality() {
  try {
    console.log('🔍 开始诊断向量搜索质量问题...');
    
    // 1. 检查所有文档和文档块的详细信息
    const { data: documents, error: docsError } = await supabaseAdmin
      .from('documents')
      .select('id, title, user_id, created_at')
      .order('created_at', { ascending: false });
    
    if (docsError) {
      console.error('❌ 查询文档失败:', docsError);
      return;
    }
    
    console.log(`\n📄 找到 ${documents?.length || 0} 个文档:`);
    documents?.forEach((doc, index) => {
      console.log(`  ${index + 1}. "${doc.title}" (${doc.created_at})`);
    });
    
    // 2. 检查每个文档的文档块内容
    for (const doc of documents || []) {
      console.log(`\n📝 检查文档 "${doc.title}" 的文档块:`);
      
      const { data: chunks, error: chunksError } = await supabaseAdmin
        .from('document_chunks')
        .select('id, content, chunk_index, embedding')
        .eq('document_id', doc.id)
        .order('chunk_index');
      
      if (chunksError) {
        console.error(`❌ 查询文档块失败:`, chunksError);
        continue;
      }
      
      chunks?.forEach((chunk, index) => {
        const hasEmbedding = chunk.embedding !== null;
        const contentPreview = chunk.content.substring(0, 100) + (chunk.content.length > 100 ? '...' : '');
        console.log(`    块 ${chunk.chunk_index}: ${hasEmbedding ? '✅有向量' : '❌无向量'} - "${contentPreview}"`);
      });
    }
    
    // 3. 测试具体的搜索查询
    console.log('\n🧪 测试具体搜索查询...');
    const testUserId = '1c85a367-057d-4842-9db9-845e7928686f';
    const testQuery = '根据数据库的健康检查，出了什么问题？';
    
    // 生成查询向量
    console.log('🔄 使用阿里云嵌入服务生成查询向量...');
    
    try {
      // 使用阿里云嵌入服务生成查询向量
      const queryEmbedding = await alibabaGenerateEmbedding(testQuery, "Given a web search query, retrieve relevant passages that answer the query");
      
      console.log('✅ 阿里云查询向量生成成功，维度:', queryEmbedding.length);
      
      // 执行向量搜索
      const { data: searchResults, error: searchError } = await supabaseAdmin
        .rpc('search_similar_chunks_with_category', {
          query_embedding: queryEmbedding,
          target_user_id: testUserId,
          match_threshold: 0.3,
          match_count: 10,
          category_filter: null
        });
      
      if (searchError) {
        console.error('❌ 向量搜索失败:', searchError);
      } else {
        console.log(`\n🎯 搜索结果 (${searchResults?.length || 0} 个):`);
        searchResults?.forEach((result, index) => {
          console.log(`\n  ${index + 1}. 相似度: ${result.similarity.toFixed(4)}`);
          console.log(`     文档: "${result.documents.title}"`);
          console.log(`     内容: "${result.content.substring(0, 200)}..."`);
          
          // 检查内容是否包含查询关键词
          const keywords = ['数据库', '健康检查', '问题', 'database', 'health', 'check'];
          const matchedKeywords = keywords.filter(keyword => 
            result.content.toLowerCase().includes(keyword.toLowerCase())
          );
          console.log(`     匹配关键词: [${matchedKeywords.join(', ')}]`);
        });
      }
      
    } catch (embeddingError) {
      console.error('❌ 阿里云嵌入服务调用失败:', embeddingError);
      console.log('⚠️ 无法生成查询向量，跳过向量搜索测试');
    }
    
    // 4. 检查向量数据的统计信息
    console.log('\n📊 向量数据统计:');
    const { data: vectorStats, error: statsError } = await supabaseAdmin
      .from('document_chunks')
      .select('embedding')
      .not('embedding', 'is', null)
      .limit(5);
    
    if (!statsError && vectorStats && vectorStats.length > 0) {
      vectorStats.forEach((chunk, index) => {
        const embedding = chunk.embedding;
        if (Array.isArray(embedding)) {
          const sum = embedding.reduce((a, b) => a + b, 0);
          const avg = sum / embedding.length;
          const variance = embedding.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / embedding.length;
          
          console.log(`  向量 ${index + 1}: 维度=${embedding.length}, 平均值=${avg.toFixed(4)}, 方差=${variance.toFixed(4)}`);
          
          // 检查是否为模拟向量（方差很小或值很规律）
          if (variance < 0.01) {
            console.log(`    ⚠️  可能是模拟向量（方差过小）`);
          }
        }
      });
    }
    
    console.log('\n✅ 诊断完成');
    
  } catch (error) {
    console.error('❌ 诊断过程中发生错误:', error);
  }
}

diagnoseVectorQuality();