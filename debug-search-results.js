import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

/**
 * 调试搜索结果脚本
 * 用于分析为什么特定关键词会匹配到不相关的文档
 */
async function debugSearchResults() {
  // 初始化Supabase客户端
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('=== 调试搜索结果 ===\n');

  // 测试关键词
  const testKeywords = ['键盘谷', '混吃混喝', '提高搜索效果', 'supabase'];

  for (const keyword of testKeywords) {
    console.log(`\n🔍 搜索关键词: "${keyword}"`);
    console.log('=' .repeat(50));

    try {
      // 先搜索内容中包含关键词的文档块
      const { data: contentChunks, error: contentError } = await supabase
        .from('document_chunks')
        .select(`
          id,
          content,
          metadata,
          documents!inner(
            title
          )
        `)
        .ilike('content', `%${keyword}%`)
        .limit(3);

      // 再搜索标题中包含关键词的文档块
      const { data: titleChunks, error: titleError } = await supabase
        .from('document_chunks')
        .select(`
          id,
          content,
          metadata,
          documents!inner(
            title
          )
        `)
        .filter('documents.title', 'ilike', `%${keyword}%`)
        .limit(3);

      if (contentError && titleError) {
        console.error('❌ 查询错误:', contentError?.message || titleError?.message);
        continue;
      }

      // 合并结果并去重
      const allChunks = [];
      const seenIds = new Set();
      
      [...(contentChunks || []), ...(titleChunks || [])].forEach(chunk => {
        if (!seenIds.has(chunk.id)) {
          seenIds.add(chunk.id);
          allChunks.push(chunk);
        }
      });

      const chunks = allChunks.slice(0, 5);
      const error = null;

      if (error) {
        console.error('❌ 查询错误:', error.message);
        continue;
      }

      if (!chunks || chunks.length === 0) {
        console.log('📭 未找到匹配的文档块');
        continue;
      }

      console.log(`📊 找到 ${chunks.length} 个匹配的文档块:\n`);

      chunks.forEach((chunk, index) => {
        console.log(`${index + 1}. 文档标题: ${chunk.documents?.title || '未知'}`);
        console.log(`   文档ID: ${chunk.documents?.id || '未知'}`);
        console.log(`   内容片段: ${chunk.content.substring(0, 200)}...`);
        
        // 高亮显示匹配的关键词
        const contentLower = chunk.content.toLowerCase();
        const keywordLower = keyword.toLowerCase();
        const titleLower = (chunk.documents?.title || '').toLowerCase();
        
        if (contentLower.includes(keywordLower)) {
          console.log(`   ✅ 在内容中找到关键词`);
        }
        if (titleLower.includes(keywordLower)) {
          console.log(`   ✅ 在标题中找到关键词`);
        }
        
        console.log(`   块ID: ${chunk.id}`);
        console.log('   ---');
      });

    } catch (err) {
      console.error(`❌ 搜索关键词 "${keyword}" 时发生错误:`, err.message);
    }
  }

  // 额外检查：查看所有文档的标题
  console.log('\n\n📚 数据库中的所有文档标题:');
  console.log('=' .repeat(50));
  
  try {
    const { data: documents, error } = await supabase
      .from('documents')
      .select('id, title, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ 获取文档列表错误:', error.message);
    } else if (documents) {
      documents.forEach((doc, index) => {
        console.log(`${index + 1}. ${doc.title} (ID: ${doc.id})`);
        console.log(`   创建时间: ${doc.created_at}`);
      });
    }
  } catch (err) {
    console.error('❌ 获取文档列表时发生错误:', err.message);
  }

  // 检查文档块统计信息
  console.log('\n\n📈 文档块统计信息:');
  console.log('=' .repeat(50));
  
  try {
    const { count, error } = await supabase
      .from('document_chunks')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('❌ 获取统计信息错误:', error.message);
    } else {
      console.log(`总文档块数量: ${count}`);
    }
  } catch (err) {
    console.error('❌ 获取统计信息时发生错误:', err.message);
  }
}

// 运行调试脚本
debugSearchResults().catch(console.error);