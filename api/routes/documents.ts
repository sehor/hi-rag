/**
 * 文档路由 - 处理文档上传、保存、查询等功能
 */
import express from 'express';
import multer from 'multer';
import { supabaseAdmin } from '../lib/supabase.js';
import { extractFileContentAndChunks, processTextDocument, ChunkData } from '../services/documentProcessingService.js';
import { generateQueryEmbedding } from '../services/embeddingService.js';

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
      
      const embedding = await generateQueryEmbedding(chunk.text);
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
    
    // 对于文本文档，使用文档处理服务进行分块
    const chunks = await processTextDocument(content, `${title}.txt`, document.id);
    
    // 保存文档块到数据库
    console.log('🔄 开始为文本文档块生成向量...');
    const chunkData = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`- 处理第 ${i + 1}/${chunks.length} 个文档块...`);
      console.log(`  - 分块长度: ${chunk.text.length} 字符`);
      
      const embedding = await generateQueryEmbedding(chunk.text);
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