-- 更新向量维度从768到1024
-- 兼容阿里云text-embedding-v4模型的1024维向量

-- 删除现有的向量索引
DROP INDEX IF EXISTS idx_document_chunks_embedding;

-- 清空现有的向量数据（因为维度不兼容）
UPDATE document_chunks SET embedding = NULL;

-- 修改embedding字段的向量维度
ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector(1024);

-- 重新创建向量索引
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops);

-- 更新向量搜索函数以支持1024维向量
DROP FUNCTION IF EXISTS search_similar_chunks(vector, uuid, float, int);

CREATE OR REPLACE FUNCTION search_similar_chunks(
  query_embedding vector(1024),
  target_user_id uuid,
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float,
  document_id uuid,
  chunk_index int,
  metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dc.id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity,
    dc.document_id,
    dc.chunk_index,
    dc.metadata
  FROM document_chunks dc
  JOIN documents d ON dc.document_id = d.id
  WHERE d.user_id = target_user_id
    AND dc.embedding IS NOT NULL
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 注意：现有的向量数据已被清空，需要重新处理所有文档以生成新的1024维向量