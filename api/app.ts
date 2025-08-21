/**
 * This is a API server
 */

import express, { type Request, type Response, type NextFunction }  from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import documentsRoutes from './routes/documents.js';
import chatRoutes from './routes/chat.js';

// for esm mode
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// load env
dotenv.config();

console.log('🚀 初始化Express应用...');
const app: express.Application = express();

console.log('⚙️ 配置中间件...');
app.use(cors());

// 设置正确的字符编码处理
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 添加编码处理中间件
app.use((req: Request, res: Response, next: NextFunction) => {
  // 设置响应头确保UTF-8编码
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  
  // 处理请求中的编码问题
  if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
    // 对于文件上传请求，确保正确处理编码
    // 对于 multipart/form-data 请求，我们不需要设置编码，因为它会由 multer 等中间件处理
    if (!req.setEncoding) {
      req.setEncoding = (encoding: BufferEncoding) => req;
    }
  }
  
  next();
});

console.log('✅ 中间件配置完成');

/**
 * API Routes
 */
console.log('📋 注册API路由...');
app.use('/api/auth', authRoutes);
console.log('✅ 认证路由已注册: /api/auth');

app.use('/api/documents', documentsRoutes);
console.log('✅ 文档路由已注册: /api/documents');

app.use('/api/chat', chatRoutes);
console.log('✅ 聊天路由已注册: /api/chat');

/**
 * health
 */
app.use('/api/health', (req: Request, res: Response, next: NextFunction): void => {
  console.log('💓 健康检查请求:', req.method, req.url);
  res.status(200).json({
    success: true,
    message: 'ok'
  });
});
console.log('✅ 健康检查路由已注册: /api/health');

/**
 * error handler middleware
 */
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('💥 服务器错误:');
  console.error('- 请求路径:', req.method, req.url);
  console.error('- 错误类型:', error?.constructor?.name || 'Unknown');
  console.error('- 错误消息:', error.message);
  console.error('- 错误堆栈:', error.stack);
  
  res.status(500).json({
    success: false,
    error: 'Server internal error'
  });
});

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  console.log('❌ 404 - API未找到:', req.method, req.url);
  res.status(404).json({
    success: false,
    error: 'API not found'
  });
});

console.log('🎯 Express应用初始化完成');

export default app;