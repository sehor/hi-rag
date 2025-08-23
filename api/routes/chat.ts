import { Router, Request, Response } from 'express';
import { searchRelevantChunks } from '../services/searchService.js';

const router = Router();

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
    
    // 搜索相关文档块
    const relevantChunks = await searchRelevantChunks(lastUserMessage.content, userId, 5, categoryId);
    
    if (!relevantChunks || relevantChunks.length === 0) {
      return res.status(404).json({
        error: 'No relevant documents found',
        message: '未找到相关文档，请尝试其他问题或上传相关文档'
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
    
    // 构建系统提示词
    const systemPrompt = contextText 
      ? `你是一个智能助手，请基于以下提供的文档内容来回答用户的问题。如果文档中没有相关信息，请明确说明。\n\n相关文档内容：\n${contextText}\n\n请根据上述文档内容回答用户的问题，并在回答中引用具体的文档来源。`
      : '你是一个智能助手，请友好地回答用户的问题。';
    

    
    // 构建完整的消息数组
    const fullMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];
    

    
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