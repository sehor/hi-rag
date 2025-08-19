/**
 * 文档管理API路由
 */
import express from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import { supabaseAdmin } from '../lib/supabase.js';

const router = express.Router();

// 配置multer用于文件上传
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
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

/**
 * 提取文件内容
 */
async function extractFileContent(file: Express.Multer.File): Promise<string> {
  try {
    switch (file.mimetype) {
      case 'application/pdf':
        const pdfParse = (await import('pdf-parse')).default;
        const pdfData = await pdfParse(file.buffer);
        return pdfData.text;
      
      case 'text/plain':
        return file.buffer.toString('utf-8');
      
      case 'application/msword':
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        return result.value;
      
      default:
        throw new Error('不支持的文件类型');
    }
  } catch (error) {
    console.error('文件内容提取失败:', error);
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
 * 模拟向量化处理（因为没有OpenAI API）
 */
function generateMockEmbedding(): number[] {
  // 生成1536维的模拟向量（OpenAI text-embedding-ada-002的维度）
  return Array.from({ length: 1536 }, () => Math.random() * 2 - 1);
}

/**
 * 上传文档
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { title, userId } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: '请选择文件' });
    }
    
    if (!title || !userId) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    
    // 提取文件内容
    const content = await extractFileContent(file);
    
    // 保存文档到数据库
    const { data: document, error: docError } = await supabaseAdmin
      .from('documents')
      .insert({
        title,
        content,
        file_url: file.originalname,
        file_size: file.size,
        file_type: file.mimetype,
        user_id: userId
      })
      .select()
      .single();
    
    if (docError) {
      console.error('保存文档失败:', docError);
      return res.status(500).json({ error: '保存文档失败' });
    }
    
    // 将文本分块
    const chunks = chunkText(content);
    
    // 保存文档块到数据库
    const chunkData = chunks.map((chunk, index) => ({
      document_id: document.id,
      content: chunk,
      chunk_index: index,
      embedding: generateMockEmbedding() // 模拟向量
    }));
    
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
      message: '文档上传成功',
      document: {
        id: document.id,
        title: document.title,
        file_name: document.file_url,
        file_size: document.file_size,
        file_type: document.file_type,
        created_at: document.created_at,
        chunks_count: chunks.length
      }
    });
    
  } catch (error) {
    console.error('文档上传失败:', error);
    res.status(500).json({ error: '文档上传失败' });
  }
});

/**
 * 添加文本文档
 */
router.post('/text', async (req, res) => {
  try {
    const { title, content, userId } = req.body;
    
    if (!title || !content || !userId) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    
    // 保存文档到数据库
    const { data: document, error: docError } = await supabaseAdmin
      .from('documents')
      .insert({
        title,
        content,
        file_name: `${title}.txt`,
        file_size: Buffer.byteLength(content, 'utf8'),
        file_type: 'text/plain',
        user_id: userId
      })
      .select()
      .single();
    
    if (docError) {
      console.error('保存文档失败:', docError);
      return res.status(500).json({ error: '保存文档失败' });
    }
    
    // 将文本分块
    const chunks = chunkText(content);
    
    // 保存文档块到数据库
    const chunkData = chunks.map((chunk, index) => ({
      document_id: document.id,
      content: chunk,
      chunk_index: index,
      embedding: generateMockEmbedding() // 模拟向量
    }));
    
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
        file_name: document.file_name,
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
    const { page = 1, limit = 10, search = '' } = req.query;
    
    let query = supabaseAdmin
      .from('documents')
      .select('id, title, file_name, file_size, file_type, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    // 搜索功能
    if (search) {
      query = query.or(`title.ilike.%${search}%,file_name.ilike.%${search}%`);
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

export default router;