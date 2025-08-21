-- 删除旧的search_similar_chunks函数（如果存在）
DROP FUNCTION IF EXISTS search_similar_chunks(vector, text, float, int);
DROP FUNCTION IF EXISTS search_similar_chunks(vector, uuid, float, int);

-- 重新创建向量相似度搜索函数，确保参数类型正确
CREATE OR REPLACE FUNCTION search_similar_chunks(
  query_embedding vector(768),
  target_user_id uuid,  -- 确保为uuid类型
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

-- 为函数添加注释
COMMENT ON FUNCTION search_similar_chunks IS '使用余弦相似度搜索相关文档块，参数类型已修正为uuid';