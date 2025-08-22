import { supabaseAdmin } from './api/lib/supabase.js';

/**
 * 检查数据库中的文档和文档块数据
 */
async function checkDatabaseData() {
  try {
    console.log('🔍 开始检查数据库数据...');
    
    // 检查documents表
    const { data: documents, error: docsError } = await supabaseAdmin
      .from('documents')
      .select('id, title, user_id, created_at')
      .limit(10);
    
    if (docsError) {
      console.error('❌ 查询documents表失败:', docsError);
      return;
    }
    
    console.log(`📄 documents表中有 ${documents?.length || 0} 条记录`);
    if (documents && documents.length > 0) {
      console.log('前几条文档记录:');
      documents.forEach((doc, index) => {
        console.log(`  ${index + 1}. ${doc.title} (ID: ${doc.id})`);
      });
    }
    
    // 检查document_chunks表
    const { data: chunks, error: chunksError } = await supabaseAdmin
      .from('document_chunks')
      .select('id, document_id, chunk_index, embedding')
      .limit(10);
    
    if (chunksError) {
      console.error('❌ 查询document_chunks表失败:', chunksError);
      return;
    }
    
    console.log(`📝 document_chunks表中有 ${chunks?.length || 0} 条记录`);
    
    // 检查有向量的文档块数量
    const { count: embeddingCount, error: countError } = await supabaseAdmin
      .from('document_chunks')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);
    
    if (countError) {
      console.error('❌ 统计向量数据失败:', countError);
    } else {
      console.log(`🎯 有向量数据的文档块: ${embeddingCount || 0} 条`);
    }
    
    // 检查用户数据
    const { data: users, error: usersError } = await supabaseAdmin
      .from('user_profiles')
      .select('id, email')
      .limit(5);
    
    if (usersError) {
      console.error('❌ 查询用户数据失败:', usersError);
    } else {
      console.log(`👥 用户数量: ${users?.length || 0}`);
      if (users && users.length > 0) {
        console.log('用户列表:');
        users.forEach((user, index) => {
          console.log(`  ${index + 1}. ${user.email} (ID: ${user.id})`);
        });
      }
    }
    
    // 测试向量搜索函数
    console.log('\n🧪 测试向量搜索函数...');
    if (users && users.length > 0) {
      const testUserId = users[0].id;
      const testEmbedding = new Array(768).fill(0.1); // 创建测试向量
      
      const { data: searchResult, error: searchError } = await supabaseAdmin
        .rpc('search_similar_chunks', {
          query_embedding: testEmbedding,
          target_user_id: testUserId,
          match_threshold: 0.1,
          match_count: 5
        });
      
      if (searchError) {
        console.error('❌ 向量搜索测试失败:', searchError);
      } else {
        console.log(`✅ 向量搜索测试成功，返回 ${searchResult?.length || 0} 条结果`);
      }
    }
    
  } catch (error) {
    console.error('❌ 检查数据库数据时发生错误:', error);
  }
}

checkDatabaseData();