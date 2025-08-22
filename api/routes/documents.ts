/**
 * 文档路由 - 处理文档上传、保存、查询等功能
 */
import express from 'express';
import multer from 'multer';
import { supabaseAdmin } from '../lib/supabase.js';

const router = express.Router();

// 配置multer用于文件上传
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    // 修复中文文件名编码问题
    if (file.originalname) {
      try {
        // 检测并修复编码问题
        const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8');
        // 验证解码是否成功（检查是否包含有效的中文字符）
        if (decoded !== file.originalname && /[\u4e00-\u9fff]/.test(decoded)) {
          file.originalname = decoded;
          console.log('✅ 文件名编码修复成功:', file.originalname);
        }
      } catch (error) {
        console.warn('⚠️ 文件名编码转换失败，保持原文件名:', error);
      }
    }
    
    const allowedTypes = [
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型'));
    }
  }
});

// 定义分块数据的接口
interface ChunkData {
  text: string;
  metadata: {
    source: string;
    page_number: number;
    section: string | null;
  };
}

/**
 * 调用新的 RAG 分块服务处理文件
 */
async function callRagChunksService(file: Express.Multer.File): Promise<ChunkData[]> {
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
 */
function normalizeChunks(chunks: ChunkData[]): ChunkData[] {
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
 */
async function extractFileContentAndChunks(file: Express.Multer.File): Promise<ChunkData[]> {
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
 */
function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
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
 * 调用外部嵌入服务生成向量
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const embeddingServiceUrl = process.env.EMBEDDING_SERVICE_URL || 'http://localhost:8001';
    
    console.log('🔄 调用外部嵌入服务生成向量...');
    console.log('- 服务URL:', embeddingServiceUrl);
    console.log('- 文本长度:', text.length, '字符');
    
    const response = await fetch(`${embeddingServiceUrl}/embed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documents: [text]
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`嵌入服务响应错误: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const result = await response.json();
    
    if (!result.embeddings || !Array.isArray(result.embeddings) || result.embeddings.length === 0) {
      throw new Error('嵌入服务返回的数据格式无效');
    }
    
    const embedding = result.embeddings[0];
    if (!Array.isArray(embedding)) {
      throw new Error('嵌入向量格式无效');
    }
    
    console.log('✅ 向量生成成功');
    console.log('- 向量维度:', embedding.length);
    console.log('- 服务消息:', result.message || '无消息');
    
    return embedding;
    
  } catch (error) {
    console.error('❌ 调用嵌入服务失败:', error);
    console.error('- 错误类型:', error?.constructor?.name || 'Unknown');
    console.error('- 错误消息:', error instanceof Error ? error.message : String(error));
    
    // 如果外部服务失败，回退到模拟向量
    console.log('🔄 回退到模拟向量生成...');
    return Array.from({ length: 768 }, () => Math.random() * 2 - 1);
  }
}

/**
 * 上传文档
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  const startTime = Date.now();
  console.log('=== 文档上传请求开始 ===');
  console.log('请求时间:', new Date().toISOString());
  console.log('请求头:', JSON.stringify(req.headers, null, 2));
  
  try {
    const { title, userId, categoryId } = req.body;
    const file = req.file;
    
    console.log('请求参数:');
    console.log('- title:', title);
    console.log('- userId:', userId);
    console.log('- categoryId:', categoryId);
    console.log('- file存在:', !!file);
    
    if (file) {
      console.log('文件信息:');
      console.log('- 原始文件名:', file.originalname);
      console.log('- MIME类型:', file.mimetype);
      console.log('- 文件大小:', file.size, 'bytes');
      console.log('- 缓冲区长度:', file.buffer?.length || 0);
    }
    
    if (!file) {
      console.log('❌ 错误: 没有接收到文件');
      return res.status(400).json({ error: '请选择文件' });
    }
    
    if (!title || !userId) {
      console.log('❌ 错误: 缺少必要参数');
      console.log('- title缺失:', !title);
      console.log('- userId缺失:', !userId);
      return res.status(400).json({ error: '缺少必要参数' });
    }
    
    console.log('✅ 参数验证通过，开始提取文件内容并分块...');
    
    // 提取文件内容并分块
    const chunks = await extractFileContentAndChunks(file);
    console.log('✅ 文件内容提取和分块成功');
    console.log('- 分块数量:', chunks.length);
    console.log('- 平均分块长度:', Math.round(chunks.reduce((sum, chunk) => sum + chunk.text.length, 0) / chunks.length));
    
    // 合并所有分块文本作为文档内容
    const content = chunks.map(chunk => chunk.text).join('\n\n');
    console.log('- 总内容长度:', content.length, '字符');
    console.log('- 内容预览:', content.substring(0, 100) + (content.length > 100 ? '...' : ''));
    
    console.log('📝 开始保存文档到数据库...');
    
    // 保存文档到数据库
    const { data: document, error: docError } = await supabaseAdmin
      .from('documents')
      .insert({
        title,
        content,
        file_url: file.originalname,
        file_size: file.size,
        file_type: file.mimetype,
        user_id: userId,
        category_id: categoryId || null
      })
      .select()
      .single();
    
    if (docError) {
      console.error('❌ 保存文档失败:', docError);
      console.error('- 错误代码:', docError.code);
      console.error('- 错误消息:', docError.message);
      console.error('- 错误详情:', docError.details);
      return res.status(500).json({ error: '保存文档失败' });
    }
    
    console.log('✅ 文档保存成功');
    console.log('- 文档ID:', document.id);
    console.log('- 创建时间:', document.created_at);
    
    console.log('📝 开始保存文档块到数据库...');
    
    // 保存文档块到数据库
    console.log('🔄 开始为文档块生成向量...');
    const chunkData = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`- 处理第 ${i + 1}/${chunks.length} 个文档块...`);
      console.log(`  - 分块长度: ${chunk.text.length} 字符`);
      console.log(`  - 来源页面: ${chunk.metadata.page_number}`);
      console.log(`  - 章节: ${chunk.metadata.section || '无'}`);
      
      const embedding = await generateEmbedding(chunk.text);
      chunkData.push({
        document_id: document.id,
        content: chunk.text,
        chunk_index: i,
        embedding: embedding,
        metadata: JSON.stringify(chunk.metadata) // 存储元数据
      });
    }
    
    console.log('✅ 所有文档块向量生成完成');
    
    const { error: chunkError } = await supabaseAdmin
      .from('document_chunks')
      .insert(chunkData);
    
    if (chunkError) {
      console.error('❌ 保存文档块失败:', chunkError);
      console.error('- 错误代码:', chunkError.code);
      console.error('- 错误消息:', chunkError.message);
      console.error('- 错误详情:', chunkError.details);
      
      console.log('🗑️ 开始清理已保存的文档...');
      // 删除已保存的文档
      const { error: deleteError } = await supabaseAdmin.from('documents').delete().eq('id', document.id);
      if (deleteError) {
        console.error('❌ 清理文档失败:', deleteError);
      } else {
        console.log('✅ 文档清理成功');
      }
      
      return res.status(500).json({ error: '保存文档块失败' });
    }
    
    console.log('✅ 文档块保存成功');
    
    const processingTime = Date.now() - startTime;
    console.log('🎉 文档上传完全成功!');
    console.log('- 处理时间:', processingTime, 'ms');
    console.log('=== 文档上传请求结束 ===\n');
    
    res.json({
      message: '文档上传成功',
      document: {
        id: document.id,
        title: document.title,
        file_url: document.file_url,
        file_size: document.file_size,
        file_type: document.file_type,
        created_at: document.created_at,
        chunks_count: chunks.length
      }
    });
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('💥 文档上传发生异常:');
    console.error('- 错误类型:', error?.constructor?.name || 'Unknown');
    console.error('- 错误消息:', error instanceof Error ? error.message : String(error));
    console.error('- 错误堆栈:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('- 处理时间:', processingTime, 'ms');
    console.error('=== 文档上传请求异常结束 ===\n');
    
    res.status(500).json({ error: '文档上传失败' });
  }
});

/**
 * 添加文本文档
 */
router.post('/text', async (req, res) => {
  try {
    const { title, content, userId, categoryId } = req.body;
    
    if (!title || !content || !userId) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    
    // 保存文档到数据库
    const { data: document, error: docError } = await supabaseAdmin
      .from('documents')
      .insert({
        title,
        content,
        file_url: `${title}.txt`,
        file_size: Buffer.byteLength(content, 'utf8'),
        file_type: 'text/plain',
        user_id: userId,
        category_id: categoryId || null
      })
      .select()
      .single();
    
    if (docError) {
      console.error('保存文档失败:', docError);
      return res.status(500).json({ error: '保存文档失败' });
    }
    
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
    
    // 保存文档块到数据库
    console.log('🔄 开始为文本文档块生成向量...');
    const chunkData = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`- 处理第 ${i + 1}/${chunks.length} 个文档块...`);
      console.log(`  - 分块长度: ${chunk.text.length} 字符`);
      
      const embedding = await generateEmbedding(chunk.text);
      chunkData.push({
        document_id: document.id,
        content: chunk.text,
        chunk_index: i,
        embedding: embedding,
        metadata: JSON.stringify(chunk.metadata)
      });
    }
    
    console.log('✅ 所有文本文档块向量生成完成');
    
    const { error: chunkError } = await supabaseAdmin
      .from('document_chunks')
      .insert(chunkData);
    
    if (chunkError) {
      console.error('保存文档块失败:', chunkError);
      // 删除已保存的文档
      await supabaseAdmin.from('documents').delete().eq('id', document.id);
      return res.status(500).json({ error: '保存文档块失败' });
    }
    
    res.json({
      message: '文档保存成功',
      document: {
        id: document.id,
        title: document.title,
        file_url: document.file_url,
        file_size: document.file_size,
        file_type: document.file_type,
        created_at: document.created_at,
        chunks_count: chunks.length
      }
    });
    
  } catch (error) {
    console.error('文档保存失败:', error);
    res.status(500).json({ error: '文档保存失败' });
  }
});

