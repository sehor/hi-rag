-- 修复向量搜索函数的安全权限问题
-- 添加 SECURITY DEFINER 权限以绕过 RLS 策略限制

-- 重新创建 search_similar_chunks 函数，添加 SECURITY DEFINER
CREATE OR REPLACE FUNCTION search_similar_chunks(
  query_embedding extensions.vector(768),
  target_user_id uuid,
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  content text,
  chunk_index int,
  similarity float,
  documents jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dc.id,
    dc.content,
    dc.chunk_index,
    -- 计算余弦相似度
    1 - (dc.embedding <=> query_embedding) as similarity,
    -- 返回文档信息作为JSON
    jsonb_build_object(
      'id', d.id,
      'title', d.title,
      'user_id', d.user_id
    ) as documents
  FROM document_chunks dc
  INNER JOIN documents d ON dc.document_id = d.id
  WHERE 
    d.user_id = target_user_id
    AND dc.embedding IS NOT NULL
    AND (1 - (dc.embedding <=> query_embedding)) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 重新创建 search_similar_chunks_with_category 函数，添加 SECURITY DEFINER
CREATE OR REPLACE FUNCTION search_similar_chunks_with_category(
  query_embedding extensions.vector(768),
  target_user_id uuid,
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 5,
  category_filter uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content text,
  chunk_index int,
  similarity float,
  documents jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dc.id,
    dc.content,
    dc.chunk_index,
    -- 计算余弦相似度
    1 - (dc.embedding <=> query_embedding) as similarity,
    -- 返回文档信息作为JSON
    jsonb_build_object(
      'id', d.id,
      'title', d.title,
      'user_id', d.user_id,
      'category_id', d.category_id
    ) as documents
  FROM document_chunks dc
  INNER JOIN documents d ON dc.document_id = d.id
  WHERE 
    d.user_id = target_user_id
    AND dc.embedding IS NOT NULL
    AND (1 - (dc.embedding <=> query_embedding)) > match_threshold
    AND (category_filter IS NULL OR d.category_id = category_filter)
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 重新创建 search_multilingual 函数，添加 SECURITY DEFINER
CREATE OR REPLACE FUNCTION search_multilingual(
    query_text text,
    user_id_param uuid,
    limit_param integer DEFAULT 5
)
RETURNS TABLE(
    id uuid,
    content text,
    chunk_index integer,
    document_id uuid,
    document_title text,
    relevance_score real
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        dc.id,
        dc.content,
        dc.chunk_index,
        d.id as document_id,
        d.title as document_title,
        GREATEST(
            ts_rank(dc.search_vector_simple, websearch_to_tsquery('simple', query_text)),
            ts_rank(dc.search_vector_english, websearch_to_tsquery('english', query_text))
        ) as relevance_score
    FROM document_chunks dc
    INNER JOIN documents d ON d.id = dc.document_id
    WHERE d.user_id = user_id_param
    AND (
        dc.search_vector_simple @@ websearch_to_tsquery('simple', query_text)
        OR dc.search_vector_english @@ websearch_to_tsquery('english', query_text)
    )
    ORDER BY relevance_score DESC
    LIMIT limit_param;
END;
$$;

-- 更新函数注释
COMMENT ON FUNCTION search_similar_chunks IS '向量相似度搜索函数 - 已添加 SECURITY DEFINER 权限';
COMMENT ON FUNCTION search_similar_chunks_with_category IS '支持分类过滤的向量相似度搜索函数 - 已添加 SECURITY DEFINER 权限';
COMMENT ON FUNCTION search_multilingual IS '多语言全文搜索函数 - 已添加 SECURITY DEFINER 权限';