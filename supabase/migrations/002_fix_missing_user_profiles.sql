-- 为现有用户创建缺失的user_profiles记录
-- 这个迁移解决了用户注册到auth.users但没有对应user_profiles记录的问题

-- 为所有在auth.users中存在但在user_profiles中不存在的用户创建user_profiles记录
INSERT INTO user_profiles (id, name, created_at, updated_at)
SELECT 
    au.id,
    COALESCE(au.raw_user_meta_data->>'name', split_part(au.email, '@', 1)) as name,
    au.created_at,
    NOW() as updated_at
FROM auth.users au
LEFT JOIN user_profiles up ON au.id = up.id
WHERE up.id IS NULL;

-- 创建触发器函数，在用户注册时自动创建user_profiles记录
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建触发器，在auth.users表插入新记录时自动触发
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();