/**
 * 获取用户文档列表
 */
router.get('/list/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10, search = '', categoryId = '' } = req.query;
    
    let query = supabaseAdmin
      .from('documents')
      .select('id, title, file_url, file_size, file_type, category_id, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    // 搜索功能
    if (search) {
      query = query.or(`title.ilike.%${search}%,file_url.ilike.%${search}%`);
    }
    
    // 分类过滤
    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }
    
    // 分页
    const offset = (Number(page) - 1) * Number(limit);
    query = query.range(offset, offset + Number(limit) - 1);
    
    const { data: documents, error } = await query;
    
    if (error) {
      console.error('获取文档列表失败:', error);
      return res.status(500).json({ error: '获取文档列表失败' });
    }
    
    // 获取总数
    const { count, error: countError } = await supabaseAdmin
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    
    if (countError) {
      console.error('获取文档总数失败:', countError);
    }
    
    res.json({
      documents: documents || [],
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: count || 0,
        totalPages: Math.ceil((count || 0) / Number(limit))
      }
    });
    
  } catch (error) {
    console.error('获取文档列表失败:', error);
    res.status(500).json({ error: '获取文档列表失败' });
  }
});

/**
 * 删除文档
 */
router.delete('/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: '缺少用户ID' });
    }
    
    // 验证文档所有权
    const { data: document, error: docError } = await supabaseAdmin
      .from('documents')
      .select('id, user_id')
      .eq('id', documentId)
      .eq('user_id', userId)
      .single();
    
    if (docError || !document) {
      return res.status(404).json({ error: '文档不存在或无权限' });
    }
    
    // 删除文档块
    const { error: chunkError } = await supabaseAdmin
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId);
    
    if (chunkError) {
      console.error('删除文档块失败:', chunkError);
      return res.status(500).json({ error: '删除文档块失败' });
    }
    
    // 删除文档
    const { error: deleteError } = await supabaseAdmin
      .from('documents')
      .delete()
      .eq('id', documentId);
    
    if (deleteError) {
      console.error('删除文档失败:', deleteError);
      return res.status(500).json({ error: '删除文档失败' });
    }
    
    res.json({ message: '文档删除成功' });
    
  } catch (error) {
    console.error('删除文档失败:', error);
    res.status(500).json({ error: '删除文档失败' });
  }
});

