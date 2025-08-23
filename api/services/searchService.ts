import { supabaseAdmin } from '../lib/supabase.js';
import { generateQueryEmbedding } from './embeddingService.js';
import { extractKeywords, validateKeywordMatch, calculateKeywordMatchScore } from './keywordService.js';

/**
 * 混合搜索：结合向量搜索和关键词搜索
 * @param query 查询文本
 * @param userId 用户ID
 * @param limit 返回结果数量限制
 * @param categoryId 分类ID（可选）
 * @returns 搜索结果数组
 */
export async function searchRelevantChunks(query: string, userId: string, limit: number = 5, categoryId?: string) {
  console.log('🔍 开始混合搜索相关文档块...');
  console.log('- 用户ID:', userId);
  console.log('- 分类ID:', categoryId);
  
  // 提取查询关键词
  const keywords = await extractKeywords(query);
  console.log('🔑 提取的关键词:', keywords);
  
  try {
    // 同时执行向量搜索和关键词搜索
    const [vectorResults, keywordResults] = await Promise.allSettled([
      performVectorSearch(query, userId, limit * 2, categoryId),
      fallbackKeywordSearch(query, userId, limit * 2, categoryId)
    ]);
    
    // 获取搜索结果
    const vectorChunks = vectorResults.status === 'fulfilled' ? vectorResults.value : [];
    const keywordChunks = keywordResults.status === 'fulfilled' ? keywordResults.value : [];
    
    console.log(`📊 向量搜索结果: ${vectorChunks.length} 个文档块`);
    console.log(`📊 关键词搜索结果: ${keywordChunks.length} 个文档块`);
    
    // 如果两种搜索都没有结果，返回空数组
    if (vectorChunks.length === 0 && keywordChunks.length === 0) {
      console.log('⚠️ 混合搜索无结果');
      return [];
    }
    
    // 融合搜索结果
    const hybridResults = fuseSearchResults(vectorChunks, keywordChunks, keywords, limit);
    
    console.log(`✅ 混合搜索最终返回 ${hybridResults.length} 个文档块`);
    hybridResults.forEach((chunk: any, index: number) => {
      console.log(`📋 排序 ${index + 1}: 综合分数 ${chunk.hybrid_score?.toFixed(4) || 'N/A'}`);
    });
    
    return hybridResults;
    
  } catch (error) {
    console.error('💥 混合搜索错误:', error);
    // 如果混合搜索失败，回退到单独的关键词搜索
    console.log('🔄 回退到关键字搜索...');
    return await fallbackKeywordSearch(query, userId, limit, categoryId);
  }
}

/**
 * 执行向量搜索
 * @param query 查询文本
 * @param userId 用户ID
 * @param limit 返回结果数量限制
 * @param categoryId 分类ID（可选）
 * @returns 向量搜索结果数组
 */
export async function performVectorSearch(query: string, userId: string, limit: number, categoryId?: string) {
  console.log('🔍 执行向量相似度搜索...');
  
  // 生成查询向量
  const queryEmbedding = await generateQueryEmbedding(query);
  
  if (!queryEmbedding || queryEmbedding.length === 0) {
    throw new Error('查询向量生成失败');
  }
  
  console.log('✅ 查询向量生成成功，维度:', queryEmbedding.length);
  
  const { data: chunks, error } = await supabaseAdmin
    .rpc('search_similar_chunks_with_category', {
      query_embedding: queryEmbedding,
      target_user_id: userId,
      match_threshold: 0.3,
      match_count: limit,
      category_filter: categoryId || null
    });
  
  if (error) {
    console.error('❌ 向量搜索失败:', error);
    throw error;
  }
  
  return chunks || [];
}

/**
 * 融合向量搜索和关键词搜索的结果
 * @param vectorChunks 向量搜索结果
 * @param keywordChunks 关键词搜索结果
 * @param keywords 关键词数组
 * @param limit 返回结果数量限制
 * @returns 融合后的搜索结果数组
 */
