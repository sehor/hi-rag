import { supabaseAdmin } from '../lib/supabase.js';
import { generateQueryEmbedding } from './embeddingService.js';
import { extractKeywords } from './keywordService.js';

/**
 * 混合搜索：结合向量搜索和关键词搜索
 * @param query 查询文本
 * @param userId 用户ID
 * @param limit 返回结果数量限制
 * @param categoryId 分类ID（可选）
 * @returns 搜索结果数组
 */
export async function searchRelevantChunks(query: string, userId: string, limit: number = 5, categoryId?: string) {
  console.log('🔍 开始混合搜索...');
  
  // 提取查询关键词
  const keywords = await extractKeywords(query);
  console.log('🔑 关键词:', keywords.join(', '));
  
  // 生成查询向量（只生成一次）
  const queryEmbedding = await generateQueryEmbedding(query);
  
  if (!queryEmbedding || queryEmbedding.length === 0) {
    console.log('⚠️ 向量生成失败，使用关键词搜索');
    return await fallbackKeywordSearch(query, userId, limit, categoryId, keywords);
  }
  
  // 如果关键词提取失败，直接使用向量搜索
  if (keywords.length === 0) {
    console.log('⚠️ 关键词提取失败，使用纯向量搜索');
    try {
      const vectorResults = await performVectorSearchWithEmbedding(queryEmbedding, userId, limit, categoryId);
      console.log(`✅ 返回 ${vectorResults.length} 个结果`);
      return vectorResults;
    } catch (error) {
      console.error('💥 向量搜索错误:', error);
      return [];
    }
  }
  
  try {
    // 同时执行向量搜索和关键词搜索（传递已生成的向量和关键词）
    const [vectorResults, keywordResults] = await Promise.allSettled([
      performVectorSearchWithEmbedding(queryEmbedding, userId, limit * 2, categoryId),
      fallbackKeywordSearch(query, userId, limit * 2, categoryId, keywords)
    ]);
    
    // 获取搜索结果
    const vectorChunks = vectorResults.status === 'fulfilled' ? vectorResults.value : [];
    const keywordChunks = keywordResults.status === 'fulfilled' ? keywordResults.value : [];
    
    console.log(`📊 向量:${vectorChunks.length} 关键词:${keywordChunks.length}`);
    
    // 详细打印向量搜索找到的文档
    if (vectorChunks.length > 0) {
      console.log('🎯 向量搜索找到的文档:');
      vectorChunks.forEach((chunk, index) => {
        const title = chunk.documents?.title || '未知文档';
        const similarity = chunk.similarity || 0;
        console.log(`  ${index + 1}. ${title} (相似度: ${similarity.toFixed(4)})`);
      });
    } else {
      console.log('🎯 向量搜索未找到任何文档');
    }
    
    // 详细打印关键词搜索找到的文档
    if (keywordChunks.length > 0) {
      console.log('🔍 关键词搜索找到的文档:');
      keywordChunks.forEach((chunk, index) => {
        const title = chunk.documents?.title || '未知文档';
        const keywordScore = chunk.keyword_score || 0;
        const matchRatio = chunk.match_ratio || 0;
        console.log(`  ${index + 1}. ${title} (关键词分数: ${keywordScore}, 匹配度: ${(matchRatio * 100).toFixed(1)}%)`);
      });
    } else {
      console.log('🔍 关键词搜索未找到任何文档');
    }
    
    // 如果两种搜索都没有结果，返回空数组
    if (vectorChunks.length === 0 && keywordChunks.length === 0) {
      console.log('⚠️ 无搜索结果');
      return [];
    }
    
    // 融合搜索结果
    const hybridResults = fuseSearchResults(vectorChunks, keywordChunks, keywords, limit);
    
    console.log(`✅ 返回 ${hybridResults.length} 个混合结果`);
    
    return hybridResults;
    
  } catch (error) {
    console.error('💥 混合搜索错误:', error);
    // 如果混合搜索失败，回退到向量搜索
    try {
      return await performVectorSearchWithEmbedding(queryEmbedding, userId, limit, categoryId);
    } catch (fallbackError) {
      console.error('💥 向量搜索回退失败:', fallbackError);
      return [];
    }
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
  console.log('🔍 执行向量搜索...');
  
  // 生成查询向量
  const queryEmbedding = await generateQueryEmbedding(query);
  
  if (!queryEmbedding || queryEmbedding.length === 0) {
    throw new Error('查询向量生成失败');
  }
  
  return await performVectorSearchWithEmbedding(queryEmbedding, userId, limit, categoryId);
}

/**
 * 使用预生成的向量执行向量搜索
 * @param queryEmbedding 查询向量
 * @param userId 用户ID
 * @param limit 返回结果数量限制
 * @param categoryId 分类ID（可选）
 * @returns 向量搜索结果数组
 */
export async function performVectorSearchWithEmbedding(queryEmbedding: number[], userId: string, limit: number, categoryId?: string) {
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
  
  const results = chunks || [];
  
  // 打印向量搜索的详细结果
  if (results.length > 0) {
    console.log('📈 向量搜索结果详情:');
    results.forEach((chunk, index) => {
      const title = chunk.documents?.title || '未知文档';
      const similarity = chunk.similarity || 0;
      console.log(`  ${index + 1}. 文档: ${title}`);
      console.log(`     相似度: ${similarity.toFixed(4)}`);
      console.log(`     内容预览: ${chunk.content.substring(0, 100)}...`);
    });
  } else {
    console.log('📈 向量搜索未找到匹配结果');
  }
  
  return results;
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
  
  return fusedResults;
}

/**
 * 关键字搜索回退方案 - 使用简单文本搜索
 * @param query 查询文本
 * @param userId 用户ID
 * @param limit 返回结果数量限制
 * @param categoryId 分类ID（可选）
 * @param keywords 预提取的关键词（可选）
 * @returns 关键词搜索结果数组
 */
export async function fallbackKeywordSearch(query: string, userId: string, limit: number = 5, categoryId?: string, keywords?: string[]) {
  console.log('🔍 执行关键词搜索...');
  
  try {
    // 使用传入的关键词或提取新的关键词
    let searchKeywords = keywords;
    if (!searchKeywords) {
      searchKeywords = await extractKeywords(query);
      console.log('🔑 提取关键词:', searchKeywords.join(', '));
    }
    
    // 如果没有关键词，使用原始查询进行文本搜索
    const searchTerms = searchKeywords.length > 0 ? searchKeywords : [query];
    console.log('🔎 使用搜索词:', searchTerms.join(', '));
    
    // 构建查询条件
    let queryBuilder = supabaseAdmin
      .from('document_chunks')
      .select(`
        id,
        document_id,
        content,
        chunk_index,
        created_at,
        metadata,
        documents!inner(
          id,
          title,
          user_id,
          category_id
        )
      `)
      .eq('documents.user_id', userId);
    
    // 添加分类过滤
    if (categoryId) {
      queryBuilder = queryBuilder.eq('documents.category_id', categoryId);
    }
    
    // 构建文本搜索条件 - 使用 OR 连接多个关键词
    const searchConditions = searchTerms.map(term => 
      `content.ilike.%${term}%`
    ).join(',');
    
    queryBuilder = queryBuilder.or(searchConditions);
    
    const { data: chunks, error } = await queryBuilder
      .limit(limit * 2) // 获取更多结果用于排序
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('❌ 文本搜索失败:', error);
      return [];
    }
    
    if (!chunks || chunks.length === 0) {
      console.log('🔎 关键词搜索未找到任何匹配的文档块');
      return [];
    }
    
    console.log(`🔎 关键词搜索找到 ${chunks.length} 个文档块`);
    
    // 为结果添加关键词匹配分数并排序
    const rankedChunks = chunks.map(chunk => {
      const content = chunk.content.toLowerCase();
      let keywordScore = 0;
      let matchedKeywords = 0;
      
      // 计算关键词匹配分数
      searchTerms.forEach(term => {
        const termLower = term.toLowerCase();
        if (content.includes(termLower)) {
          matchedKeywords++;
          // 计算词频
          const regex = new RegExp(termLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          const matches = content.match(regex) || [];
          keywordScore += matches.length;
        }
      });
      
      // 计算匹配度（匹配的关键词数量 / 总关键词数量）
      const matchRatio = searchTerms.length > 0 ? matchedKeywords / searchTerms.length : 0;
      
      return {
        ...chunk,
        keyword_score: keywordScore,
        match_ratio: matchRatio,
        matched_keywords: matchedKeywords
      };
    })
    .sort((a, b) => {
      // 首先按匹配度排序
      if (a.match_ratio !== b.match_ratio) {
        return b.match_ratio - a.match_ratio;
      }
      // 然后按关键词分数排序
      if (a.keyword_score !== b.keyword_score) {
        return b.keyword_score - a.keyword_score;
      }
      // 最后按创建时间排序
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
    .slice(0, limit);
    
    // 打印关键词搜索的详细结果
    if (rankedChunks.length > 0) {
      console.log('📋 关键词搜索结果详情:');
      rankedChunks.forEach((chunk, index) => {
        const title = chunk.documents?.title || '未知文档';
        const keywordScore = chunk.keyword_score || 0;
        const matchRatio = chunk.match_ratio || 0;
        const matchedKeywords = chunk.matched_keywords || 0;
        console.log(`  ${index + 1}. 文档: ${title}`);
        console.log(`     关键词分数: ${keywordScore}`);
        console.log(`     匹配度: ${(matchRatio * 100).toFixed(1)}% (${matchedKeywords}/${searchTerms.length} 个关键词)`);
        console.log(`     内容预览: ${chunk.content.substring(0, 100)}...`);
      });
    } else {
      console.log('📋 关键词搜索处理后无结果');
    }
    
    return rankedChunks;
    
  } catch (error) {
    console.error('💥 关键字搜索错误:', error);
    return [];
  }
}