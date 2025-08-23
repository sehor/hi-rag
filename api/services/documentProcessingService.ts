import { generateDocumentEmbedding } from './embeddingService.js';

// 定义分块数据的接口
export interface ChunkData {
  text: string;
  metadata: {
    source: string;
    page_number: number;
    section: string | null;
  };
}

/**
 * 调用新的 RAG 分块服务处理文件
 * @param file 上传的文件
 * @returns 分块数据数组
 */
export async function callRagChunksService(file: Express.Multer.File): Promise<ChunkData[]> {
  console.log('🔄 调用 RAG 分块服务处理文件...');
  console.log('- 文件名:', file.originalname);
  console.log('- 文件类型:', file.mimetype);
  console.log('- 文件大小:', file.size, 'bytes');
  
  try {
    // 构建FormData发送给RAG分块服务
    const formData = new FormData();
    const blob = new Blob([file.buffer], { type: file.mimetype });
    formData.append('file', blob, file.originalname);
    
    // 添加语言参数
    formData.append('languages', '["zho", "eng"]'); // 中文和英文支持
    
    // 调用新的 RAG 分块服务
    const unstructuredUrl = process.env.UNSTRUCTURED_API_URL || 'http://localhost:8000';
    const response = await fetch(`${unstructuredUrl}/partition/rag-chunks`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`RAG分块服务响应错误: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ RAG分块服务处理完成');
    console.log('- 返回分块数量:', result.length);
    
    if (!Array.isArray(result)) {
      throw new Error('RAG分块服务返回的数据格式无效');
    }
    
    // 验证返回的数据格式
    const validChunks = result.filter(chunk => 
      chunk && 
      typeof chunk.text === 'string' && 
      chunk.text.trim() && 
      chunk.metadata &&
      typeof chunk.metadata.source === 'string'
    );
    
    if (validChunks.length === 0) {
      throw new Error('未能从文档中提取到有效的分块内容');
    }
    
    console.log('- 有效分块数量:', validChunks.length);
    console.log('- 平均分块长度:', Math.round(validChunks.reduce((sum, chunk) => sum + chunk.text.length, 0) / validChunks.length));
    
    return validChunks;
    
  } catch (error) {
    console.error('❌ RAG分块服务调用失败:', error);
    console.error('- 错误类型:', error?.constructor?.name || 'Unknown');
    console.error('- 错误消息:', error instanceof Error ? error.message : String(error));
    throw new Error(`文件处理失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * 标准化文本块大小 - 合并过小的块，分割过大的块
 * @param chunks 原始分块数组
 * @returns 标准化后的分块数组
 */
export function normalizeChunks(chunks: ChunkData[]): ChunkData[] {
  console.log('🔧 开始标准化文本块...');
  console.log('- 原始分块数量:', chunks.length);
  
  const MIN_CHUNK_SIZE = 512;
  const MAX_CHUNK_SIZE = 1024;
  const normalizedChunks: ChunkData[] = [];
  
  let i = 0;
  while (i < chunks.length) {
    const currentChunk = chunks[i];
    
    // 如果当前块过大，需要分割
    if (currentChunk.text.length > MAX_CHUNK_SIZE) {
      console.log(`- 分割过大文本块 (${currentChunk.text.length} 字符)`);
      
      // 按最大尺寸分割文本
      let start = 0;
      let partIndex = 0;
      
      while (start < currentChunk.text.length) {
        const end = Math.min(start + MAX_CHUNK_SIZE, currentChunk.text.length);
        const partText = currentChunk.text.slice(start, end).trim();
        
        if (partText.length > 0) {
          normalizedChunks.push({
            text: partText,
            metadata: {
              ...currentChunk.metadata,
              section: currentChunk.metadata.section ? 
                `${currentChunk.metadata.section}_part${partIndex + 1}` : 
                `part${partIndex + 1}`
            }
          });
          partIndex++;
        }
        
        start = end;
      }
      
      i++;
    }
    // 如果当前块过小，尝试与后续块合并
    else if (currentChunk.text.length < MIN_CHUNK_SIZE && i < chunks.length - 1) {
      console.log(`- 合并过小文本块 (${currentChunk.text.length} 字符)`);
      
      let mergedText = currentChunk.text;
      let mergedMetadata = currentChunk.metadata;
      let j = i + 1;
      
      // 继续合并后续的小块，直到达到最小尺寸或没有更多块
      while (j < chunks.length && mergedText.length < MIN_CHUNK_SIZE) {
        const nextChunk = chunks[j];
        const potentialMerged = mergedText + '\n\n' + nextChunk.text;
        
        // 如果合并后不会超过最大尺寸，则合并
        if (potentialMerged.length <= MAX_CHUNK_SIZE) {
          mergedText = potentialMerged;
          j++;
        } else {
          break;
        }
      }
      
      normalizedChunks.push({
        text: mergedText.trim(),
        metadata: mergedMetadata
      });
      
      i = j;
    }
    // 大小合适的块直接保留
    else {
      normalizedChunks.push(currentChunk);
      i++;
    }
  }
  
  console.log('✅ 文本块标准化完成');
  console.log('- 标准化后分块数量:', normalizedChunks.length);
  console.log('- 平均分块长度:', Math.round(normalizedChunks.reduce((sum, chunk) => sum + chunk.text.length, 0) / normalizedChunks.length));
  
  // 验证所有块的大小
  const oversizedChunks = normalizedChunks.filter(chunk => chunk.text.length > MAX_CHUNK_SIZE);
  const undersizedChunks = normalizedChunks.filter(chunk => chunk.text.length < MIN_CHUNK_SIZE);
  
  if (oversizedChunks.length > 0) {
    console.warn(`⚠️ 仍有 ${oversizedChunks.length} 个过大的文本块`);
  }
  if (undersizedChunks.length > 0) {
    console.warn(`⚠️ 仍有 ${undersizedChunks.length} 个过小的文本块`);
  }
  
  return normalizedChunks;
}

/**
 * 提取文件内容并分块 - 使用新的 RAG 分块服务
 * @param file 上传的文件
 * @returns 分块数据数组
 */
export async function extractFileContentAndChunks(file: Express.Multer.File): Promise<ChunkData[]> {
  console.log('🔍 开始提取文件内容并分块...');
  console.log('- 文件类型:', file.mimetype);
  console.log('- 文件大小:', file.size, 'bytes');
  
  try {
    let chunks: ChunkData[];
    
    switch (file.mimetype) {
      case 'application/pdf':
        console.log('📄 处理PDF文件 - 使用RAG分块服务...');
        chunks = await callRagChunksService(file);
        break;
      
      case 'text/plain':
        console.log('📝 处理文本文件...');
        const textContent = file.buffer.toString('utf-8');
        console.log('✅ 文本文件处理完成');
        console.log('- 文本长度:', textContent.length, '字符');
        // 对于纯文本文件，创建单个分块
        chunks = [{
          text: textContent,
          metadata: {
            source: file.originalname,
            page_number: 1,
            section: null
          }
        }];
        break;
      
      case 'application/msword':
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        console.log('📄 处理Word文档 - 使用RAG分块服务...');
        chunks = await callRagChunksService(file);
        break;
      
      default:
        console.error('❌ 不支持的文件类型:', file.mimetype);
        throw new Error('不支持的文件类型');
    }
    
    // 对所有文件类型的分块进行标准化处理
    const normalizedChunks = normalizeChunks(chunks);
    
    return normalizedChunks;
  } catch (error) {
    console.error('💥 文件内容提取异常:');
    console.error('- 错误类型:', error?.constructor?.name || 'Unknown');
    console.error('- 错误消息:', error instanceof Error ? error.message : String(error));
    console.error('- 错误堆栈:', error instanceof Error ? error.stack : 'No stack trace');
    throw new Error('文件内容提取失败');
  }
}

/**
 * 将文本分块
 * @param text 要分块的文本
 * @param chunkSize 分块大小
 * @param overlap 重叠大小
 * @returns 分块后的文本数组
 */
export function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end);
    chunks.push(chunk.trim());
    
    if (end === text.length) break;
    start = end - overlap;
  }
  
  return chunks.filter(chunk => chunk.length > 0);
}

