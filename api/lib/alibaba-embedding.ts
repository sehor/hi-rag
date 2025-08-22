import OpenAI from 'openai';
import process from 'process';

/**
 * 阿里云嵌入模型服务
 * 使用DashScope API调用text-embedding-v4模型生成1024维向量
 */
class AlibabaEmbeddingService {
  private openai: OpenAI;
  private model: string;
  private dimensions: number;

  constructor() {
    // 打印所有环境变量读取情况
    console.log('🔍 开始读取阿里云配置环境变量...');
    console.log('- process.env.ALIBABA_API_KEY:', process.env.ALIBABA_API_KEY ? '已设置' : '未设置');
    console.log('- process.env.ALIBABA_BASE_URL:', process.env.ALIBABA_BASE_URL ? '已设置' : '未设置');
    console.log('- process.env.ALIBABA_EMBEDDING_MODEL:', process.env.ALIBABA_EMBEDDING_MODEL ? '已设置' : '未设置');
    
    // 从环境变量读取配置
    const apiKey = process.env.ALIBABA_API_KEY;
    const baseURL = process.env.ALIBABA_BASE_URL;
    this.model = process.env.ALIBABA_EMBEDDING_MODEL || 'text-embedding-v4';
    this.dimensions = 1024; // 设置向量维度为1024

    console.log('📋 环境变量读取结果:');
    console.log('- API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'null');
    console.log('- Base URL:', baseURL || 'null');
    console.log('- Model:', this.model);

    if (!apiKey) {
      console.error('❌ ALIBABA_API_KEY 环境变量未设置');
      throw new Error('ALIBABA_API_KEY 环境变量未设置');
    }

    if (!baseURL) {
      console.error('❌ ALIBABA_BASE_URL 环境变量未设置');
      throw new Error('ALIBABA_BASE_URL 环境变量未设置');
    }

    // 初始化OpenAI兼容的客户端
    this.openai = new OpenAI({
      apiKey: apiKey,
      baseURL: baseURL
    });

    console.log('✅ 阿里云嵌入服务初始化成功');
    console.log('- 模型:', this.model);
    console.log('- 向量维度:', this.dimensions);
    console.log('- 服务地址:', baseURL);
  }

  /**
   * 生成文本的向量嵌入
   * @param text 输入文本
   * @param instruct 自定义指令，用于优化检索效果（可选）
   * @returns 返回1024维向量数组
   */
  async generateEmbedding(text: string, instruct?: string): Promise<number[]> {
    try {
      console.log('🔄 调用阿里云嵌入服务生成向量...');
      console.log('- 文本长度:', text.length, '字符');
      console.log('- 模型:', this.model);
      console.log('- 向量维度:', this.dimensions);
      
      if (instruct) {
        console.log('- 自定义指令:', instruct);
      }

      // 如果提供了自定义指令，将其添加到输入文本前
      const inputText = instruct ? `${instruct}\n${text}` : text;

      const completion = await this.openai.embeddings.create({
        model: this.model,
        input: inputText,
        dimensions: this.dimensions,
        encoding_format: 'float'
      });

      if (!completion.data || completion.data.length === 0) {
        throw new Error('阿里云嵌入服务返回的数据为空');
      }

      const embedding = completion.data[0].embedding;
      
      if (!Array.isArray(embedding)) {
        throw new Error('嵌入向量格式无效');
      }

      if (embedding.length !== this.dimensions) {
        throw new Error(`向量维度不匹配，期望 ${this.dimensions}，实际 ${embedding.length}`);
      }

      console.log('✅ 向量生成成功');
      console.log('- 向量维度:', embedding.length);
      console.log('- 使用的token数:', completion.usage?.total_tokens || '未知');

      return embedding;

    } catch (error) {
      console.error('❌ 阿里云嵌入服务调用失败:', error);
      console.error('- 错误类型:', error?.constructor?.name || 'Unknown');
      console.error('- 错误消息:', error instanceof Error ? error.message : String(error));
      
      // 抛出详细的错误信息
      throw new Error(`阿里云嵌入服务失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 批量生成文本向量嵌入
   * @param texts 文本数组
   * @param instruct 自定义指令（可选）
   * @returns 返回向量数组
   */
  async generateBatchEmbeddings(texts: string[], instruct?: string): Promise<number[][]> {
    try {
      console.log('🔄 批量调用阿里云嵌入服务...');
      console.log('- 文本数量:', texts.length);
      
      const embeddings: number[][] = [];
      
      // 逐个处理文本（避免API限制）
      for (let i = 0; i < texts.length; i++) {
        console.log(`- 处理第 ${i + 1}/${texts.length} 个文本...`);
        const embedding = await this.generateEmbedding(texts[i], instruct);
        embeddings.push(embedding);
        
        // 添加短暂延迟避免API限流
        if (i < texts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      console.log('✅ 批量向量生成完成');
      return embeddings;
      
    } catch (error) {
      console.error('❌ 批量嵌入服务调用失败:', error);
      throw new Error(`批量嵌入服务失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// 延迟初始化的单例实例
let alibabaEmbeddingService: AlibabaEmbeddingService | null = null;

/**
 * 获取阿里云嵌入服务实例（延迟初始化）
 */
function getAlibabaEmbeddingService(): AlibabaEmbeddingService {
  if (!alibabaEmbeddingService) {
    alibabaEmbeddingService = new AlibabaEmbeddingService();
  }
  return alibabaEmbeddingService;
}

/**
 * 生成文本的向量嵌入（兼容现有接口）
 * @param text 输入文本
 * @param instruct 自定义指令，用于文本检索场景优化（可选）
 * @returns 返回1024维向量数组
 */
export async function generateEmbedding(text: string, instruct?: string): Promise<number[]> {
  // 为文本检索场景添加默认指令（如果未提供自定义指令）
  const defaultInstruct = instruct || "Given a web search query, retrieve relevant passages that answer the query";
  
  return await getAlibabaEmbeddingService().generateEmbedding(text, defaultInstruct);
}

/**
 * 批量生成文本向量嵌入
 * @param texts 文本数组
 * @param instruct 自定义指令（可选）
 * @returns 返回向量数组
 */
export async function generateBatchEmbeddings(texts: string[], instruct?: string): Promise<number[][]> {
  return await getAlibabaEmbeddingService().generateBatchEmbeddings(texts, instruct);
}

// 导出服务实例获取函数（用于高级用法）
export { getAlibabaEmbeddingService as getAlibabaEmbeddingService };

// 默认导出主要函数
export default generateEmbedding;