-- 添加多语言全文搜索支持
-- 解决多语言混合文档的搜索问题

-- 创建多语言搜索配置（基于simple，支持多语言）
CREATE TEXT SEARCH CONFIGURATION multilingual (COPY = simple);

-- 为document_chunks表添加多个搜索向量列
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS search_vector_simple tsvector;
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS search_vector_english tsvector;

-- 创建多语言搜索向量生成函数
CREATE OR REPLACE FUNCTION generate_multilingual_search_vectors(content_text text)
RETURNS TABLE(
    simple_vector tsvector,
    english_vector tsvector
) AS $$
BEGIN
    -- Simple配置：适用于中文和其他语言，不做词干化
    simple_vector := to_tsvector('simple', COALESCE(content_text, ''));
    
    -- English配置：适用于英文，有词干化和停用词过滤
    english_vector := to_tsvector('english', COALESCE(content_text, ''));
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 更新现有记录的搜索向量
UPDATE document_chunks 
SET 
    search_vector_simple = to_tsvector('simple', COALESCE(content, '')),
    search_vector_english = to_tsvector('english', COALESCE(content, ''))
WHERE search_vector_simple IS NULL OR search_vector_english IS NULL;

-- 创建触发器函数，自动更新多语言搜索向量
CREATE OR REPLACE FUNCTION update_multilingual_search_vectors()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector_simple = to_tsvector('simple', COALESCE(NEW.content, ''));
    NEW.search_vector_english = to_tsvector('english', COALESCE(NEW.content, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为document_chunks表添加触发器
DROP TRIGGER IF EXISTS update_document_chunks_multilingual_search ON document_chunks;
CREATE TRIGGER update_document_chunks_multilingual_search
    BEFORE INSERT OR UPDATE OF content ON document_chunks
    FOR EACH ROW EXECUTE FUNCTION update_multilingual_search_vectors();

-- 创建多语言搜索的GIN索引
CREATE INDEX IF NOT EXISTS idx_document_chunks_search_simple 
    ON document_chunks USING GIN(search_vector_simple);
    
CREATE INDEX IF NOT EXISTS idx_document_chunks_search_english 
    ON document_chunks USING GIN(search_vector_english);

-- 创建组合搜索函数
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
) AS $$
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
$$ LANGUAGE plpgsql;