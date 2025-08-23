/**
 * 阿里云NLP关键词提取服务封装
 * 支持电商中心词提取、通用关键短语抽取（基于textrank算法）和百度AI通用关键词提取
 */

import Core from '@alicloud/pop-core';

import axios from 'axios';

interface AliyunNLPConfig {
  accessKeyId: string;
  accessKeySecret: string;
  endpoint?: string;
  apiVersion?: string;
}

interface KeywordExtractionParams {
  query: string;
  top_k?: number;
  type: 'keyword_extraction';
}

interface KeywordExtractionResult {
  keywords: string[];
  success: boolean;
  error?: string;
}

interface BaiduAIConfig {
  apiKey: string;
  secretKey: string;
}

interface BaiduAccessTokenResponse {
  access_token: string;
  expires_in: number;
}

interface BaiduKeywordResponse {
  log_id: number;
  results: Array<{
    word: string;
    score: number;
  }>;
}

/**
 * 使用阿里云NLP自学习平台的textrank算法提取关键短语（通用版本）
 * @param text 待提取关键词的文本
 * @param topK 返回关键词数量，默认5个
 * @returns 提取的关键词数组
 */
export async function extractKeywordsWithTextRank(
  text: string,
  topK: number = 5
): Promise<KeywordExtractionResult> {
  try {
    // 检查环境变量
    const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
    const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;

    if (!accessKeyId || !accessKeySecret) {
      console.warn('阿里云NLP API密钥未配置，请设置 ALIYUN_ACCESS_KEY_ID 和 ALIYUN_ACCESS_KEY_SECRET 环境变量');
      return {
        keywords: [],
        success: false,
        error: '阿里云NLP API密钥未配置'
      };
    }

    // 初始化阿里云客户端 - 使用NLP自学习平台
    const client = new Core({
      accessKeyId,
      accessKeySecret,
      endpoint: 'https://nlp-automl.cn-hangzhou.aliyuncs.com',
      apiVersion: '2019-11-11'
    });

    const requestOption = {
      method: 'POST',
      formatParams: false
    };

    // 构建请求参数 - 使用textrank服务
    const requestParams = {
      ServiceName: 'NLP-textrank',
      PredictContent: JSON.stringify({
        content: text,
        top_k: topK
      })
    };

    // 调用NLP自学习平台的RunPreTrainService API
    const response = await client.request('RunPreTrainService', requestParams, requestOption);
    
    // 解析响应
    if (response && typeof response === 'object' && 'PredictResult' in response) {
      const predictResult = JSON.parse(response.PredictResult as string);
      
      // textrank服务返回格式：{"keywords": [{"word": "关键词", "score": 0.5}]}
      if (predictResult && predictResult.keywords && Array.isArray(predictResult.keywords)) {
        const keywords = predictResult.keywords
          .sort((a: any, b: any) => (b.score || 0) - (a.score || 0))
          .slice(0, topK)
          .map((item: any) => item.word)
          .filter((word: string) => word && word.trim().length > 0);
        
        console.log(`阿里云NLP textrank关键词提取成功，提取到 ${keywords.length} 个关键词:`, keywords);
        return {
          keywords: keywords,
          success: true
        };
      }
    }

    console.warn('阿里云NLP textrank API响应格式异常:', response);
    return {
      keywords: [],
      success: false,
      error: 'API响应格式异常'
    };

  } catch (error) {
    console.error('阿里云NLP textrank关键词提取失败:', error);
    return {
      keywords: [],
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    };
  }
}

/**
 * 使用阿里云NLP基础文本服务提取关键词（电商专用版本）
 * @param text 待提取关键词的文本
 * @param topK 返回关键词数量，默认5个
 * @returns 提取的关键词数组
 */
export async function extractKeywordsWithAliyunNLP(
  text: string,
  topK: number = 5
): Promise<KeywordExtractionResult> {
  try {
    // 检查环境变量
    const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
    const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;

    if (!accessKeyId || !accessKeySecret) {
      console.warn('阿里云NLP API密钥未配置，请设置 ALIYUN_ACCESS_KEY_ID 和 ALIYUN_ACCESS_KEY_SECRET 环境变量');
      return {
        keywords: [],
        success: false,
        error: '阿里云NLP API密钥未配置'
      };
    }

    // 初始化阿里云客户端 - 使用基础文本服务
    const client = new Core({
      accessKeyId,
      accessKeySecret,
      endpoint: 'https://alinlp.cn-hangzhou.aliyuncs.com',
      apiVersion: '2020-06-29'
    });

    const requestOption = {
      method: 'POST',
      formatParams: false
    };

    // 构建请求参数
    const requestParams = {
      ServiceCode: 'alinlp',
      Text: text,
      ApiVersion: 'v2'  // 使用2.0版本，性能更优，支持类目更广泛
    };

    // 调用基础文本服务-中心词提取API
    const response = await client.request('GetKeywordChEcom', requestParams, requestOption);
    
    // 解析响应 - 基础文本服务响应格式
    if (response && typeof response === 'object' && 'Data' in response) {
      const responseData = JSON.parse(response.Data as string);
      
      // 检查是否有data字段（新的响应格式）
      if (responseData && responseData.data) {
        const keywordData = JSON.parse(responseData.data);
        
        if (Array.isArray(keywordData)) {
          const keywords = keywordData
            .filter((item: any) => item && item.span)
            .sort((a: any, b: any) => (b.score || 0) - (a.score || 0))
            .slice(0, topK)
            .map((item: any) => item.span);
          
          console.log(`阿里云NLP关键词提取成功，提取到 ${keywords.length} 个关键词:`, keywords);
           return {
             keywords: keywords,
             success: true
           };
        }
      }
      
      // 2.0版本响应格式：直接是数组包含 {span, label, score}
      if (Array.isArray(responseData)) {
        const keywords = responseData
          .filter((item: any) => item && item.span)
          .sort((a: any, b: any) => (b.score || 0) - (a.score || 0))
          .slice(0, topK)
          .map((item: any) => item.span);
        
        console.log(`阿里云NLP关键词提取成功，提取到 ${keywords.length} 个关键词:`, keywords);
         return {
           keywords: keywords,
           success: true
         };
      }
      
      // 1.0版本响应格式：{result: {output: [...]}}
      if (responseData && responseData.result && Array.isArray(responseData.result.output)) {
        // 提取关键词，取前topK个
        const keywords = responseData.result.output.slice(0, topK);
        
        console.log(`阿里云NLP关键词提取成功，提取到 ${keywords.length} 个关键词:`, keywords);
        
        return {
          keywords: keywords.filter(k => k && k.trim().length > 0),
          success: true
        };
      }
    }

    console.warn('阿里云NLP API响应格式异常:', response);
    return {
      keywords: [],
      success: false,
      error: 'API响应格式异常'
    };

  } catch (error) {
    console.error('阿里云NLP关键词提取失败:', error);
    return {
      keywords: [],
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    };
  }
}

