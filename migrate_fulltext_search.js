import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 创建 Supabase 管理员客户端
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * 执行全文搜索迁移
 */
async function migrateFulltextSearch() {
  try {
    console.log('🔄 开始执行全文搜索迁移...');
    
    // 1. 创建 multilingual 文本搜索配置
    console.log('\n📝 创建 multilingual 文本搜索配置...');
    const createConfigSQL = `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'multilingual') THEN
          CREATE TEXT SEARCH CONFIGURATION multilingual ( COPY = simple );
          RAISE NOTICE 'Created multilingual text search configuration';
        ELSE
          RAISE NOTICE 'multilingual text search configuration already exists';
        END IF;
      END
      $$;
    `;
    
    const { error: configError } = await supabaseAdmin.from('pg_ts_config').select('cfgname').eq('cfgname', 'multilingual').single();
    
    if (configError && configError.code === 'PGRST116') {
      // 配置不存在，需要创建
      console.log('⚠️  multilingual 配置不存在，需要手动在 Supabase SQL 编辑器中执行以下 SQL:');
      console.log('CREATE TEXT SEARCH CONFIGURATION multilingual ( COPY = simple );');
      console.log('请在 Supabase Dashboard 的 SQL 编辑器中执行上述 SQL，然后重新运行此脚本。');
      return;
    } else if (!configError) {
      console.log('✅ multilingual 配置已存在');
    }
    
    // 2. 为 document_chunks 表添加搜索向量列
    console.log('\n📝 添加搜索向量列...');
    const addColumnsSQL = `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'document_chunks' AND column_name = 'search_vector_simple') THEN
          ALTER TABLE document_chunks ADD COLUMN search_vector_simple tsvector;
          RAISE NOTICE 'Added search_vector_simple column';
        ELSE
          RAISE NOTICE 'search_vector_simple column already exists';
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'document_chunks' AND column_name = 'search_vector_english') THEN
          ALTER TABLE document_chunks ADD COLUMN search_vector_english tsvector;
          RAISE NOTICE 'Added search_vector_english column';
        ELSE
          RAISE NOTICE 'search_vector_english column already exists';
        END IF;
      END
      $$;
    `;
    
    // 检查列是否存在
    const { data: columns } = await supabaseAdmin
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'document_chunks')
      .in('column_name', ['search_vector_simple', 'search_vector_english']);
    
    const hasSimple = columns?.some(col => col.column_name === 'search_vector_simple');
    const hasEnglish = columns?.some(col => col.column_name === 'search_vector_english');
    
    if (!hasSimple || !hasEnglish) {
      console.log('⚠️  需要添加搜索向量列，请在 Supabase SQL 编辑器中执行以下 SQL:');
      if (!hasSimple) {
        console.log('ALTER TABLE document_chunks ADD COLUMN search_vector_simple tsvector;');
      }
      if (!hasEnglish) {
        console.log('ALTER TABLE document_chunks ADD COLUMN search_vector_english tsvector;');
      }
      console.log('请在 Supabase Dashboard 的 SQL 编辑器中执行上述 SQL，然后重新运行此脚本。');
      return;
    }
    
    console.log('✅ 搜索向量列检查完成');
    
    // 3. 创建生成多语言搜索向量的函数
    console.log('\n📝 创建生成搜索向量函数...');
    const createFunctionSQL = `
      CREATE OR REPLACE FUNCTION generate_multilingual_search_vectors(content_text text)
      RETURNS TABLE(simple_vector tsvector, english_vector tsvector)
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RETURN QUERY SELECT
          to_tsvector('multilingual', content_text) as simple_vector,
          to_tsvector('english', content_text) as english_vector;
      END;
      $$;
    `;
    
    // 检查函数是否存在
    const { data: functions } = await supabaseAdmin
      .from('information_schema.routines')
      .select('routine_name')
      .eq('routine_name', 'generate_multilingual_search_vectors');
    
    if (!functions || functions.length === 0) {
      console.log('⚠️  需要创建搜索向量函数，请在 Supabase SQL 编辑器中执行以下 SQL:');
      console.log(createFunctionSQL);
      console.log('请在 Supabase Dashboard 的 SQL 编辑器中执行上述 SQL，然后重新运行此脚本。');
      return;
    }
    
    console.log('✅ 搜索向量函数检查完成');
    
    // 4. 为现有记录生成搜索向量
    console.log('\n📝 为现有记录生成搜索向量...');
    const updateVectorsSQL = `
      UPDATE document_chunks 
      SET 
        search_vector_simple = to_tsvector('multilingual', content),
        search_vector_english = to_tsvector('english', content)
      WHERE content IS NOT NULL;
    `;
    
    // 使用 Supabase 客户端更新记录
    const { data: chunks } = await supabaseAdmin
      .from('document_chunks')
      .select('id, content')
      .not('content', 'is', null)
      .limit(1000); // 分批处理
    
    if (chunks && chunks.length > 0) {
      console.log(`找到 ${chunks.length} 条记录需要更新搜索向量...`);
      
      for (const chunk of chunks) {
        const { error: updateError } = await supabaseAdmin
          .from('document_chunks')
          .update({
            search_vector_simple: chunk.content, // Supabase 会自动转换为 tsvector
            search_vector_english: chunk.content
          })
          .eq('id', chunk.id);
        
        if (updateError) {
          console.error(`❌ 更新记录 ${chunk.id} 失败:`, updateError);
          return;
        }
      }
    }
    
    console.log('✅ 现有记录搜索向量更新完成');
    
    // 5. 创建触发器
    console.log('\n📝 创建触发器...');
    const createTriggerSQL = `
      CREATE OR REPLACE FUNCTION update_multilingual_search_vectors()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        NEW.search_vector_simple := to_tsvector('multilingual', NEW.content);
        NEW.search_vector_english := to_tsvector('english', NEW.content);
        RETURN NEW;
      END;
      $$;
      
      DROP TRIGGER IF EXISTS update_multilingual_search_vectors_trigger ON document_chunks;
      
      CREATE TRIGGER update_multilingual_search_vectors_trigger
        BEFORE INSERT OR UPDATE OF content ON document_chunks
        FOR EACH ROW
        EXECUTE FUNCTION update_multilingual_search_vectors();
    `;
    
    console.log('⚠️  需要创建触发器，请在 Supabase SQL 编辑器中执行以下 SQL:');
    console.log(createTriggerSQL);
    
    console.log('✅ 触发器 SQL 已显示');
    
    // 6. 创建索引
    console.log('\n📝 创建搜索索引...');
    const createIndexSQL = `
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_chunks_search_vector_simple 
      ON document_chunks USING gin(search_vector_simple);
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_chunks_search_vector_english 
      ON document_chunks USING gin(search_vector_english);
    `;
    
    console.log('⚠️  需要创建索引，请在 Supabase SQL 编辑器中执行以下 SQL:');
    console.log(createIndexSQL);
    
    console.log('✅ 索引 SQL 已显示');
    
    // 7. 创建多语言搜索函数
    console.log('\n📝 创建多语言搜索函数...');
    const createSearchFunctionSQL = `
      CREATE OR REPLACE FUNCTION search_multilingual(
        query_text text,
        match_threshold float DEFAULT 0.1,
        match_count int DEFAULT 50
      )
      RETURNS TABLE(
        id uuid,
        content text,
        document_id uuid,
        chunk_index int,
        similarity float
      )
      LANGUAGE plpgsql
      AS $$
      DECLARE
        query_vector_simple tsvector;
        query_vector_english tsvector;
      BEGIN
        -- 生成查询向量
        query_vector_simple := to_tsquery('multilingual', query_text);
        query_vector_english := to_tsquery('english', query_text);
        
        RETURN QUERY
        SELECT 
          dc.id,
          dc.content,
          dc.document_id,
          dc.chunk_index,
          GREATEST(
            ts_rank(dc.search_vector_simple, query_vector_simple),
            ts_rank(dc.search_vector_english, query_vector_english)
          ) as similarity
        FROM document_chunks dc
        WHERE 
          (dc.search_vector_simple @@ query_vector_simple OR 
           dc.search_vector_english @@ query_vector_english)
          AND GREATEST(
            ts_rank(dc.search_vector_simple, query_vector_simple),
            ts_rank(dc.search_vector_english, query_vector_english)
          ) > match_threshold
        ORDER BY similarity DESC
        LIMIT match_count;
      END;
      $$;
    `;
    
    console.log('⚠️  需要创建搜索函数，请在 Supabase SQL 编辑器中执行以下 SQL:');
    console.log(createSearchFunctionSQL);
    
    console.log('✅ 搜索函数 SQL 已显示');
    
    console.log('\n🎉 全文搜索迁移完成！现在可以使用关键词搜索功能了。');
    
  } catch (error) {
    console.error('❌ 执行全文搜索迁移时发生错误:', error);
  }
}

// 显示使用说明
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('\n📖 使用说明:');
  console.log('  node migrate_fulltext_search.js     # 执行全文搜索迁移');
  console.log('  node migrate_fulltext_search.js --help  # 显示此帮助信息');
  console.log('\n⚠️  注意: 此脚本会为 document_chunks 表添加全文搜索功能\n');
  process.exit(0);
}

migrateFulltextSearch();