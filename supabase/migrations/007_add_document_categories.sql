-- 添加文档分类功能
-- 为documents表添加category字段，创建categories表支持自定义分类

-- 创建分类表
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#3B82F6', -- 默认蓝色
    is_system BOOLEAN DEFAULT FALSE, -- 是否为系统预设分类
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, name) -- 同一用户下分类名称唯一
);

-- 为documents表添加category字段
ALTER TABLE documents ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);
CREATE INDEX IF NOT EXISTS idx_documents_category_id ON documents(category_id);

-- 启用categories表的行级安全策略
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- categories表RLS策略
CREATE POLICY "用户只能查看自己的分类" ON categories
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "用户只能创建自己的分类" ON categories
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "用户只能更新自己的分类" ON categories
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "用户只能删除自己的分类" ON categories
    FOR DELETE USING (auth.uid() = user_id AND is_system = FALSE);

-- 为categories表添加更新时间触发器
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 插入系统预设分类（这些分类对所有用户可见）
INSERT INTO categories (id, user_id, name, description, color, is_system) VALUES
    ('00000000-0000-0000-0000-000000000001', NULL, '资讯', '新闻、资讯类文档', '#EF4444', TRUE),
    ('00000000-0000-0000-0000-000000000002', NULL, '学习', '学习资料、教程类文档', '#10B981', TRUE),
    ('00000000-0000-0000-0000-000000000003', NULL, '工作', '工作相关文档', '#F59E0B', TRUE),
    ('00000000-0000-0000-0000-000000000004', NULL, '笔记', '个人笔记、备忘录', '#8B5CF6', TRUE)
ON CONFLICT (user_id, name) DO NOTHING;

-- 更新系统预设分类的RLS策略，允许所有认证用户查看
CREATE POLICY "所有用户可以查看系统分类" ON categories
    FOR SELECT USING (is_system = TRUE AND auth.uid() IS NOT NULL);

-- 授权给anon和authenticated角色
GRANT SELECT, INSERT, UPDATE, DELETE ON categories TO authenticated;
GRANT SELECT ON categories TO anon;