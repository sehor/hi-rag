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
  categoryId?: string;
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
    
    // 直接使用原始查询文本，不添加指令前缀，保持与文档向量生成的一致性
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
    
    // 嵌入服务失败时直接抛出错误，不使用随机模拟向量
    throw new Error(`嵌入服务失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 计算两个向量之间的余弦相似度
 */
function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    return 0;
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 计算两个文本之间的Jaccard相似度（基于词汇重叠）
 */
function calculateJaccardSimilarity(textA: string, textB: string): number {
  // 简单的分词处理，转换为小写并去除标点
  const wordsA = new Set(textA.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(word => word.length > 1));
  const wordsB = new Set(textB.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(word => word.length > 1));
  
  const intersection = new Set([...wordsA].filter(word => wordsB.has(word)));
  const union = new Set([...wordsA, ...wordsB]);
  
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * 基于MMR（Maximal Marginal Relevance）算法的多样性重排序
 * @param chunks 原始搜索结果
 * @param queryEmbedding 查询向量
 * @param lambda 平衡参数，控制相关性与多样性的权重 (0-1，越大越注重相关性)
 * @param maxResults 最终返回的结果数量
 */
function diversityRerank(chunks: any[], queryEmbedding: number[], lambda: number = 0.7, maxResults: number = 5): any[] {
  console.log('🎯 开始多样性重排序...');
  console.log(`- 原始结果数量: ${chunks.length}`);
  console.log(`- Lambda参数: ${lambda} (相关性权重)`);
  console.log(`- 目标结果数量: ${maxResults}`);
  
  if (!chunks || chunks.length === 0) {
    return [];
  }
  
  // 如果结果数量不超过目标数量，直接返回
  if (chunks.length <= maxResults) {
    console.log('✅ 结果数量未超过目标，无需重排序');
    return chunks;
  }
  
  const selectedChunks: any[] = [];
  const remainingChunks = [...chunks];
  
  // 第一步：选择相关性最高的文档块作为起始点
  let bestIndex = 0;
  let bestScore = -1;
  
  for (let i = 0; i < remainingChunks.length; i++) {
    const relevanceScore = remainingChunks[i].similarity || 0;
    if (relevanceScore > bestScore) {
      bestScore = relevanceScore;
      bestIndex = i;
    }
  }
  
  selectedChunks.push(remainingChunks.splice(bestIndex, 1)[0]);
  console.log(`📌 选择初始文档块，相关性: ${bestScore.toFixed(4)}`);
  
  // 迭代选择剩余文档块
  while (selectedChunks.length < maxResults && remainingChunks.length > 0) {
    let bestMMRScore = -1;
    let bestMMRIndex = -1;
    
    for (let i = 0; i < remainingChunks.length; i++) {
      const candidate = remainingChunks[i];
      const relevanceScore = candidate.similarity || 0;
      
      // 计算与已选择文档块的最大相似度（多样性惩罚）
      let maxSimilarity = 0;
      
      for (const selected of selectedChunks) {
        // 基于文本内容的相似度计算
        const textSimilarity = calculateJaccardSimilarity(candidate.content, selected.content);
        
        // 如果有向量信息，也计算向量相似度
        let vectorSimilarity = 0;
        if (candidate.embedding && selected.embedding) {
          vectorSimilarity = calculateCosineSimilarity(candidate.embedding, selected.embedding);
        }
        
        // 综合文本和向量相似度
        const combinedSimilarity = Math.max(textSimilarity, vectorSimilarity * 0.8);
        maxSimilarity = Math.max(maxSimilarity, combinedSimilarity);
      }
      
      // MMR评分：平衡相关性和多样性
      const mmrScore = lambda * relevanceScore - (1 - lambda) * maxSimilarity;
      
      if (mmrScore > bestMMRScore) {
        bestMMRScore = mmrScore;
        bestMMRIndex = i;
      }
    }
    
    if (bestMMRIndex >= 0) {
      const selectedChunk = remainingChunks.splice(bestMMRIndex, 1)[0];
      selectedChunks.push(selectedChunk);
      
      console.log(`📌 选择文档块 ${selectedChunks.length}:`);
      console.log(`   - 相关性: ${(selectedChunk.similarity || 0).toFixed(4)}`);
      console.log(`   - MMR评分: ${bestMMRScore.toFixed(4)}`);
      console.log(`   - 内容预览: ${selectedChunk.content.substring(0, 50)}...`);
    } else {
      break;
    }
  }
  
  console.log(`✅ 多样性重排序完成，最终选择 ${selectedChunks.length} 个文档块`);
  
  // 去重检查：移除内容高度相似的文档块
  const deduplicatedChunks = [];
  const contentThreshold = 0.8; // 内容相似度阈值
  
  for (const chunk of selectedChunks) {
    let isDuplicate = false;
    
    for (const existing of deduplicatedChunks) {
      const similarity = calculateJaccardSimilarity(chunk.content, existing.content);
      if (similarity > contentThreshold) {
        console.log(`🔄 检测到重复内容，相似度: ${similarity.toFixed(4)}，跳过`);
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate) {
      deduplicatedChunks.push(chunk);
    }
  }
  
  console.log(`🧹 去重后保留 ${deduplicatedChunks.length} 个文档块`);
  
  return deduplicatedChunks;
}

/**
 * 提取查询中的关键词
 */
function extractKeywords(query: string): string[] {
  // 移除标点符号，转换为小写，分割成词汇
  const words = query
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fa5]/g, '') // 保留中文字符
    .split(/\s+/)
    .filter(word => word.length > 1); // 过滤单字符
  
  // 移除常见停用词
  const stopWords = new Set(['的', '是', '在', '有', '和', '与', '或', '但', '而', '了', '吗', '呢', '啊', '哪', '什么', '怎么', '为什么']);
  return words.filter(word => !stopWords.has(word));
}

/**
 * 验证文档块是否包含查询关键词
 */
function validateKeywordMatch(content: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  
  const contentLower = content.toLowerCase();
  // 至少匹配一个关键词
  const matchCount = keywords.filter(keyword => 
    contentLower.includes(keyword.toLowerCase())
  ).length;
  
  // 对于短查询（<=3个关键词），至少匹配1个
  // 对于长查询（>3个关键词），至少匹配30%
  const requiredMatches = keywords.length <= 3 ? 1 : Math.ceil(keywords.length * 0.3);
  return matchCount >= requiredMatches;
}

/**
 * 使用向量相似度搜索相关文档块
 */
async function searchRelevantChunks(query: string, userId: string, limit: number = 5, categoryId?: string) {
  console.log('🔍 开始向量搜索相关文档块...');
  console.log('- 用户ID:', userId);
  console.log('- 分类ID:', categoryId);
  
  // 提取查询关键词
  const keywords = extractKeywords(query);
  
  try {
    // 生成查询向量
    const queryEmbedding = await generateQueryEmbedding(query);
    
    if (!queryEmbedding || queryEmbedding.length === 0) {
      throw new Error('查询向量生成失败');
    }
    
    console.log('✅ 查询向量生成成功，维度:', queryEmbedding.length);
    
    // 使用Supabase的向量相似度搜索（余弦相似度）
    console.log('🔍 执行向量相似度搜索...');
    
    // 搜索更多结果用于多样性重排序
    const searchLimit = Math.max(limit * 3, 15); // 搜索3倍数量用于重排序
    
    const { data: chunks, error } = await supabaseAdmin
      .rpc('search_similar_chunks_with_category', {
        query_embedding: queryEmbedding,
        target_user_id: userId,
        match_threshold: 0.3,
        match_count: searchLimit,
        category_filter: categoryId || null
      });
    
    if (error) {
      console.error('❌ 向量搜索失败:', error);
      console.log('🔄 回退到关键字搜索...');
      return await fallbackKeywordSearch(query, userId, limit, categoryId);
    }
    
    console.log(`✅ 向量搜索找到 ${chunks?.length || 0} 个相关文档块`);
    
    if (!chunks || chunks.length === 0) {
      console.log('🔄 向量搜索无结果，回退到关键字搜索...');
      return await fallbackKeywordSearch(query, userId, limit, categoryId);
    }
    
    // 只记录相似度分数，不打印文档内容
    chunks.forEach((chunk: any, index: number) => {
      console.log(`📊 文档块 ${index + 1}: 相似度 ${chunk.similarity?.toFixed(4) || 'N/A'}`);
    });
    
    // 关键词验证
    const keywordFilteredChunks = chunks.filter(chunk => 
      validateKeywordMatch(chunk.content, keywords)
    );
    console.log(`🔑 关键词验证后保留 ${keywordFilteredChunks.length} 个文档块`);
    
    const finalChunks = keywordFilteredChunks.length > 0 ? keywordFilteredChunks : chunks;
    console.log(`📋 最终使用 ${finalChunks.length} 个文档块`);
    
    // 启用多样性重排序算法
    const rerankedChunks = diversityRerank(finalChunks, queryEmbedding, 0.7, limit);
    console.log('✅ 多样性重排序已启用');
    
    console.log('🎯 重排序后的结果:');
    rerankedChunks.forEach((chunk: any, index: number) => {
      console.log(`📋 排序 ${index + 1}: 相似度 ${chunk.similarity?.toFixed(4) || 'N/A'}`);
    });
    
    return rerankedChunks;
    
  } catch (error) {
    console.error('💥 向量搜索错误:', error);
    console.log('🔄 回退到关键字搜索...');
    return await fallbackKeywordSearch(query, userId, limit, categoryId);
  }
}

/**
 * 关键字搜索回退方案
 */
async function fallbackKeywordSearch(query: string, userId: string, limit: number = 5, categoryId?: string) {
  console.log('🔍 执行关键字搜索回退方案...');
  
  try {
    // 直接搜索原始查询
    let queryBuilder = supabaseAdmin
      .from('document_chunks')
      .select(`
        id,
        content,
        chunk_index,
        documents!inner(
          id,
          title,
          user_id,
          category_id
        )
      `)
      .eq('documents.user_id', userId)
      .ilike('content', `%${query}%`);
    
    // 如果指定了分类，添加分类过滤
    if (categoryId) {
      queryBuilder = queryBuilder.eq('documents.category_id', categoryId);
    }
    
    const { data: chunks, error } = await queryBuilder.limit(limit);
    
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
    const { messages, model = 'openai/gpt-4o', conversationId, userId, categoryId }: ChatRequest = req.body;
    
    console.log('请求参数:');
    console.log('- model:', model);
    console.log('- userId:', userId);
    console.log('- categoryId:', categoryId);
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
      relevantChunks = await searchRelevantChunks(lastUserMessage.content, userId, 5, categoryId);
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
    
    // 在/completions路由中，找到这些行并修改：
    
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
    // 移除这些行：
    // console.log('📄 RAG上下文内容:');
    // console.log('='.repeat(50));
    // console.log(contextText);
    // console.log('='.repeat(50));
    
    // 构建系统提示词
    const systemPrompt = contextText 
      ? `你是一个智能助手，请基于以下提供的文档内容来回答用户的问题。如果文档中没有相关信息，请明确说明。\n\n相关文档内容：\n${contextText}\n\n请根据上述文档内容回答用户的问题，并在回答中引用具体的文档来源。`
      : '你是一个智能助手，请友好地回答用户的问题。';
    
    // 移除这些行：
    // console.log('🎯 系统提示词:');
    // console.log('='.repeat(50));
    // console.log(systemPrompt);
    // console.log('='.repeat(50));
    
    // 构建完整的消息数组
    const fullMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];
    
    // 移除这些行：
    // console.log('📨 发送给LLM的完整消息:');
    // console.log('='.repeat(50));
    // fullMessages.forEach((msg, index) => {
    //   console.log(`消息 ${index + 1} [${msg.role}]:`);
    //   console.log(msg.content);
    //   console.log('-'.repeat(30));
    // });
    // console.log('='.repeat(50));
    
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
      { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini', provider: 'OpenAI' },
      { id: 'google/gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', provider: 'Google' },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI' },
      { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku', provider: 'Anthropic' },
      { id: 'x-ai/grok-4', name: 'Grok 4', provider: 'X.AI' },
      { id: 'qwen/qwen3-235b-a22b-thinking-2507', name: 'Qwen3 235B Thinking', provider: 'Qwen' },
      { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek Chat V3 (Free)', provider: 'DeepSeek' },
      // 原有模型
      { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
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