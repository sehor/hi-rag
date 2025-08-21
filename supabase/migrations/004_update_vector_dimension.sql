-- 更新向量维度从1536到768
-- 兼容新的768维向量服务

-- 删除现有的向量索引
DROP INDEX IF EXISTS idx_document_chunks_embedding;

-- 清空现有的向量数据（因为维度不兼容）
UPDATE document_chunks SET embedding = NULL;

-- 修改embedding字段的向量维度
ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector(768);

-- 重新创建向量索引
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops);

-- 注意：现有的向量数据已被清空，需要重新处理所有文档以生成新的768维向量