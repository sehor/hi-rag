import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

/**
 * 调试文档内容搜索，查看实际的文档块内容
 */
async function debugContentSearch() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('=== 调试文档内容搜索 ===\n');

  // 测试关键词列表
  const testKeywords = ['键盘谷', '混吃混喝', '加入', '提高搜索效果', 'supabase'];

  try {
    // 首先查看所有文档块的内容
    console.log('📚 查看所有文档块内容:');
    const { data: allChunks, error: allError } = await supabase
      .from('document_chunks')
      .select(`
        id,
        content,
        chunk_index,
        documents!inner(
          id,
          title,
          user_id
        )
      `)
      .order('documents(title)', { ascending: true })
      .order('chunk_index', { ascending: true });

    if (allError) {
      console.error('❌ 查询所有文档块失败:', allError.message);
      return;
    }

    if (!allChunks || allChunks.length === 0) {
      console.log('📭 没有找到任何文档块');
      return;
    }

    console.log(`\n📊 总共找到 ${allChunks.length} 个文档块\n`);

    // 按文档分组显示内容
    const documentGroups = {};
    allChunks.forEach(chunk => {
      const docTitle = chunk.documents.title;
      if (!documentGroups[docTitle]) {
        documentGroups[docTitle] = [];
      }
      documentGroups[docTitle].push(chunk);
    });

    // 显示每个文档的内容
    Object.entries(documentGroups).forEach(([title, chunks]) => {
      console.log(`\n📖 文档: "${title}"`);
      console.log(`📄 文档块数量: ${chunks.length}`);
      console.log('=' .repeat(60));
      
      chunks.forEach((chunk, index) => {
        console.log(`\n🔸 块 ${chunk.chunk_index + 1}:`);
        console.log(chunk.content.substring(0, 200) + (chunk.content.length > 200 ? '...' : ''));
        console.log(`📏 完整长度: ${chunk.content.length} 字符`);
      });
    });

    console.log('\n' + '='.repeat(80));
    console.log('🔍 测试关键词匹配:');
    console.log('='.repeat(80));

    // 测试每个关键词
    for (const keyword of testKeywords) {
      console.log(`\n🔎 搜索关键词: "${keyword}"`);
      console.log('-'.repeat(40));
      
      let foundMatches = false;
      
      // 在所有文档块中搜索关键词
      allChunks.forEach(chunk => {
        const content = chunk.content.toLowerCase();
        const title = chunk.documents.title.toLowerCase();
        const searchKeyword = keyword.toLowerCase();
        
        const contentMatch = content.includes(searchKeyword);
        const titleMatch = title.includes(searchKeyword);
        
        if (contentMatch || titleMatch) {
          foundMatches = true;
          console.log(`\n✅ 找到匹配:`);
          console.log(`📖 文档: "${chunk.documents.title}"`);
          console.log(`📄 块索引: ${chunk.chunk_index}`);
          console.log(`🎯 匹配位置: ${titleMatch ? '标题' : ''}${titleMatch && contentMatch ? ' + ' : ''}${contentMatch ? '内容' : ''}`);
          
          if (contentMatch) {
            // 显示匹配的上下文
            const index = content.indexOf(searchKeyword);
            const start = Math.max(0, index - 50);
            const end = Math.min(content.length, index + searchKeyword.length + 50);
            const context = chunk.content.substring(start, end);
            console.log(`📝 匹配上下文: ...${context}...`);
          }
        }
      });
      
      if (!foundMatches) {
        console.log(`❌ 未找到包含 "${keyword}" 的内容`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 统计信息:');
    console.log('='.repeat(80));
    
    Object.entries(documentGroups).forEach(([title, chunks]) => {
      const totalChars = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);
      console.log(`📖 "${title}": ${chunks.length} 块, ${totalChars} 字符`);
    });
    
  } catch (error) {
    console.error('💥 调试失败:', error.message);
  }
}

// 运行调试
debugContentSearch().catch(console.error);