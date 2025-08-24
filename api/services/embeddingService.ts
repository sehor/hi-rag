import { generateEmbedding as alibabaGenerateEmbedding } from '../lib/alibaba-embedding.js';

/**
 * 调用阿里云嵌入服务生成查询向量
 * @param query 查询文本
 * @returns 向量数组
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  try {
    console.log('🔄 生成查询向量...');
    
    // 使用阿里云嵌入服务，为查询文本生成向量，使用检索优化指令
    const embedding = await alibabaGenerateEmbedding(query, "Given a web search query, retrieve relevant passages that answer the query");
    
    console.log('✅ 查询向量生成成功');
    
    return embedding;
    
  } catch (error) {
    console.error('❌ 嵌入服务失败:', error instanceof Error ? error.message : String(error));
    
    // 嵌入服务失败时直接抛出错误，不使用随机模拟向量
    throw new Error(`阿里云嵌入服务失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 调用阿里云嵌入服务生成文档向量
 * @param text 文档文本
 * @returns 向量数组
 */
export async function generateDocumentEmbedding(text: string): Promise<number[]> {
  try {
    console.log('🔄 生成文档向量...');
    
    // 使用阿里云嵌入服务，为文档文本生成向量，使用文档优化指令
    const embedding = await alibabaGenerateEmbedding(text, "Represent this document for retrieval");
    
    console.log('✅ 文档向量生成成功');
    
    return embedding;
    
  } catch (error) {
    console.error('❌ 嵌入服务失败:', error instanceof Error ? error.message : String(error));
    
    // 嵌入服务失败时直接抛出错误
    throw new Error(`阿里云嵌入服务失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}