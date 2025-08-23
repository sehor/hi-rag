/**
 * 计算两个向量之间的余弦相似度
 * @param vecA 向量A
 * @param vecB 向量B
 * @returns 余弦相似度值 (0-1)
 */
export function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
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
 * @param textA 文本A
 * @param textB 文本B
 * @returns Jaccard相似度值 (0-1)
 */
export function calculateJaccardSimilarity(textA: string, textB: string): number {
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
 * @returns 重排序后的文档块数组
 */
export function diversityRerank(chunks: any[], queryEmbedding: number[], lambda: number = 0.7, maxResults: number = 5): any[] {
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