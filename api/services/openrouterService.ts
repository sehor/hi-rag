/**
 * OpenRouter API服务
 * 处理与OpenRouter多模型API的交互
 */
import dotenv from 'dotenv';
dotenv.config();

/**
 * 聊天消息接口
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * 聊天完成请求参数
 */
export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

/**
 * 聊天完成响应
 */
export interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
  }>;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * 模型信息接口
 */
export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

/**
 * OpenRouter服务类
 */
export class OpenRouterService {
  private apiKey: string;
  private baseUrl: string;
  private siteUrl: string;
  private siteName: string;

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || '';
    this.baseUrl = process.env.OPENROUTER_URL || 'https://openrouter.ai/api/v1/chat/completions';
    this.siteUrl = process.env.SITE_URL || 'http://localhost:5173';
    this.siteName = process.env.SITE_NAME || 'Hi-RAG System';

    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY环境变量未配置');
    }
  }

  /**
   * 调用OpenRouter聊天完成API
   */
  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    console.log('🤖 调用API:', request.model);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': this.siteUrl,
          'X-Title': this.siteName,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature || 0.7,
          max_tokens: request.max_tokens || 2000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API错误:', response.status, response.statusText);
        throw new Error(`Openrouter API错误: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      console.log('✅ API调用成功');

      return data;
    } catch (error) {
      console.error('💥 API调用失败:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * 获取可用模型列表
   */
  getAvailableModels(): ModelInfo[] {
    return [
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
  }
}

// 创建单例实例
let openRouterServiceInstance: OpenRouterService | null = null;

/**
 * 获取OpenRouter服务实例
 */
export function getOpenRouterService(): OpenRouterService {
  if (!openRouterServiceInstance) {
    openRouterServiceInstance = new OpenRouterService();
  }
  return openRouterServiceInstance;
}

/**
 * 便捷函数：调用聊天完成API
 */
export async function chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
  const service = getOpenRouterService();
  return service.chatCompletion(request);
}

/**
 * 便捷函数：获取可用模型列表
 */
export function getAvailableModels(): ModelInfo[] {
  const service = getOpenRouterService();
  return service.getAvailableModels();
}



/**
 * 关键词提取请求参数
 */
export interface KeywordExtractionRequest {
  text: string;
  maxKeywords?: number;
}

/**
 * 关键词提取响应
 */
export interface KeywordExtractionResponse {
  keywords: string[];
  originalText: string;
}

/**
 * 使用GPT-5-mini进行查询重建
 * @param request 查询重建请求参数
 * @returns 重建后的查询
 */


/**
 * 使用GPT-5-mini进行关键词提取
 * @param request 关键词提取请求参数
 * @returns 提取的关键词
 */
export async function extractKeywordsWithGPT(request: KeywordExtractionRequest): Promise<KeywordExtractionResponse> {
  console.log('🔍 GPT关键词提取...');
  
  try {
    const maxKeywords = request.maxKeywords || 6;
    
    const systemPrompt = `你是一个专业的语义关键词提取助手。你的任务是从给定文本中提取关键词，包括直接出现的关键词和语义相关的隐藏关键词。

提取规则：
1. 提取${maxKeywords}个最重要的关键词
2. 包含两类关键词：
   - 直接关键词：文本中明确出现的重要词汇
   - 隐藏关键词：通过语义推理得出的相关概念
3. 进行语义扩展和概念推理：
   - 时间概念：如"明天"要推导出具体日期、日程安排等
   - 活动概念：如"安排"要推导出会议、任务、计划、约会等
   - 地点概念：如"公司"要推导出办公室、工作场所等
   - 人物概念：如"同事"要推导出团队、合作等
4. 优先提取具体的、有搜索价值的词汇
5. 避免提取停用词（如：的、是、在、有等）
6. 关键词之间用逗号分隔
7. 只返回关键词列表，不要添加任何解释


示例：
输入："我明天有什么安排"
输出：明天,日程,安排,会议,任务,计划,约会,工作

示例格式：关键词1,关键词2,关键词3`;

    const userPrompt = `请从以下文本中提取关键词：

"${request.text}"

请提取关键词：`;

    const chatRequest: ChatCompletionRequest = {
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 150
    };

    const response = await chatCompletion(chatRequest);
    const keywordsText = response.choices[0]?.message?.content?.trim() || '';
    
    // 解析关键词
    const splitKeywords = keywordsText.split(/[,，、]/); // 支持中英文逗号和顿号
    const trimmedKeywords = splitKeywords.map(kw => kw.trim());
    const filteredKeywords = trimmedKeywords.filter(kw => kw.length > 0 && kw.length <= 20); // 过滤空字符串和过长的词
    const keywords = filteredKeywords.slice(0, maxKeywords); // 限制数量
    
    console.log('✅ 关键词提取完成');
    
    return {
      keywords,
      originalText: request.text
    };
  } catch (error) {
    console.error('❌ 关键词提取失败:', error instanceof Error ? error.message : String(error));
    // 失败时返回空数组
    return {
      keywords: [],
      originalText: request.text
    };
  }
}