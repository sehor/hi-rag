-- 修复Supabase安全问题
-- 1. 为函数添加安全的search_path设置
-- 2. 将vector扩展移动到专门的extensions模式

-- 创建extensions模式
CREATE SCHEMA IF NOT EXISTS extensions;

-- 先删除依赖vector扩展的函数和对象
DROP FUNCTION IF EXISTS match_file_chunks(vector,double precision,integer);
DROP FUNCTION IF EXISTS hybrid_search_file_chunks(vector,text,double precision,integer);
DROP FUNCTION IF EXISTS search_similar_chunks(vector,uuid,double precision,integer);
DROP FUNCTION IF EXISTS search_similar_chunks_with_category(vector,uuid,double precision,integer,uuid);

-- 删除向量索引
DROP INDEX IF EXISTS idx_document_chunks_embedding;

-- 删除embedding列
ALTER TABLE document_chunks DROP COLUMN IF EXISTS embedding;

-- 将vector扩展移动到extensions模式
DROP EXTENSION IF EXISTS vector CASCADE;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- 重新添加embedding列，使用新的extensions.vector类型
ALTER TABLE document_chunks ADD COLUMN embedding extensions.vector(768);

-- 重新创建所有函数，添加安全的search_path设置

-- 1. 修复update_updated_at_column函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- 2. 修复handle_new_user函数
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.user_profiles (id, name, created_at, updated_at)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        new.created_at,
        new.created_at
    );
    RETURN new;
END;
$$;

-- 3. 修复generate_multilingual_search_vectors函数
CREATE OR REPLACE FUNCTION generate_multilingual_search_vectors(content_text text)
RETURNS TABLE(
    simple_vector tsvector,
    english_vector tsvector
) 
LANGUAGE plpgsql 
IMMUTABLE
SET search_path = public
AS $$
BEGIN
    -- Simple配置：适用于中文和其他语言，不做词干化
    simple_vector := to_tsvector('simple', COALESCE(content_text, ''));
    
    -- English配置：适用于英文，有词干化和停用词过滤
    english_vector := to_tsvector('english', COALESCE(content_text, ''));
    
    RETURN NEXT;
END;
$$;

-- 4. 修复update_multilingual_search_vectors函数
CREATE OR REPLACE FUNCTION update_multilingual_search_vectors()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.search_vector_simple = to_tsvector('simple', COALESCE(NEW.content, ''));
    NEW.search_vector_english = to_tsvector('english', COALESCE(NEW.content, ''));
    RETURN NEW;
END;
$$;

-- 5. 修复search_multilingual函数
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

-- 6. 修复search_similar_chunks函数
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

-- 7. 修复search_similar_chunks_with_category函数
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

-- 重新创建向量索引
CREATE INDEX idx_document_chunks_embedding ON document_chunks USING ivfflat (embedding extensions.vector_cosine_ops);

-- 添加注释说明安全修复
COMMENT ON FUNCTION update_updated_at_column IS '自动更新updated_at字段的触发器函数 - 已添加安全search_path';
COMMENT ON FUNCTION handle_new_user IS '用户注册时自动创建user_profiles记录 - 已添加安全search_path';
COMMENT ON FUNCTION generate_multilingual_search_vectors IS '生成多语言搜索向量 - 已添加安全search_path';
COMMENT ON FUNCTION update_multilingual_search_vectors IS '更新多语言搜索向量的触发器函数 - 已添加安全search_path';
COMMENT ON FUNCTION search_multilingual IS '多语言全文搜索函数 - 已添加安全search_path';
COMMENT ON FUNCTION search_similar_chunks IS '向量相似度搜索函数 - 已添加安全search_path';
COMMENT ON FUNCTION search_similar_chunks_with_category IS '支持分类过滤的向量相似度搜索函数 - 已添加安全search_path';