export function fuseSearchResults(vectorChunks: any[], keywordChunks: any[], keywords: string[], limit: number) {
  console.log('🔄 开始融合搜索结果...');
  
  // 创建结果映射，避免重复
  const resultMap = new Map<string, any>();
  
  // 计算向量搜索分数的最大值和最小值，用于归一化
  const vectorScores = vectorChunks.map(chunk => chunk.similarity || 0).filter(score => score > 0);
  const maxVectorScore = vectorScores.length > 0 ? Math.max(...vectorScores) : 1;
  const minVectorScore = vectorScores.length > 0 ? Math.min(...vectorScores) : 0;
  
  // 计算关键词搜索分数的最大值和最小值，用于归一化
  const keywordScores = keywordChunks.map(chunk => chunk.keyword_score || 0).filter(score => score > 0);
  const maxKeywordScore = keywordScores.length > 0 ? Math.max(...keywordScores) : 1;
  const minKeywordScore = keywordScores.length > 0 ? Math.min(...keywordScores) : 0;
  
  console.log(`📊 向量分数范围: ${minVectorScore.toFixed(4)} - ${maxVectorScore.toFixed(4)}`);
  console.log(`📊 关键词分数范围: ${minKeywordScore} - ${maxKeywordScore}`);
  
  // 处理向量搜索结果
  vectorChunks.forEach(chunk => {
    const chunkId = chunk.id;
    if (!resultMap.has(chunkId)) {
      resultMap.set(chunkId, {
        ...chunk,
        vector_score: chunk.similarity || 0,
        keyword_score: 0,
        hybrid_score: 0
      });
    }
  });
  
  // 处理关键词搜索结果
  keywordChunks.forEach(chunk => {
    const chunkId = chunk.id;
    if (resultMap.has(chunkId)) {
      // 如果已存在，更新关键词分数
      const existingChunk = resultMap.get(chunkId);
      existingChunk.keyword_score = chunk.keyword_score || 0;
    } else {
      // 如果不存在，添加新的结果
      resultMap.set(chunkId, {
        ...chunk,
        vector_score: 0,
        keyword_score: chunk.keyword_score || 0,
        hybrid_score: 0
      });
    }
  });
  
  // 计算混合分数并排序
  const fusedResults = Array.from(resultMap.values())
    .map(chunk => {
      // 改进的归一化方法
      let normalizedVectorScore = 0;
      if (chunk.vector_score > 0 && maxVectorScore > minVectorScore) {
        normalizedVectorScore = (chunk.vector_score - minVectorScore) / (maxVectorScore - minVectorScore);
      } else if (chunk.vector_score > 0) {
        normalizedVectorScore = chunk.vector_score;
      }
      
      let normalizedKeywordScore = 0;
      if (chunk.keyword_score > 0 && maxKeywordScore > minKeywordScore) {
        normalizedKeywordScore = (chunk.keyword_score - minKeywordScore) / (maxKeywordScore - minKeywordScore);
      } else if (chunk.keyword_score > 0) {
        normalizedKeywordScore = Math.min(chunk.keyword_score / 5, 1.0); // 关键词分数除以5进行归一化
      }
      
      // 动态权重：如果关键词匹配度高，增加关键词权重
      const keywordMatchRatio = keywords.length > 0 ? 
        keywords.filter(keyword => 
          chunk.content.toLowerCase().includes(keyword.toLowerCase())
        ).length / keywords.length : 0;
      
      // 基础权重：向量0.6，关键词0.4
      let vectorWeight = 0.6;
      let keywordWeight = 0.4;
      
      // 如果关键词匹配度很高（>80%），增加关键词权重
      if (keywordMatchRatio > 0.8) {
        vectorWeight = 0.5;
        keywordWeight = 0.5;
      }
      
      // 计算基础混合分数
      const hybridScore = (normalizedVectorScore * vectorWeight) + (normalizedKeywordScore * keywordWeight);
      
      // 额外加分机制
      let bonus = 0;
      
      // 如果同时在两种搜索中出现，给予额外加分
      if (chunk.vector_score > 0 && chunk.keyword_score > 0) {
        bonus += 0.1;
      }
      
      // 如果关键词匹配度很高，给予额外加分
      if (keywordMatchRatio > 0.5) {
        bonus += keywordMatchRatio * 0.1;
      }
      
      const finalScore = Math.min(hybridScore + bonus, 1.0); // 确保分数不超过1
      
      return {
        ...chunk,
        hybrid_score: finalScore,
        keyword_match_ratio: keywordMatchRatio,
        normalized_vector_score: normalizedVectorScore,
        normalized_keyword_score: normalizedKeywordScore
      };
    })
    .sort((a, b) => {
      // 首先按混合分数排序
      if (Math.abs(a.hybrid_score - b.hybrid_score) > 0.01) {
        return b.hybrid_score - a.hybrid_score;
      }
      // 如果混合分数相近，优先选择关键词匹配度高的
      return b.keyword_match_ratio - a.keyword_match_ratio;
    })
    .slice(0, limit);
  
  console.log(`🔗 融合完成，返回 ${fusedResults.length} 个结果`);
  fusedResults.forEach((chunk, index) => {
    console.log(`📋 结果 ${index + 1}: 混合分数=${chunk.hybrid_score.toFixed(4)}, 关键词匹配=${(chunk.keyword_match_ratio * 100).toFixed(1)}%`);
  });
  
  return fusedResults;
}

