/**
 * 关键词搜索效果测试
 * 测试关键词提取和搜索结果质量，不涉及大模型调用
 */

// 本地关键词提取函数（简化版本）
function extractKeywordsLocal(text) {
  // 简单的中英文分词
  const keywords = [];
  
  // 提取英文单词
  const englishWords = text.match(/[a-zA-Z]+/g) || [];
  keywords.push(...englishWords.filter(word => word.length > 2));
  
  // 提取中文词汇（简单的2-4字词组合）
  const chineseText = text.replace(/[^\u4e00-\u9fa5]/g, '');
  for (let i = 0; i < chineseText.length; i++) {
    // 提取2字词
    if (i + 1 < chineseText.length) {
      keywords.push(chineseText.substring(i, i + 2));
    }
    // 提取3字词
    if (i + 2 < chineseText.length) {
      keywords.push(chineseText.substring(i, i + 3));
    }
    // 提取4字词
    if (i + 3 < chineseText.length) {
      keywords.push(chineseText.substring(i, i + 4));
    }
  }
  
  // 停用词过滤
  const stopWords = new Set(['的是', '是在', '在有', '有和', '和与', '与或', '或但', '如何', '什么', '怎么', '进行', '使用', '可以']);
  const filteredKeywords = keywords.filter(word => !stopWords.has(word) && word.length > 1);
  
  // 去重并返回前8个关键词
  return [...new Set(filteredKeywords)].slice(0, 8);
}

// 验证关键词匹配函数
function validateKeywordMatch(content, keywords) {
  const contentLower = content.toLowerCase();
  return keywords.some(keyword => contentLower.includes(keyword.toLowerCase()));
}

// 计算关键词匹配分数函数
function calculateKeywordMatchScore(content, keywords) {
  const contentLower = content.toLowerCase();
  let matchCount = 0;
  
  for (const keyword of keywords) {
    if (contentLower.includes(keyword.toLowerCase())) {
      matchCount++;
    }
  }
  
  return keywords.length > 0 ? matchCount / keywords.length : 0;
}

/**
 * 测试用例数据
 */
const testCases = [
  {
    id: 1,
    query: "React组件生命周期",
    expectedKeywords: ["React", "组件", "生命周期"],
    description: "技术概念查询"
  },
  {
    id: 2,
    query: "如何使用Python进行数据分析",
    expectedKeywords: ["Python", "数据分析", "数据处理"],
    description: "技术教程查询"
  },
  {
    id: 3,
    query: "机器学习算法原理",
    expectedKeywords: ["机器学习", "算法", "原理"],
    description: "学术概念查询"
  },
  {
    id: 4,
    query: "前端开发最佳实践",
    expectedKeywords: ["前端", "开发", "实践"],
    description: "实践经验查询"
  },
  {
    id: 5,
    query: "数据库设计规范",
    expectedKeywords: ["数据库", "设计", "规范"],
    description: "规范标准查询"
  }
];

/**
 * 模拟文档数据（用于测试搜索匹配）
 */
const mockDocuments = [
  {
    id: "doc1",
    content: "React是一个用于构建用户界面的JavaScript库。React组件具有完整的生命周期，包括挂载、更新和卸载阶段。每个阶段都有对应的生命周期方法。",
    title: "React组件生命周期详解"
  },
  {
    id: "doc2",
    content: "Python是一种强大的编程语言，特别适合数据分析。使用pandas、numpy等库可以高效地进行数据处理和统计分析。",
    title: "Python数据分析入门"
  },
  {
    id: "doc3",
    content: "机器学习是人工智能的一个分支，通过算法让计算机从数据中学习。常见的机器学习算法包括线性回归、决策树、神经网络等。",
    title: "机器学习算法概述"
  },
  {
    id: "doc4",
    content: "前端开发需要遵循一些最佳实践，包括代码规范、性能优化、用户体验设计等。良好的开发习惯能提高代码质量。",
    title: "前端开发指南"
  },
  {
    id: "doc5",
    content: "数据库设计需要遵循规范化原则，合理设计表结构和索引。好的数据库设计能提高查询性能和数据一致性。",
    title: "数据库设计原则"
  }
];

