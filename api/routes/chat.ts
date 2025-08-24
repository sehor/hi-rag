import { Router, Request, Response } from 'express';
import { searchRelevantChunks } from '../services/searchService.js';
import { chatCompletion, getAvailableModels, ChatMessage } from '../services/openrouterService';

const router = Router();



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
    
    console.log('🔍 用户消息调试信息:');
    console.log('- lastUserMessage对象:', JSON.stringify(lastUserMessage, null, 2));
    console.log('- content类型:', typeof lastUserMessage.content);
    console.log('- content长度:', lastUserMessage.content?.length || 0);
    console.log('- content内容:', lastUserMessage.content);
    console.log('- content字符编码:', lastUserMessage.content.split('').map(char => char.charCodeAt(0)));
    
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
    

    
    // 调用OpenRouter服务
    let data;
    try {
      data = await chatCompletion({
        model: model,
        messages: fullMessages,
        temperature: 0.7,
        max_tokens: 2000,
      });
    } catch (error) {
      console.error('❌ OpenRouter服务调用失败:', error);
      return res.status(500).json({
        success: false,
        error: 'OpenRouter API调用失败',
        details: error instanceof Error ? error.message : '未知错误'
      });
    }
    
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
    const models = getAvailableModels();
    
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