/**
 * 备用关键词提取函数（本地实现）
 * 当阿里云API不可用时使用
 * @param text 待提取关键词的文本
 * @returns 提取的关键词数组
 */
export function extractKeywordsLocally(text: string): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // 移除标点符号和特殊字符
  const cleanText = text
    .replace(/[，。！？；：""''（）【】《》、\.,!?;:"'()\[\]<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 中文停用词列表
  const stopWords = new Set([
    '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '那', '什么', '可以', '这个', '那个', '他', '她', '它', '我们', '你们', '他们', '她们', '它们', '这些', '那些', '怎么', '为什么', '哪里', '什么时候', '如何', '多少', '哪个', '哪些'
  ]);

  // 分词处理
  const words: string[] = [];
  
  // 按空格分割
  const spaceWords = cleanText.split(/\s+/).filter(word => word.length > 0);
  words.push(...spaceWords);
  
  // 中文词汇提取（2-4字的词组）
  const chineseMatches = cleanText.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
  words.push(...chineseMatches);
  
  // 过滤和去重
  const keywords = [...new Set(words)]
    .filter(word => {
      // 过滤停用词
      if (stopWords.has(word)) return false;
      // 过滤单字符
      if (word.length < 2) return false;
      // 过滤纯数字
      if (/^\d+$/.test(word)) return false;
      return true;
    })
    .slice(0, 10); // 限制数量

  return keywords;
}

/**
 * 获取百度AI访问令牌
 * @param apiKey 百度AI API Key
 * @param secretKey 百度AI Secret Key
 * @returns 访问令牌
 */
async function getBaiduAccessToken(apiKey: string, secretKey: string): Promise<string> {
  try {
    const response = await axios.post(
      'https://aip.baidubce.com/oauth/2.0/token',
      null,
      {
        params: {
          grant_type: 'client_credentials',
          client_id: apiKey,
          client_secret: secretKey
        }
      }
    );

    const data: BaiduAccessTokenResponse = response.data;
    return data.access_token;
  } catch (error) {
    console.error('获取百度AI访问令牌失败:', error);
    throw new Error('获取百度AI访问令牌失败');
  }
}

/**
 * 使用百度AI关键词提取服务（通用版本）
 * @param text 待提取关键词的文本
 * @param topK 返回关键词数量，默认5个
 * @returns 提取的关键词数组
 */
export async function extractKeywordsWithBaiduAI(
  text: string,
  topK: number = 5
): Promise<KeywordExtractionResult> {
  try {
    // 检查环境变量
    const apiKey = process.env.BAIDU_API_KEY;
    const secretKey = process.env.BAIDU_SECRET_KEY;

    if (!apiKey || !secretKey) {
      console.warn('百度AI API密钥未配置，请设置 BAIDU_API_KEY 和 BAIDU_SECRET_KEY 环境变量');
      return {
        keywords: [],
        success: false,
        error: '百度AI API密钥未配置'
      };
    }

    // 获取访问令牌
    const accessToken = await getBaiduAccessToken(apiKey, secretKey);

    // 调用百度AI关键词提取API
    const response = await axios.post(
      `https://aip.baidubce.com/rpc/2.0/nlp/v1/keyword?access_token=${accessToken}`,
      {
        text: text,
        num: topK
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    const data: BaiduKeywordResponse = response.data;

    // 检查响应是否包含错误
    if ('error_code' in data) {
      console.error('百度AI关键词提取API返回错误:', data);
      return {
        keywords: [],
        success: false,
        error: `百度AI API错误: ${(data as any).error_msg || '未知错误'}`
      };
    }

    // 解析关键词结果
    if (data.results && Array.isArray(data.results)) {
      const keywords = data.results
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(item => item.word)
        .filter(word => word && word.trim().length > 0);

      console.log(`百度AI关键词提取成功，提取到 ${keywords.length} 个关键词:`, keywords);
      return {
        keywords: keywords,
        success: true
      };
    }

    console.warn('百度AI关键词提取API响应格式异常:', data);
    return {
      keywords: [],
      success: false,
      error: 'API响应格式异常'
    };

  } catch (error) {
    console.error('百度AI关键词提取失败:', error);
    return {
      keywords: [],
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    };
  }
}