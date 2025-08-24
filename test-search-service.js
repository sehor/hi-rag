import { searchRelevantChunks, fallbackKeywordSearch } from './api/services/searchService.js';
import { extractKeywords } from './api/services/keywordService.js';

/**
 * 测试搜索服务的各个函数
 */
async function testSearchService() {
  console.log('🔍 开始测试搜索服务...');
  
  const testQueries = [
    '键盘谷',
    '混吃混喝',
    '键盘谷 混吃混喝',
    '修仙门派'
  ];
  
  // 测试用户ID（从之前的日志中获取）
  const userId = 'b8c5c