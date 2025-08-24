-- 删除全文搜索向量列和相关功能

-- 删除触发器
DROP TRIGGER IF EXISTS update_multilingual_search_vectors_trigger ON document_chunks;

-- 删除触发器函数
DROP FUNCTION IF EXISTS update_multilingual_search_vectors();

-- 删除搜索函数
DROP FUNCTION IF EXISTS search_multilingual(text, float, int);

-- 删除生成搜索向量的函数
DROP FUNCTION IF EXISTS generate_multilingual_search_vectors(text);

-- 删除索引
DROP INDEX IF EXISTS idx_document_chunks_search_vector_simple;
DROP INDEX IF EXISTS idx_document_chunks_search_vector_english;

-- 删除向量列
ALTER TABLE document_chunks DROP COLUMN IF EXISTS search_vector_simple;
ALTER TABLE document_chunks DROP COLUMN IF EXISTS search_vector_english;

-- 删除 multilingual 文本搜索配置
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'multilingual') THEN
    DROP TEXT SEARCH CONFIGURATION multilingual;
  END IF;
END
$$;