/**
 * 评估关键词提取质量
 * @param {string[]} extractedKeywords 提取的关键词
 * @param {string[]} expectedKeywords 期望的关键词
 * @returns {Object} 评估结果
 */
function evaluateKeywordExtraction(extractedKeywords, expectedKeywords) {
  const extracted = new Set(extractedKeywords.map(k => k.toLowerCase()));
  const expected = new Set(expectedKeywords.map(k => k.toLowerCase()));
  
  // 计算精确率和召回率
  const intersection = new Set([...extracted].filter(k => expected.has(k)));
  const precision = extracted.size > 0 ? intersection.size / extracted.size : 0;
  const recall = expected.size > 0 ? intersection.size / expected.size : 0;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  
  return {
    precision: precision * 100,
    recall: recall * 100,
    f1Score: f1Score * 100,
    matchedKeywords: [...intersection],
    extractedCount: extracted.size,
    expectedCount: expected.size
  };
}

/**
 * 评估搜索匹配质量
 * @param {string[]} keywords 关键词列表
 * @param {Object[]} documents 文档列表
 * @returns {Object} 搜索结果评估
 */
function evaluateSearchMatching(keywords, documents) {
  const results = [];
  
  for (const doc of documents) {
    const isMatch = validateKeywordMatch(doc.content, keywords);
    const matchScore = calculateKeywordMatchScore(doc.content, keywords);
    
    if (isMatch) {
      results.push({
        docId: doc.id,
        title: doc.title,
        matchScore: matchScore,
        matchedKeywords: keywords.filter(keyword => 
          doc.content.toLowerCase().includes(keyword.toLowerCase())
        )
      });
    }
  }
  
  // 按匹配分数排序
  results.sort((a, b) => b.matchScore - a.matchScore);
  
  return {
    totalMatches: results.length,
    results: results,
    averageScore: results.length > 0 ? 
      results.reduce((sum, r) => sum + r.matchScore, 0) / results.length : 0
  };
}

/**
 * 运行关键词搜索测试
 */
