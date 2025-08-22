import { supabaseAdmin } from './api/lib/supabase.ts';
import { generateEmbedding as alibabaGenerateEmbedding } from './api/lib/alibaba-embedding.ts';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 解析命令行参数
const args = process.argv.slice(2);
const forceAll = args.includes('--force-all');

/**
 * 生成文本的向量嵌入
 */
async function generateEmbedding(text) {
  try {
    console.log('🔄 调用阿里云嵌入服务生成向量...');
    console.log('- 文本长度:', text.length, '字符');
    
    // 使用阿里云嵌入服务，为文档内容生成向量
    const embedding = await alibabaGenerateEmbedding(text, "Generate embeddings for document content to enable semantic search and retrieval");
    
    console.log('✅ 阿里云向量生成成功');
    console.log('- 向量维度:', embedding.length);
    
    return embedding;
    
  } catch (error) {
    console.error('❌ 调用阿里云嵌入服务失败:', error);
    console.error('- 错误类型:', error?.constructor?.name || 'Unknown');
    console.error('- 错误消息:', error instanceof Error ? error.message : String(error));
    
    // 直接抛出错误，不使用随机模拟向量
    throw new Error(`阿里云嵌入服务失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 为文档块重新生成向量
 */
async function regenerateVectors() {
  try {
    if (forceAll) {
      console.log('🔍 查找所有文档块（强制重新生成模式）...');
    } else {
      console.log('🔍 查找缺少向量的文档块...');
    }
    
    // 根据参数决定查询条件
    let query = supabaseAdmin
      .from('document_chunks')
      .select('id, content, document_id')
      .not('content', 'is', null);
    
    if (!forceAll) {
      query = query.is('embedding', null);
    }
    
    const { data: chunks, error: queryError } = await query;
    
    if (queryError) {
      console.error('❌ 查询文档块失败:', queryError);
      return;
    }
    
    if (!chunks || chunks.length === 0) {
      if (forceAll) {
        console.log('✅ 没有找到任何文档块');
      } else {
        console.log('✅ 所有文档块都已有向量数据');
      }
      return;
    }
    
    if (forceAll) {
      console.log(`📝 找到 ${chunks.length} 个文档块，将强制重新生成所有向量`);
      console.log('⚠️  警告：这将覆盖所有现有向量数据');
    } else {
      console.log(`📝 找到 ${chunks.length} 个需要重新生成向量的文档块`);
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`\n🔄 处理第 ${i + 1}/${chunks.length} 个文档块...`);
      console.log(`- ID: ${chunk.id}`);
      console.log(`- 内容长度: ${chunk.content.length} 字符`);
      
      try {
        // 生成向量
        const embedding = await generateEmbedding(chunk.content);
        
        // 更新数据库
        const { error: updateError } = await supabaseAdmin
          .from('document_chunks')
          .update({ embedding: embedding })
          .eq('id', chunk.id);
        
        if (updateError) {
          console.error(`❌ 更新文档块 ${chunk.id} 失败:`, updateError);
          errorCount++;
        } else {
          console.log(`✅ 文档块 ${chunk.id} 向量生成成功`);
          successCount++;
        }
        
        // 添加延迟避免API限制
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`❌ 处理文档块 ${chunk.id} 时发生错误:`, error);
        errorCount++;
      }
    }
    
    console.log('\n📊 处理完成:');
    console.log(`✅ 成功: ${successCount} 个`);
    console.log(`❌ 失败: ${errorCount} 个`);
    
    if (successCount > 0) {
      console.log('\n🎉 向量重新生成完成！现在可以测试搜索功能了。');
    }
    
  } catch (error) {
    console.error('❌ 重新生成向量时发生错误:', error);
  }
}

// 显示使用说明
if (args.includes('--help') || args.includes('-h')) {
  console.log('\n📖 使用说明:');
  console.log('  node regenerate_vectors.js           # 只为缺少向量的文档块生成向量');
  console.log('  node regenerate_vectors.js --force-all  # 强制重新生成所有文档块的向量');
  console.log('  node regenerate_vectors.js --help       # 显示此帮助信息');
  console.log('\n⚠️  注意: --force-all 会覆盖所有现有向量数据，用于解决向量归一化问题\n');
  process.exit(0);
}

regenerateVectors();