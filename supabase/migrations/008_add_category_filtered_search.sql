-- 创建支持分类过滤的向量相似度搜索函数
CREATE OR REPLACE FUNCTION search_similar_chunks_with_category(
  query_embedding vector(768),
  target_user_id uuid,
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 5,
  category_filter uuid DEFAULT NULL  -- 可选的分类过滤参数
)
RETURNS TABLE (
  id uuid,
  content text,
  chunk_index int,
  similarity float,
  documents jsonb
)
LANGUAGE plpgsql
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
    AND (category_filter IS NULL OR d.category_id = category_filter)  -- 分类过滤条件
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 为函数添加注释
COMMENT ON FUNCTION search_similar_chunks_with_category IS '使用余弦相似度搜索相关文档块，支持按分类过滤';

-- 为documents表的category_id字段创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_documents_category_id ON documents(category_id);