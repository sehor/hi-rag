-- 添加全文搜索向量列
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS search_vector_simple tsvector;
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS search_vector_english tsvector;

-- 创建 multilingual 文本搜索配置
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'multilingual') THEN
    CREATE TEXT SEARCH CONFIGURATION multilingual ( COPY = simple );
  END IF;
END
$$;

-- 创建生成多语言搜索向量的函数
CREATE OR REPLACE FUNCTION generate_multilingual_search_vectors(content_text text)
RETURNS TABLE(simple_vector tsvector, english_vector tsvector)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY SELECT
    to_tsvector('multilingual', content_text) as simple_vector,
    to_tsvector('english', content_text) as english_vector;
END;
$$;

-- 为现有记录生成搜索向量
UPDATE document_chunks 
SET 
  search_vector_simple = to_tsvector('multilingual', content),
  search_vector_english = to_tsvector('english', content)
WHERE content IS NOT NULL;

-- 创建触发器函数
CREATE OR REPLACE FUNCTION update_multilingual_search_vectors()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector_simple := to_tsvector('multilingual', NEW.content);
  NEW.search_vector_english := to_tsvector('english', NEW.content);
  RETURN NEW;
END;
$$;

-- 删除旧触发器（如果存在）
DROP TRIGGER IF EXISTS update_multilingual_search_vectors_trigger ON document_chunks;

-- 创建新触发器
CREATE TRIGGER update_multilingual_search_vectors_trigger
  BEFORE INSERT OR UPDATE OF content ON document_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_multilingual_search_vectors();

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_document_chunks_search_vector_simple 
ON document_chunks USING gin(search_vector_simple);

CREATE INDEX IF NOT EXISTS idx_document_chunks_search_vector_english 
ON document_chunks USING gin(search_vector_english);

-- 创建多语言搜索函数
CREATE OR REPLACE FUNCTION search_multilingual(
  query_text text,
  match_threshold float DEFAULT 0.1,
  match_count int DEFAULT 50
)
RETURNS TABLE(
  id uuid,
  content text,
  document_id uuid,
  chunk_index int,
  similarity float
)
LANGUAGE plpgsql
AS $$
DECLARE
  query_vector_simple tsvector;
  query_vector_english tsvector;
BEGIN
  -- 生成查询向量
  query_vector_simple := to_tsquery('multilingual', query_text);
  query_vector_english := to_tsquery('english', query_text);
  
  RETURN QUERY
  SELECT 
    dc.id,
    dc.content,
    dc.document_id,
    dc.chunk_index,
    GREATEST(
      ts_rank(dc.search_vector_simple, query_vector_simple),
      ts_rank(dc.search_vector_english, query_vector_english)
    ) as similarity
  FROM document_chunks dc
  WHERE 
    (dc.search_vector_simple @@ query_vector_simple OR 
     dc.search_vector_english @@ query_vector_english)
    AND GREATEST(
      ts_rank(dc.search_vector_simple, query_vector_simple),
      ts_rank(dc.search_vector_english, query_vector_english)
    ) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;