import { extractKeywordsWithAliyunNLP, extractKeywordsWithBaiduAI, extractKeywordsLocally } from '../lib/aliyun-nlp.js';

/**
 * 提取关键词（优先使用阿里云NLP，失败时回退到本地实现）
 * @param query 查询文本
 * @returns 关键词数组
 */
export async function extractKeywords(query: string): Promise<string[]> {
  console.log('🔍 开始提取关键词，原始查询:', query);
  
  try {
    // 优先尝试使用百度AI关键词提取服务（通用版本）
    const baiduResult = await extractKeywordsWithBaiduAI(query, 8);
    
    if (baiduResult.success && baiduResult.keywords.length > 0) {
      console.log('✅ 百度AI关键词提取成功:', baiduResult.keywords);
      return baiduResult.keywords;
    } else {
      console.log('⚠️ 百度AI关键词提取失败，尝试阿里云NLP服务:', baiduResult.error);
    }
  } catch (error) {
    console.log('⚠️ 百度AI服务异常，尝试阿里云NLP服务:', error);
  }
  
  try {
    // 回退到阿里云NLP服务
    const aliyunResult = await extractKeywordsWithAliyunNLP(query, 8);
    
    if (aliyunResult.success && aliyunResult.keywords.length > 0) {
      console.log('✅ 阿里云NLP关键词提取成功:', aliyunResult.keywords);
      return aliyunResult.keywords;
    } else {
      console.log('⚠️ 阿里云NLP关键词提取失败，回退到本地实现:', aliyunResult.error);
    }
  } catch (error) {
    console.log('⚠️ 阿里云NLP服务异常，回退到本地实现:', error);
  }
  
  // 最终回退到本地关键词提取
  const localKeywords = extractKeywordsLocally(query);
  console.log('✅ 本地关键词提取结果:', localKeywords);
  
  return localKeywords;
}

/**
 * 本地关键词提取实现（保留原有逻辑作为备用）
 * @param query 查询文本
 * @returns 关键词数组
 */
export function extractKeywordsLocal(query: string): string[] {
  console.log('🔍 使用本地方法提取关键词，原始查询:', query);
  
  // 移除标点符号，保留中文、英文和数字
  const cleanQuery = query
    .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ') // 将标点符号替换为空格
    .replace(/\s+/g, ' ') // 合并多个空格
    .trim();
  
  console.log('🧹 清理后的查询:', cleanQuery);
  
  // 扩展的中文停用词列表
  const stopWords = new Set([
    // 基础停用词
    '的', '是', '在', '有', '和', '与', '或', '但', '而', '了', '吗', '呢', '啊', '哪', '什么', '怎么', '为什么',
    // 疑问词
    '如何', '怎样', '哪里', '哪个', '哪些', '什么时候', '为何',
    // 介词和连词
    '从', '到', '向', '往', '由', '被', '把', '给', '对', '关于', '按照', '根据',
    // 助词
    '着', '过', '来', '去', '上', '下', '里', '中', '内', '外', '前', '后', '左', '右',
    // 代词
    '我', '你', '他', '她', '它', '我们', '你们', '他们', '这', '那', '这个', '那个', '这些', '那些',
    // 数量词
    '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '个', '些', '点',
    // 英文停用词
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he', 'in', 'is', 'it',
    'its', 'of', 'on', 'that', 'the', 'to', 'was', 'will', 'with', 'the', 'this', 'but', 'they',
    'have', 'had', 'what', 'said', 'each', 'which', 'do', 'how', 'their', 'if', 'up', 'out', 'many'
  ]);
  
  // 改进的中文分词逻辑
  const keywords = new Set<string>();
  
  // 1. 首先按空格分割（处理英文和已分词的中文）
  const spaceWords = cleanQuery.toLowerCase().split(/\s+/).filter(word => word.length > 0);
  
  for (const word of spaceWords) {
    // 如果是纯英文或数字，直接添加
    if (/^[a-z0-9]+$/i.test(word)) {
      if (word.length > 1 && !stopWords.has(word)) {
        keywords.add(word);
      }
    } else {
      // 对于包含中文的词汇，进行进一步分词
      const chineseKeywords = extractChineseKeywords(word, stopWords);
      chineseKeywords.forEach(kw => keywords.add(kw));
    }
  }
  
  // 2. 对整个查询进行中文分词（作为补充）
  const additionalKeywords = extractChineseKeywords(cleanQuery.toLowerCase(), stopWords);
  additionalKeywords.forEach(kw => keywords.add(kw));
  
  const result = Array.from(keywords);
  console.log('✅ 本地提取的关键词:', result);
  
  return result;
}

