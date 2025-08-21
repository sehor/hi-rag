import express from 'express';
import { Request, Response } from 'express';
import dotenv from 'dotenv';
import { supabaseAdmin } from '../lib/supabase.js';

// 加载环境变量
dotenv.config();

const router = express.Router();

/**
 * 聊天消息接口
 */
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * 聊天请求接口
 */
interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  conversationId?: string;
  userId: string;
}

/**
 * 调用外部嵌入服务生成查询向量
 */
async function generateQueryEmbedding(query: string): Promise<number[]> {
  try {
    const embeddingServiceUrl = process.env.EMBEDDING_SERVICE_URL || 'http://localhost:8001';
    
    console.log('🔄 调用外部嵌入服务生成查询向量...');
    console.log('- 服务URL:', embeddingServiceUrl);
    console.log('- 查询文本:', query);
    
    const response = await fetch(`${embeddingServiceUrl}/embed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documents: [query]
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
    
    console.log('✅ 查询向量生成成功');
    console.log('- 向量维度:', embedding.length);
    console.log('- 服务消息:', result.message || '无消息');
    
    return embedding;
    
  } catch (error) {
    console.error('❌ 调用嵌入服务失败:', error);
    console.error('- 错误类型:', error?.constructor?.name || 'Unknown');
    console.error('- 错误消息:', error instanceof Error ? error.message : String(error));
    
    // 如果外部服务失败，回退到模拟向量
    console.log('🔄 回退到模拟查询向量生成...');
    return Array.from({ length: 768 }, () => Math.random() * 2 - 1);
  }
}

/**
 * 使用向量相似度搜索相关文档块
 */
async function searchRelevantChunks(query: string, userId: string, limit: number = 5) {
  console.log('🔍 开始向量搜索相关文档块...');
  console.log('- 原始查询:', query);
  console.log('- 用户ID:', userId);
  
  try {
    // 生成查询向量
    console.log('🧮 生成查询向量...');
    const queryEmbedding = await generateQueryEmbedding(query);
    
    if (!queryEmbedding || queryEmbedding.length === 0) {
      throw new Error('查询向量生成失败');
    }
    
    console.log('✅ 查询向量生成成功，维度:', queryEmbedding.length);
    
    // 使用Supabase的向量相似度搜索（余弦相似度）
    console.log('🔍 执行向量相似度搜索...');
    
    const { data: chunks, error } = await supabaseAdmin
      .rpc('search_similar_chunks', {
        query_embedding: queryEmbedding,
        target_user_id: userId, // 直接传递UUID，不需要toString()
        match_threshold: 0.3, // 相似度阈值
        match_count: limit
      });
    
    if (error) {
      console.error('❌ 向量搜索失败:', error);
      // 如果向量搜索失败，回退到关键字搜索
      console.log('🔄 回退到关键字搜索...');
      return await fallbackKeywordSearch(query, userId, limit);
    }
    
    console.log(`✅ 向量搜索找到 ${chunks?.length || 0} 个相关文档块`);
    
    // 如果向量搜索没有找到结果，回退到关键字搜索
    if (!chunks || chunks.length === 0) {
      console.log('🔄 向量搜索无结果，回退到关键字搜索...');
      return await fallbackKeywordSearch(query, userId, limit);
    }
    
    // 记录相似度分数
    chunks.forEach((chunk: any, index: number) => {
      console.log(`📊 文档块 ${index + 1}: 相似度 ${chunk.similarity?.toFixed(4) || 'N/A'}`);
    });
    
    return chunks;
    
  } catch (error) {
    console.error('💥 向量搜索错误:', error);
    console.log('🔄 回退到关键字搜索...');
    return await fallbackKeywordSearch(query, userId, limit);
  }
}

/**
 * 关键字搜索回退方案
 */
async function fallbackKeywordSearch(query: string, userId: string, limit: number = 5) {
  console.log('🔍 执行关键字搜索回退方案...');
  
  try {
    // 直接搜索原始查询
    let { data: chunks, error } = await supabaseAdmin
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
      .eq('documents.user_id', userId)
      .ilike('content', `%${query}%`)
      .limit(limit);
    
    if (error) {
      console.error('❌ 关键字搜索失败:', error);
      throw new Error(`关键字搜索失败: ${error.message}`);
    }
    
    console.log(`✅ 关键字搜索找到 ${chunks?.length || 0} 个相关文档块`);
    
    return chunks || [];
    
  } catch (error) {
    console.error('💥 关键字搜索错误:', error);
    return [];
  }
}

/**
 * 使用Openrouter进行RAG聊天对话
 */
router.post('/completions', async (req: Request, res: Response) => {
  console.log('=== RAG聊天请求开始 ===');
  console.log('请求时间:', new Date().toISOString());
  
  try {
    const { messages, model = 'openai/gpt-4o', conversationId, userId }: ChatRequest = req.body;
    
    console.log('请求参数:');
    console.log('- model:', model);
    console.log('- conversationId:', conversationId);
    console.log('- userId:', userId);
    console.log('- messages数量:', messages?.length || 0);
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.log('❌ 错误: 消息数组为空或无效');
      return res.status(400).json({ 
        success: false,
        error: '消息不能为空' 
      });
    }
    
    if (!userId) {
      console.log('❌ 错误: 缺少用户ID');
      return res.status(400).json({ 
        success: false,
        error: '缺少用户ID' 
      });
    }
    
    // 获取最后一条用户消息作为查询
    const lastUserMessage = messages.filter(msg => msg.role === 'user').pop();
    if (!lastUserMessage) {
      console.log('❌ 错误: 没有找到用户消息');
      return res.status(400).json({ 
        success: false,
        error: '没有找到用户消息' 
      });
    }
    
    // 搜索相关文档块 - 如果失败直接返回错误
    let relevantChunks;
    try {
      relevantChunks = await searchRelevantChunks(lastUserMessage.content, userId);
    } catch (searchError) {
      console.error('❌ 文档搜索失败，停止处理:', searchError);
      return res.status(500).json({
        success: false,
        error: '文档搜索失败，无法处理您的请求',
        details: searchError instanceof Error ? searchError.message : '未知搜索错误'
      });
    }
    
    // 检查是否找到相关文档
    if (!relevantChunks || relevantChunks.length === 0) {
      console.log('❌ 没有找到相关文档，停止处理');
      return res.status(404).json({
        success: false,
        error: '没有找到与您问题相关的文档内容',
        suggestion: '请尝试使用不同的关键词，或先上传相关文档'
      });
    }
    
    // 构建上下文
    let contextText = '';
    const sources: string[] = [];
    
    console.log('📚 构建RAG上下文...');
    contextText = relevantChunks.map((chunk: any) => {
      sources.push(chunk.documents.title);
      return `文档《${chunk.documents.title}》中的内容：\n${chunk.content}`;
    }).join('\n\n');
    
    console.log('- 上下文长度:', contextText.length);
    console.log('- 来源文档:', sources);
    console.log('📄 RAG上下文内容:');
    console.log('='.repeat(50));
    console.log(contextText);
    console.log('='.repeat(50));
    
    // 构建系统提示词
    const systemPrompt = contextText 
      ? `你是一个智能助手，请基于以下提供的文档内容来回答用户的问题。如果文档中没有相关信息，请明确说明。

相关文档内容：
${contextText}

请根据上述文档内容回答用户的问题，并在回答中引用具体的文档来源。`
      : '你是一个智能助手，请友好地回答用户的问题。';
    
    console.log('🎯 系统提示词:');
    console.log('='.repeat(50));
    console.log(systemPrompt);
    console.log('='.repeat(50));
    
    // 构建完整的消息数组
    const fullMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];
    
    console.log('📨 发送给LLM的完整消息:');
    console.log('='.repeat(50));
    fullMessages.forEach((msg, index) => {
      console.log(`消息 ${index + 1} [${msg.role}]:`);
      console.log(msg.content);
      console.log('-'.repeat(30));
    });
    console.log('='.repeat(50));
    
    // 验证环境变量
    const openrouterApiKey = process.env.OPENROUTER_API_KEY;
    const openrouterUrl = process.env.OPENROUTER_URL || 'https://openrouter.ai/api/v1/chat/completions';
    
    if (!openrouterApiKey) {
      console.log('❌ 错误: 缺少OPENROUTER_API_KEY环境变量');
      return res.status(500).json({ 
        success: false,
        error: 'Openrouter API密钥未配置' 
      });
    }
    
    console.log('🤖 开始调用Openrouter API...');
    console.log('- 模型:', model);
    console.log('- 消息数量:', fullMessages.length);
    
    // 调用Openrouter API
    const response = await fetch(openrouterUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterApiKey}`,
        'HTTP-Referer': process.env.SITE_URL || 'http://localhost:5173',
        'X-Title': process.env.SITE_NAME || 'Hi-RAG System',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: fullMessages,
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });
    
    console.log('Openrouter API响应状态:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Openrouter API错误:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      
      return res.status(response.status).json({
        success: false,
        error: `Openrouter API错误: ${response.statusText}`,
        details: errorText
      });
    }
    
    const data = await response.json();
    console.log('✅ Openrouter API调用成功');
    console.log('- 模型:', data.model);
    console.log('- 使用tokens:', data.usage);
    
    // 返回响应
    res.json({
      success: true,
      data: {
        message: data.choices[0]?.message?.content || '',
        model: data.model,
        usage: data.usage,
        conversationId: conversationId,
        sources: [...new Set(sources)] // 去重的来源列表
      }
    });
    
  } catch (error) {
    console.error('💥 RAG聊天API错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器内部错误',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * 获取可用模型列表
 */
router.get('/models', async (req: Request, res: Response) => {
  try {
    // 返回常用的模型列表
    const models = [
      { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI' },
      { id: 'openai/gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'OpenAI' },
      { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', provider: 'Anthropic' },
      { id: 'anthropic/claude-3-sonnet', name: 'Claude 3 Sonnet', provider: 'Anthropic' },
      { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', provider: 'Anthropic' },
      { id: 'google/gemini-pro', name: 'Gemini Pro', provider: 'Google' },
      { id: 'meta-llama/llama-2-70b-chat', name: 'Llama 2 70B', provider: 'Meta' },
    ];
    
    res.json({
      success: true,
      data: models
    });
  } catch (error) {
    console.error('获取模型列表错误:', error);
    res.status(500).json({
      success: false,
      error: '获取模型列表失败'
    });
  }
});

export default router;