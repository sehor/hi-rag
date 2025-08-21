-- 为 document_chunks 表添加 metadata 字段
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 为 metadata 字段创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_document_chunks_metadata ON document_chunks USING GIN (metadata);

-- 添加注释
COMMENT ON COLUMN document_chunks.metadata IS '存储分块的元数据信息，包括来源、页码、章节等';