/**
 * 提取中文关键词的辅助函数
 * @param text 文本
 * @param stopWords 停用词集合
 * @returns 关键词数组
 */
function extractChineseKeywords(text: string, stopWords: Set<string>): string[] {
  const keywords: string[] = [];
  
  // 简单的中文分词策略：
  // 1. 提取2-4字的中文词组
  // 2. 识别常见的词汇模式
  
  // 提取2字词组
  for (let i = 0; i < text.length - 1; i++) {
    const twoChar = text.substring(i, i + 2);
    if (/^[\u4e00-\u9fa5]{2}$/.test(twoChar) && !stopWords.has(twoChar)) {
      keywords.push(twoChar);
    }
  }
  
  // 提取3字词组
  for (let i = 0; i < text.length - 2; i++) {
    const threeChar = text.substring(i, i + 3);
    if (/^[\u4e00-\u9fa5]{3}$/.test(threeChar) && !stopWords.has(threeChar)) {
      keywords.push(threeChar);
    }
  }
  
  // 提取4字词组
  for (let i = 0; i < text.length - 3; i++) {
    const fourChar = text.substring(i, i + 4);
    if (/^[\u4e00-\u9fa5]{4}$/.test(fourChar) && !stopWords.has(fourChar)) {
      keywords.push(fourChar);
    }
  }
  
  // 识别特殊模式：门派名称（包含"门"字的词组）
  const doorPattern = /([\u4e00-\u9fa5]*门[\u4e00-\u9fa5]*)/g;
  let match;
  while ((match = doorPattern.exec(text)) !== null) {
    const doorWord = match[1];
    if (doorWord.length >= 2 && !stopWords.has(doorWord)) {
      keywords.push(doorWord);
    }
  }
  
  // 识别特殊模式：技能相关（包含"技"、"法"、"术"等字的词组）
  const skillPattern = /([\u4e00-\u9fa5]*[技法术功][\u4e00-\u9fa5]*)/g;
  while ((match = skillPattern.exec(text)) !== null) {
    const skillWord = match[1];
    if (skillWord.length >= 2 && !stopWords.has(skillWord)) {
      keywords.push(skillWord);
    }
  }
  
  // 去重并过滤
  return [...new Set(keywords)].filter(kw => {
    // 过滤单字符（除非是重要字符）
    if (kw.length === 1) {
      const importantSingleChars = new Set(['人', '事', '物', '钱', '时', '地', '法', '理', '情', '心', '手', '书', '车', '房', '工', '学', '门', '技']);
      return importantSingleChars.has(kw);
    }
    return true;
  });
}

/**
 * 验证文档块是否包含查询关键词
 * @param content 文档内容
 * @param keywords 关键词数组
 * @returns 是否匹配
 */
export function validateKeywordMatch(content: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  
  const contentLower = content.toLowerCase();
  // 至少匹配一个关键词
  const matchCount = keywords.filter(keyword => 
    contentLower.includes(keyword.toLowerCase())
  ).length;
  
  return matchCount > 0;
}

/**
 * 计算关键词匹配度
 * @param content 文档内容
 * @param keywords 关键词数组
 * @returns 匹配度分数 (0-1)
 */
export function calculateKeywordMatchScore(content: string, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  
  const contentLower = content.toLowerCase();
  let totalScore = 0;
  
  for (const keyword of keywords) {
    const keywordLower = keyword.toLowerCase();
    const regex = new RegExp(keywordLower, 'gi');
    const matches = content.match(regex);
    const matchCount = matches ? matches.length : 0;
    
    // 基础分数：匹配次数 * 关键词长度权重
    const baseScore = matchCount * Math.log(keyword.length + 1);
    
    // 位置权重：出现在开头的关键词权重更高
    const firstIndex = contentLower.indexOf(keywordLower);
    const positionWeight = firstIndex >= 0 ? (1 - firstIndex / content.length * 0.3) : 0;
    
    totalScore += baseScore * positionWeight;
  }
  
  // 归一化分数
  const maxPossibleScore = keywords.length * 10; // 假设最大分数
  return Math.min(totalScore / maxPossibleScore, 1);
}