async function runKeywordSearchTests() {
  console.log('🔍 开始关键词搜索效果测试\n');
  console.log('='.repeat(60));
  
  let totalTests = 0;
  let passedTests = 0;
  const detailedResults = [];
  
  for (const testCase of testCases) {
    totalTests++;
    console.log(`\n📋 测试用例 ${testCase.id}: ${testCase.description}`);
    console.log(`查询: "${testCase.query}"`);
    console.log(`期望关键词: [${testCase.expectedKeywords.join(', ')}]`);
    
    try {
      // 1. 测试关键词提取
      const extractedKeywords = extractKeywordsLocal(testCase.query);
      console.log(`提取关键词: [${extractedKeywords.join(', ')}]`);
      
      // 2. 评估关键词提取质量
      const extractionEval = evaluateKeywordExtraction(extractedKeywords, testCase.expectedKeywords);
      console.log(`\n📊 关键词提取评估:`);
      console.log(`  - 精确率: ${extractionEval.precision.toFixed(1)}%`);
      console.log(`  - 召回率: ${extractionEval.recall.toFixed(1)}%`);
      console.log(`  - F1分数: ${extractionEval.f1Score.toFixed(1)}%`);
      console.log(`  - 匹配关键词: [${extractionEval.matchedKeywords.join(', ')}]`);
      
      // 3. 测试搜索匹配
      const searchEval = evaluateSearchMatching(extractedKeywords, mockDocuments);
      console.log(`\n🔍 搜索匹配评估:`);
      console.log(`  - 匹配文档数: ${searchEval.totalMatches}`);
      console.log(`  - 平均匹配分数: ${(searchEval.averageScore * 100).toFixed(1)}%`);
      
      if (searchEval.results.length > 0) {
        console.log(`  - 最佳匹配: ${searchEval.results[0].title} (分数: ${(searchEval.results[0].matchScore * 100).toFixed(1)}%)`);
      }
      
      // 4. 判断测试是否通过
      const testPassed = extractionEval.f1Score >= 50 && searchEval.totalMatches > 0;
      if (testPassed) {
        passedTests++;
        console.log(`\n✅ 测试通过`);
      } else {
        console.log(`\n❌ 测试失败`);
      }
      
      // 保存详细结果
      detailedResults.push({
        testCase,
        extractedKeywords,
        extractionEval,
        searchEval,
        passed: testPassed
      });
      
    } catch (error) {
      console.error(`❌ 测试执行失败:`, error.message);
      detailedResults.push({
        testCase,
        error: error.message,
        passed: false
      });
    }
    
    console.log('\n' + '-'.repeat(50));
  }
  
  // 输出总结
  console.log(`\n📈 测试总结`);
  console.log('='.repeat(60));
  console.log(`总测试数: ${totalTests}`);
  console.log(`通过测试: ${passedTests}`);
  console.log(`失败测试: ${totalTests - passedTests}`);
  console.log(`通过率: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  
  // 计算平均指标
  const validResults = detailedResults.filter(r => !r.error);
  if (validResults.length > 0) {
    const avgPrecision = validResults.reduce((sum, r) => sum + r.extractionEval.precision, 0) / validResults.length;
    const avgRecall = validResults.reduce((sum, r) => sum + r.extractionEval.recall, 0) / validResults.length;
    const avgF1 = validResults.reduce((sum, r) => sum + r.extractionEval.f1Score, 0) / validResults.length;
    const avgSearchScore = validResults.reduce((sum, r) => sum + (r.searchEval.averageScore * 100), 0) / validResults.length;
    
    console.log(`\n📊 平均性能指标:`);
    console.log(`  - 平均精确率: ${avgPrecision.toFixed(1)}%`);
    console.log(`  - 平均召回率: ${avgRecall.toFixed(1)}%`);
    console.log(`  - 平均F1分数: ${avgF1.toFixed(1)}%`);
    console.log(`  - 平均搜索分数: ${avgSearchScore.toFixed(1)}%`);
  }
  
  return {
    totalTests,
    passedTests,
    passRate: (passedTests / totalTests) * 100,
    detailedResults
  };
}

/**
 * 测试数据库搜索性能（可选）
 * 通过searchService调用，不直接操作数据库
 */
async function testDatabaseSearchPerformance() {
  console.log('\n🚀 数据库搜索性能测试');
  console.log('='.repeat(60));
  
  // 动态导入搜索服务，避免不运行该测试时加载环境
  const { fallbackKeywordSearch } = await import('./api/services/searchService.ts');

  const testQueries = [
    "React 组件 生命周期",
    "Python 数据分析",
    "机器学习 算法"
  ];
  
  for (const query of testQueries) {
    console.log(`\n测试查询: "${query}"`);
    
    try {
      const startTime = Date.now();
      
      // 通过搜索服务调用（不直接操作数据库）
      const results = await fallbackKeywordSearch(
        query,
        '00000000-0000-0000-0000-000000000000', // 测试用户ID
        5
      );
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`✅ 搜索成功`);
      console.log(`  - 结果数量: ${results?.length || 0}`);
      console.log(`  - 查询时间: ${duration}ms`);
      
      if (results && results.length > 0) {
        const top = results[0];
        const relevance = typeof top.relevance_score === 'number' ? top.relevance_score.toFixed(4) : 'N/A';
        const keywordScore = typeof top.keyword_score === 'number' ? top.keyword_score : 'N/A';
        console.log(`  - 最高相关性: ${relevance}`);
        console.log(`  - 最高关键词分数: ${keywordScore}`);
      }
    } catch (error) {
      console.error(`❌ 搜索失败:`, error.message);
    }
  }
}

/**
 * 主函数
 */
async function main() {
  try {
    // 运行关键词搜索测试
    const results = await runKeywordSearchTests();
    
    // 可选：测试数据库搜索性能
    // await testDatabaseSearchPerformance();
    
    console.log('\n🎉 测试完成！');
    
    // 如果通过率低于80%，退出码为1
    if (results.passRate < 80) {
      console.log('⚠️ 警告: 测试通过率低于80%，需要优化关键词提取算法');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('💥 测试执行失败:', error);
    process.exit(1);
  }
}

// 运行测试 - 修复执行条件
if (import.meta.url.includes('test-keyword-search.js')) {
  main();
}

export {
  runKeywordSearchTests,
  evaluateKeywordExtraction,
  evaluateSearchMatching,
  testDatabaseSearchPerformance
};