/**
 * 为文档分块生成向量并准备数据库插入数据
 * @param chunks 分块数组
 * @param documentId 文档ID
 * @returns 准备插入数据库的分块数据数组
 */
export async function generateChunkEmbeddings(chunks: ChunkData[], documentId: string) {
  console.log('🔄 开始为文档块生成向量...');
  const chunkData = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`- 处理第 ${i + 1}/${chunks.length} 个文档块...`);
    console.log(`  - 分块长度: ${chunk.text.length} 字符`);
    console.log(`  - 来源页面: ${chunk.metadata.page_number}`);
    console.log(`  - 章节: ${chunk.metadata.section || '无'}`);
    
    const embedding = await generateDocumentEmbedding(chunk.text);
    chunkData.push({
      document_id: documentId,
      content: chunk.text,
      chunk_index: i,
      embedding: embedding,
      metadata: JSON.stringify(chunk.metadata) // 存储元数据
    });
  }
  
  console.log('✅ 所有文档块向量生成完成');
  return chunkData;
}

/**
 * 处理文本文档的分块和向量生成
 * @param content 文本内容
 * @param title 文档标题
 * @param documentId 文档ID
 * @returns 准备插入数据库的分块数据数组
 */
export async function processTextDocument(content: string, title: string, documentId: string) {
  console.log('🔄 开始处理文本文档...');
  
  // 对于文本文档，使用手动分块（因为不需要调用外部服务）
  const textChunks = chunkText(content);
  
  // 转换为统一的分块格式
  const rawChunks: ChunkData[] = textChunks.map(chunk => ({
    text: chunk,
    metadata: {
      source: `${title}.txt`,
      page_number: 1,
      section: null
    }
  }));
  
  // 对文本块进行标准化处理
  const chunks = normalizeChunks(rawChunks);
  
  // 生成向量
  return await generateChunkEmbeddings(chunks, documentId);
}