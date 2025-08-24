import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

/**
 * 检查数据库中的用户ID格式
 */
async function checkUserIds() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('=== 检查用户ID格式 ===\n');

  try {
    // 查看用户表
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email')
      .limit(5);
    
    if (usersError) {
      console.error('❌ 查询用户表失败:', usersError.message);
    } else if (users && users.length > 0) {
      console.log('👥 用户表中的用户ID格式:');
      users.forEach((user, index) => {
        console.log(`${index + 1}. ID: ${user.id} (${typeof user.id}) - Email: ${user.email}`);
      });
    } else {
      console.log('📭 用户表中没有数据');
    }
    
    // 查看文档表中的user_id
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, title, user_id')
      .limit(5);
    
    if (docsError) {
      console.error('❌ 查询文档表失败:', docsError.message);
    } else if (documents && documents.length > 0) {
      console.log('\n📚 文档表中的user_id格式:');
      documents.forEach((doc, index) => {
        console.log(`${index + 1}. 文档ID: ${doc.id} - 标题: ${doc.title} - 用户ID: ${doc.user_id} (${typeof doc.user_id})`);
      });
    } else {
      console.log('\n📭 文档表中没有数据');
    }
    
  } catch (error) {
    console.error('💥 检查失败:', error.message);
  }
}

// 运行检查
checkUserIds().catch(console.error);