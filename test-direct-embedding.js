/**
 * 直接测试阿里云向量生成服务
 */

import dotenv from 'dotenv';
import { generateEmbedding } from './api/lib/alibaba-embedding.js';

// 加载环境变量
dotenv.config();

async function testDirectEmbedding() {
  console.log('开始测试直接调用阿里云向量生成服务...');
  
  const testTexts = [
    '数据库优化',
    '人工智能技术',
    '咸鱼门的绝技',
    '云计算平台'
  ];
  
  for (let i = 0; i < testTexts.length; i++) {
    const text = testTexts[i];
    console.log(`\n测试文本 ${i + 1}: "${text}"`);
    
    try {
      const startTime = Date.now();
      
      // 直接调用generateEmbedding方法
      const embedding = await generateEmbedding(text);
      
      const endTime = Date.now();
      
      console.log('✅ 向量生成成功:');
      console.log(`  - 向量维度: ${embedding.length}`);
      console.log(`  - 向量前5个值: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
      console.log(`  - 耗时: ${endTime - startTime}ms`);
      
    } catch (error) {
      console.error(`❌ 向量生成失败:`, error.message);
    }
  }
  
  console.log('\n测试完成!');
}

// 运行测试
testDirectEmbedding().catch(console.error);