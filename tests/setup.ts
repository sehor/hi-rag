// Jest 测试环境设置
import '@testing-library/jest-dom';

// 设置环境变量
process.env.NODE_ENV = 'test';
process.env.OPENROUTER_API_KEY = 'test-api-key';
process.env.OPENROUTER_URL = 'https://openrouter.ai/api/v1';
process.env.SITE_URL = 'http://localhost:3000';
process.env.SITE_NAME = 'Hi-RAG Test';

// 设置全局测试超时时间
jest.setTimeout(30000);

// 测试套件开始前的设置
beforeAll(() => {
  console.log('开始运行测试套件');
});

afterAll(() => {
  console.log('测试套件运行完成');
});