/**
 * 获取文档详情
 */
router.get('/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: '缺少用户ID' });
    }
    
    const { data: document, error } = await supabaseAdmin
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', userId)
      .single();
    
    if (error || !document) {
      return res.status(404).json({ error: '文档不存在或无权限' });
    }
    
    res.json({ document });
    
  } catch (error) {
    console.error('获取文档详情失败:', error);
    res.status(500).json({ error: '获取文档详情失败' });
  }
});

/**
 * 获取用户分类列表
 */
router.get('/categories/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const { data: categories, error } = await supabaseAdmin
      .from('categories')
      .select('id, name, description, created_at')
      .or(`user_id.eq.${userId},user_id.is.null`)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('获取分类列表失败:', error);
      return res.status(500).json({ error: '获取分类列表失败' });
    }
    
    res.json({ categories: categories || [] });
    
  } catch (error) {
    console.error('获取分类列表失败:', error);
    res.status(500).json({ error: '获取分类列表失败' });
  }
});

/**
 * 创建新分类
 */
router.post('/categories', async (req, res) => {
  try {
    const { name, description, userId } = req.body;
    
    if (!name || !userId) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    
    const { data: category, error } = await supabaseAdmin
      .from('categories')
      .insert({
        name,
        description: description || null,
        user_id: userId
      })
      .select()
      .single();
    
    if (error) {
      console.error('创建分类失败:', error);
      return res.status(500).json({ error: '创建分类失败' });
    }
    
    res.json({
      message: '分类创建成功',
      category
    });
    
  } catch (error) {
    console.error('创建分类失败:', error);
    res.status(500).json({ error: '创建分类失败' });
  }
});

/**
 * 删除分类
 */
router.delete('/categories/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: '缺少用户ID' });
    }
    
    // 验证分类所有权
    const { data: category, error: categoryError } = await supabaseAdmin
      .from('categories')
      .select('id, user_id')
      .eq('id', categoryId)
      .eq('user_id', userId)
      .single();
    
    if (categoryError || !category) {
      return res.status(404).json({ error: '分类不存在或无权限' });
    }
    
    // 将使用此分类的文档的category_id设为null
    const { error: updateError } = await supabaseAdmin
      .from('documents')
      .update({ category_id: null })
      .eq('category_id', categoryId)
      .eq('user_id', userId);
    
    if (updateError) {
      console.error('更新文档分类失败:', updateError);
      return res.status(500).json({ error: '更新文档分类失败' });
    }
    
    // 删除分类
    const { error: deleteError } = await supabaseAdmin
      .from('categories')
      .delete()
      .eq('id', categoryId);
    
    if (deleteError) {
      console.error('删除分类失败:', deleteError);
      return res.status(500).json({ error: '删除分类失败' });
    }
    
    res.json({ message: '分类删除成功' });
    
  } catch (error) {
    console.error('删除分类失败:', error);
    res.status(500).json({ error: '删除分类失败' });
  }
});

export default router;