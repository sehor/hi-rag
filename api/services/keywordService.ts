// 顶部导入区域
import { extractKeywordsWithGPT, KeywordExtractionRequest } from './openrouterService';

/**
 * 提取关键词（仅使用GPT，失败时返回空数组）
 * @param query 查询文本
 * @returns 关键词数组
 */
export async function extractKeywords(query: string): Promise<string[]> {
  console.log('🔍 提取关键词...');
  
  try {
    // 使用GPT关键词提取服务
    const gptRequest: KeywordExtractionRequest = {
      text: query,
      maxKeywords: 8
    };
    
    const gptResult = await extractKeywordsWithGPT(gptRequest);
    
    if (gptResult.keywords.length > 0) {
      console.log('✅ 关键词提取成功');
      return gptResult.keywords;
    } else {
      console.log('⚠️ 无关键词结果');
      return [];
    }
  } catch (error) {
    console.log('⚠️ 关键词提取失败:', error instanceof Error ? error.message : String(error));
    return [];
  }
}