/**
 * 关键字搜索回退方案 - 使用多关键词搜索
 * @param query 查询文本
 * @param userId 用户ID
 * @param limit 返回结果数量限制
 * @param categoryId 分类ID（可选）
 * @returns 关键词搜索结果数组
 */
export async function fallbackKeywordSearch(query: string, userId: string, limit: number = 5, categoryId?: string) {
  console.log('🔍 执行关键字搜索回退方案...');
  
  try {
    // 提取关键词
    const keywords = await extractKeywords(query);
    console.log('🔑 提取的关键词:', keywords);
    
    if (keywords.length === 0) {
      console.log('⚠️ 没有提取到有效关键词，使用原始查询');
      // 如果没有关键词，回退到原始查询
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
      
      if (categoryId) {
        queryBuilder = queryBuilder.eq('documents.category_id', categoryId);
      }
      
      const { data: chunks, error } = await queryBuilder.limit(limit);
      return chunks || [];
    }
    
    // 使用多关键词搜索
    const searchResults = new Map<string, any>();
    const keywordScores = new Map<string, number>();
    
    // 为每个关键词执行搜索
    for (const keyword of keywords) {
      let keywordQueryBuilder = supabaseAdmin
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
        .ilike('content', `%${keyword}%`);
      
      if (categoryId) {
        keywordQueryBuilder = keywordQueryBuilder.eq('documents.category_id', categoryId);
      }
      
      const { data: keywordChunks, error } = await keywordQueryBuilder.limit(limit * 2);
      
      if (error) {
        console.error(`❌ 关键词 "${keyword}" 搜索失败:`, error);
        continue;
      }
      
      // 合并结果并计算分数
      keywordChunks?.forEach(chunk => {
        const chunkId = chunk.id;
        if (!searchResults.has(chunkId)) {
          searchResults.set(chunkId, chunk);
          keywordScores.set(chunkId, 0);
        }
        
        // 计算关键词匹配分数
        const content = chunk.content.toLowerCase();
        const keywordCount = (content.match(new RegExp(keyword.toLowerCase(), 'g')) || []).length;
        const currentScore = keywordScores.get(chunkId) || 0;
        keywordScores.set(chunkId, currentScore + keywordCount);
      });
    }
    
    // 转换为数组并按分数排序
    const rankedChunks = Array.from(searchResults.values())
      .map(chunk => ({
        ...chunk,
        keyword_score: keywordScores.get(chunk.id) || 0
      }))
      .sort((a, b) => b.keyword_score - a.keyword_score)
      .slice(0, limit);
    
    console.log(`✅ 多关键词搜索找到 ${rankedChunks.length} 个相关文档块`);
    rankedChunks.forEach((chunk, index) => {
      console.log(`📊 文档块 ${index + 1}: 关键词分数 ${chunk.keyword_score}`);
    });
    
    return rankedChunks;
    
  } catch (error) {
    console.error('💥 关键字搜索错误:', error);
    return [];
  }
}