-- 优化 RLS 策略性能
-- 修复 Supabase 性能报告中的两个主要问题：
-- 1. 避免 auth.uid() 等函数在 RLS 策略中重复执行
-- 2. 合并多个许可策略为单一策略

-- 首先删除所有现有的 RLS 策略
-- user_profiles 表策略
DROP POLICY IF EXISTS "用户只能查看自己的配置" ON user_profiles;
DROP POLICY IF EXISTS "用户只能更新自己的配置" ON user_profiles;
DROP POLICY IF EXISTS "用户可以插入自己的配置" ON user_profiles;

-- documents 表策略
DROP POLICY IF EXISTS "用户只能查看自己的文档" ON documents;
DROP POLICY IF EXISTS "用户只能创建自己的文档" ON documents;
DROP POLICY IF EXISTS "用户只能更新自己的文档" ON documents;
DROP POLICY IF EXISTS "用户只能删除自己的文档" ON documents;

-- document_chunks 表策略
DROP POLICY IF EXISTS "用户只能查看自己文档的块" ON document_chunks;
DROP POLICY IF EXISTS "用户只能创建自己文档的块" ON document_chunks;
DROP POLICY IF EXISTS "用户只能更新自己文档的块" ON document_chunks;
DROP POLICY IF EXISTS "用户只能删除自己文档的块" ON document_chunks;

-- conversations 表策略
DROP POLICY IF EXISTS "用户只能查看自己的对话" ON conversations;
DROP POLICY IF EXISTS "用户只能创建自己的对话" ON conversations;
DROP POLICY IF EXISTS "用户只能更新自己的对话" ON conversations;
DROP POLICY IF EXISTS "用户只能删除自己的对话" ON conversations;

-- messages 表策略
DROP POLICY IF EXISTS "用户只能查看自己对话的消息" ON messages;
DROP POLICY IF EXISTS "用户只能创建自己对话的消息" ON messages;
DROP POLICY IF EXISTS "用户只能更新自己对话的消息" ON messages;
DROP POLICY IF EXISTS "用户只能删除自己对话的消息" ON messages;

-- message_sources 表策略
DROP POLICY IF EXISTS "用户只能查看自己消息的来源" ON message_sources;
DROP POLICY IF EXISTS "用户只能创建自己消息的来源" ON message_sources;

-- categories 表策略
DROP POLICY IF EXISTS "用户只能查看自己的分类" ON categories;
DROP POLICY IF EXISTS "用户只能创建自己的分类" ON categories;
DROP POLICY IF EXISTS "用户只能更新自己的分类" ON categories;
DROP POLICY IF EXISTS "用户只能删除自己的分类" ON categories;
DROP POLICY IF EXISTS "所有用户可以查看系统分类" ON categories;

-- 重新创建优化后的 RLS 策略
-- 使用 SELECT 子查询包装 auth.uid() 避免重复执行

-- user_profiles 表优化策略
CREATE POLICY "用户只能查看自己的配置" ON user_profiles
    FOR SELECT USING ((SELECT auth.uid()) = id);

CREATE POLICY "用户只能更新自己的配置" ON user_profiles
    FOR UPDATE USING ((SELECT auth.uid()) = id);

CREATE POLICY "用户可以插入自己的配置" ON user_profiles
    FOR INSERT WITH CHECK ((SELECT auth.uid()) = id);

-- documents 表优化策略
CREATE POLICY "用户只能查看自己的文档" ON documents
    FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "用户只能创建自己的文档" ON documents
    FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "用户只能更新自己的文档" ON documents
    FOR UPDATE USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "用户只能删除自己的文档" ON documents
    FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- document_chunks 表优化策略
CREATE POLICY "用户只能查看自己文档的块" ON document_chunks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM documents 
            WHERE documents.id = document_chunks.document_id 
            AND documents.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "用户只能创建自己文档的块" ON document_chunks
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM documents 
            WHERE documents.id = document_chunks.document_id 
            AND documents.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "用户只能更新自己文档的块" ON document_chunks
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM documents 
            WHERE documents.id = document_chunks.document_id 
            AND documents.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "用户只能删除自己文档的块" ON document_chunks
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM documents 
            WHERE documents.id = document_chunks.document_id 
            AND documents.user_id = (SELECT auth.uid())
        )
    );

-- conversations 表优化策略
CREATE POLICY "用户只能查看自己的对话" ON conversations
    FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "用户只能创建自己的对话" ON conversations
    FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "用户只能更新自己的对话" ON conversations
    FOR UPDATE USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "用户只能删除自己的对话" ON conversations
    FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- messages 表优化策略
CREATE POLICY "用户只能查看自己对话的消息" ON messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM conversations 
            WHERE conversations.id = messages.conversation_id 
            AND conversations.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "用户只能创建自己对话的消息" ON messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM conversations 
            WHERE conversations.id = messages.conversation_id 
            AND conversations.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "用户只能更新自己对话的消息" ON messages
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM conversations 
            WHERE conversations.id = messages.conversation_id 
            AND conversations.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "用户只能删除自己对话的消息" ON messages
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM conversations 
            WHERE conversations.id = messages.conversation_id 
            AND conversations.user_id = (SELECT auth.uid())
        )
    );

-- message_sources 表优化策略
CREATE POLICY "用户只能查看自己消息的来源" ON message_sources
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM messages 
            JOIN conversations ON conversations.id = messages.conversation_id
            WHERE messages.id = message_sources.message_id 
            AND conversations.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "用户只能创建自己消息的来源" ON message_sources
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM messages 
            JOIN conversations ON conversations.id = messages.conversation_id
            WHERE messages.id = message_sources.message_id 
            AND conversations.user_id = (SELECT auth.uid())
        )
    );

-- categories 表优化策略 - 合并多个许可策略为单一策略
-- 将原来的两个 SELECT 策略合并为一个使用 OR 逻辑的策略
CREATE POLICY "用户可以查看系统分类或自己的分类" ON categories
    FOR SELECT USING (
        (is_system = TRUE AND (SELECT auth.uid()) IS NOT NULL) OR 
        (user_id = (SELECT auth.uid()))
    );

CREATE POLICY "用户只能创建自己的分类" ON categories
    FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "用户只能更新自己的分类" ON categories
    FOR UPDATE USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "用户只能删除自己的分类" ON categories
    FOR DELETE USING ((SELECT auth.uid()) = user_id AND is_system = FALSE);

-- 添加注释说明优化内容
COMMENT ON TABLE user_profiles IS 'RLS 策略已优化：使用 SELECT 子查询包装 auth.uid() 避免重复执行';
COMMENT ON TABLE documents IS 'RLS 策略已优化：使用 SELECT 子查询包装 auth.uid() 避免重复执行';
COMMENT ON TABLE document_chunks IS 'RLS 策略已优化：使用 SELECT 子查询包装 auth.uid() 避免重复执行';
COMMENT ON TABLE conversations IS 'RLS 策略已优化：使用 SELECT 子查询包装 auth.uid() 避免重复执行';
COMMENT ON TABLE messages IS 'RLS 策略已优化：使用 SELECT 子查询包装 auth.uid() 避免重复执行';
COMMENT ON TABLE message_sources IS 'RLS 策略已优化：使用 SELECT 子查询包装 auth.uid() 避免重复执行';
COMMENT ON TABLE categories IS 'RLS 策略已优化：合并多个许可策略为单一策略，使用 SELECT 子查询包装 auth.uid() 避免重复执行';