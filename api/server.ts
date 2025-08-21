/**
 * Express 服务器启动文件 - 主入口
 */
import app from './app.js';
import { createServer } from 'http';



/**
 * 启动服务器 - 重启
 */
function startServer() {
const port = parseInt(process.env.PORT || '3001');
  
  const server = app.listen(port, () => {
    console.log(`Server ready on port ${port}`);
  });
  
  server.on('error', (error: any) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Please free the port or use a different one.`);
    } else {
      console.error('Failed to start server:', error);
    }
    process.exit(1);
  });
  
  return server;
}

const server = startServer();

/**
 * 优雅关闭服务器
 */
async function gracefulShutdown(signal: string) {
  console.log(`${signal} signal received, starting graceful shutdown...`);
  
  // 设置超时机制，强制退出
  const timeout = setTimeout(() => {
    console.log('Force shutdown due to timeout');
    process.exit(1);
  }, 10000); // 10秒超时
  
  try {
    // 停止接受新连接
    console.log('Stopping server from accepting new connections...');
    server.closeAllConnections?.();
    
    // 清理资源
    console.log('Cleaning up resources...');
    await cleanupResources();
    
    // 关闭服务器
    server.close((err) => {
      clearTimeout(timeout);
      if (err) {
        console.error('Error during server shutdown:', err);
        process.exit(1);
      }
      console.log('Server closed successfully');
      process.exit(0);
    });
  } catch (error) {
    clearTimeout(timeout);
    console.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
}

/**
 * 清理应用资源
 */
async function cleanupResources() {
  try {
    // 清理数据库连接
    console.log('Cleaning up database connections...');
    // Supabase客户端会自动处理连接清理，无需手动关闭
    
    // 清理其他可能的资源
    console.log('Cleaning up other resources...');
    // 如果有其他需要清理的资源（如Redis连接、文件句柄等），在这里添加
    
    console.log('Resource cleanup completed');
  } catch (error) {
    console.error('Error during resource cleanup:', error);
    throw error;
  }
}

/**
 * 处理进程信号
 */
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 处理未捕获的异常
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

export default app;

