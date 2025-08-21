import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Upload, FileText, Trash2, Eye, Download, Plus, Search } from 'lucide-react';

/**
 * 文档接口定义
 */
interface Document {
  id: string;
  title: string;
  content?: string;
  file_path?: string;
  file_size: number;
  file_type: string;
  upload_date: string;
  chunk_count: number;
}

/**
 * 知识库管理页面组件
 * 支持文件上传、文本输入和文档管理
 */
const Knowledge: React.FC = () => {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textContent, setTextContent] = useState('');
  const [textTitle, setTextTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * 处理文件拖拽进入
   */
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  /**
   * 处理文件拖拽离开
   */
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  /**
   * 处理文件拖拽悬停
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  /**
   * 处理文件拖拽放下
   */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  }, []);

  /**
   * 处理文件选择
   */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFiles(files);
  };

  /**
   * 处理文件上传
   */
  const handleFiles = async (files: File[]) => {
    if (!files.length || !user) {
      console.log('❌ 上传条件不满足:');
      console.log('- 文件数量:', files.length);
      console.log('- 用户存在:', !!user);
      return;
    }

    console.log('=== 开始文件上传流程 ===');
    console.log('上传时间:', new Date().toISOString());
    console.log('文件数量:', files.length);
    console.log('用户ID:', user.id);

    // 首先测试API连接
    console.log('🔗 测试API连接...');
    try {
      const healthResponse = await fetch('/api/health');
      console.log('健康检查响应状态:', healthResponse.status);
      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        console.log('✅ API连接正常:', healthData);
      } else {
        console.error('❌ API健康检查失败');
        alert('API服务器连接失败，请检查服务器是否运行');
        return;
      }
    } catch (healthError) {
      console.error('💥 API连接测试失败:', healthError);
      alert('无法连接到API服务器，请检查服务器是否运行');
      return;
    }

    setIsUploading(true);
    
    try {
      for (const [index, file] of files.entries()) {
        console.log(`\n📁 处理文件 ${index + 1}/${files.length}:`);
        console.log('- 文件名:', file.name);
        console.log('- 文件类型:', file.type);
        console.log('- 文件大小:', file.size, 'bytes');
        console.log('- 最后修改:', new Date(file.lastModified).toISOString());
        
        // 验证文件类型
        const allowedTypes = ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (!allowedTypes.includes(file.type)) {
          console.error('❌ 文件类型不支持:', file.type);
          alert(`不支持的文件类型: ${file.name}`);
          continue;
        }
        console.log('✅ 文件类型验证通过');

        // 验证文件大小 (10MB)
        if (file.size > 10 * 1024 * 1024) {
          console.error('❌ 文件过大:', file.size, 'bytes');
          alert(`文件过大: ${file.name} (最大10MB)`);
          continue;
        }
        console.log('✅ 文件大小验证通过');

        console.log('📦 准备FormData...');
        // 上传文件到后端
        const formData = new FormData();
        const title = file.name.replace(/\.[^/.]+$/, '');
        
        formData.append('file', file);
        formData.append('title', title);
        formData.append('userId', user.id);
        
        console.log('- 标题:', title);
        console.log('- 用户ID:', user.id);
        console.log('✅ FormData准备完成');

        console.log('🚀 发送上传请求到 /api/documents/upload...');
        const uploadStartTime = Date.now();
        
        try {
          const response = await fetch('/api/documents/upload', {
            method: 'POST',
            body: formData
          });
          
          const uploadTime = Date.now() - uploadStartTime;
          console.log('📡 收到响应:');
          console.log('- 状态码:', response.status);
          console.log('- 状态文本:', response.statusText);
          console.log('- 响应时间:', uploadTime, 'ms');
          console.log('- Content-Type:', response.headers.get('content-type'));

          if (!response.ok) {
            console.error('❌ 响应状态不正常');
            
            let errorMessage = '上传失败';
            try {
              const errorData = await response.json();
              console.error('- 错误数据:', errorData);
              errorMessage = errorData.error || errorMessage;
            } catch (parseError) {
              console.error('- 解析错误响应失败:', parseError);
              const errorText = await response.text();
              console.error('- 原始错误响应:', errorText);
            }
            
            throw new Error(errorMessage);
          }

          console.log('✅ 响应状态正常，解析响应数据...');
          const result = await response.json();
          console.log('📄 响应数据:', result);
          
          if (!result.document) {
            console.error('❌ 响应数据格式异常: 缺少document字段');
            throw new Error('服务器响应格式异常');
          }
          
          console.log('✅ 响应数据验证通过');
          console.log('- 文档ID:', result.document.id);
          console.log('- 文档标题:', result.document.title);
          console.log('- 分块数量:', result.document.chunks_count);
          
          // 添加到文档列表
          const newDoc: Document = {
            id: result.document.id,
            title: result.document.title,
            file_path: result.document.file_url, // 修正：API返回的是 file_url
            file_size: result.document.file_size,
            file_type: result.document.file_type,
            upload_date: result.document.created_at,
            chunk_count: result.document.chunks_count
          };
          
          console.log('📝 添加文档到列表:', newDoc);
          setDocuments(prev => {
            const updated = [...prev, newDoc];
            console.log('✅ 文档列表已更新，当前数量:', updated.length);
            return updated;
          });
          
          console.log('🎉 文件上传成功!');
          
        } catch (fetchError) {
          console.error('💥 上传请求异常:');
          console.error('- 错误类型:', fetchError?.constructor?.name || 'Unknown');
          console.error('- 错误消息:', fetchError instanceof Error ? fetchError.message : String(fetchError));
          console.error('- 错误堆栈:', fetchError instanceof Error ? fetchError.stack : 'No stack trace');
          throw fetchError;
        }
      }
      
      console.log('🎊 所有文件上传完成!');
      
    } catch (error) {
      console.error('💥 文件上传流程异常:');
      console.error('- 错误类型:', error?.constructor?.name || 'Unknown');
      console.error('- 错误消息:', error instanceof Error ? error.message : String(error));
      console.error('- 错误堆栈:', error instanceof Error ? error.stack : 'No stack trace');
      
      const errorMessage = error instanceof Error ? error.message : '请重试';
      alert(`文件上传失败: ${errorMessage}`);
    } finally {
      setIsUploading(false);
      console.log('=== 文件上传流程结束 ===\n');
    }
  };

  /**
   * 处理文本内容保存
   */
  const handleTextSave = async () => {
    if (!textTitle.trim() || !textContent.trim() || !user) {
      alert('请填写标题和内容');
      return;
    }

    try {
      const response = await fetch('/api/documents/text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: textTitle,
          content: textContent,
          userId: user.id
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '保存失败');
      }

      const result = await response.json();
      
      // 添加到文档列表
      const newDoc: Document = {
        id: result.document.id,
        title: result.document.title,
        content: textContent,
        file_size: result.document.file_size,
        file_type: result.document.file_type,
        upload_date: result.document.created_at,
        chunk_count: result.document.chunks_count
      };
      
      setDocuments(prev => [...prev, newDoc]);
      setTextTitle('');
      setTextContent('');
      setShowTextInput(false);
    } catch (error) {
      console.error('文本保存失败:', error);
      alert(`文本保存失败: ${error instanceof Error ? error.message : '请重试'}`);
    }
  };

  /**
   * 删除文档
   */
  const handleDeleteDocument = async (docId: string) => {
    if (!confirm('确定要删除这个文档吗？') || !user) return;

    try {
      const response = await fetch(`/api/documents/${docId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: user.id
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '删除失败');
      }

      setDocuments(prev => prev.filter(doc => doc.id !== docId));
    } catch (error) {
      console.error('删除文档失败:', error);
      alert(`删除文档失败: ${error instanceof Error ? error.message : '请重试'}`);
    }
  };

  /**
   * 格式化文件大小
   */
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  /**
   * 获取文件类型图标
   */
  const getFileIcon = (fileType: string) => {
    if (fileType.includes('pdf')) return '📄';
    if (fileType.includes('word')) return '📝';
    if (fileType.includes('text')) return '📃';
    return '📄';
  };

  /**
   * 加载用户文档列表
   */
  const loadDocuments = useCallback(async () => {
    if (!user) return;
    
    try {
      setIsLoading(true);
      const response = await fetch(`/api/documents/list/${user.id}`);
      
      if (!response.ok) {
        throw new Error('获取文档列表失败');
      }
      
      const result = await response.json();
      const docs: Document[] = result.documents.map((doc: any) => ({
        id: doc.id,
        title: doc.title,
        file_path: doc.file_url,
        content: doc.content,
        file_size: doc.file_size,
        file_type: doc.file_type,
        upload_date: doc.created_at,
        chunk_count: doc.chunks_count || 0
      }));
      
      setDocuments(docs);
    } catch (error) {
      console.error('加载文档列表失败:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]); // 修复：只依赖user.id而不是整个user对象

  // 页面加载时获取文档列表
  useEffect(() => {
    if (user?.id) {
      loadDocuments();
    }
  }, [user?.id]); // 修复：直接依赖user.id，避免依赖函数

  // 过滤文档
  const filteredDocuments = documents.filter(doc =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* 页面标题 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">知识库管理</h1>
          <p className="text-gray-600 mt-2">上传文档或输入文本，构建您的智能知识库</p>
          
          {/* API测试按钮 */}
          <div className="mt-4">
            <button
              onClick={testApiConnection}
              className="bg-yellow-500 text-white px-4 py-2 rounded-lg hover:bg-yellow-600 text-sm"
            >
              🔗 测试API连接
            </button>
          </div>
        </div>

        {/* 上传区域 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* 文件上传 */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">上传文档</h3>
            <p className="text-gray-600 mb-4">
              拖拽文件到此处，或点击选择文件
            </p>
            <p className="text-sm text-gray-500 mb-4">
              支持 PDF, Word, TXT 格式，最大 10MB
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? '上传中...' : '选择文件'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.txt,.doc,.docx"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* 文本输入 */}
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8">
            <Plus className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2 text-center">输入文本</h3>
            <p className="text-gray-600 mb-4 text-center">
              直接输入文本内容创建知识条目
            </p>
            <button
              onClick={() => setShowTextInput(true)}
              className="w-full bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700"
            >
              开始输入
            </button>
          </div>
        </div>

        {/* 文本输入模态框 */}
        {showTextInput && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4">
              <h3 className="text-lg font-semibold mb-4">输入文本内容</h3>
              <input
                type="text"
                placeholder="输入标题"
                value={textTitle}
                onChange={(e) => setTextTitle(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <textarea
                placeholder="输入文本内容..."
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                rows={10}
                className="w-full p-3 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <div className="flex justify-end space-x-4">
                <button
                  onClick={() => setShowTextInput(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  取消
                </button>
                <button
                  onClick={handleTextSave}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 文档列表 */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 sm:mb-0">
                文档列表 ({documents.length})
              </h2>
              <div className="relative">
                <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="搜索文档..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p>加载文档列表中...</p>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {documents.length === 0 ? '还没有上传任何文档' : '没有找到匹配的文档'}
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredDocuments.map((doc) => (
                <div key={doc.id} className="p-6 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="text-2xl">{getFileIcon(doc.file_type)}</div>
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">{doc.title}</h3>
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <span>{formatFileSize(doc.file_size)}</span>
                          <span>{new Date(doc.upload_date).toLocaleDateString()}</span>
                          <span>{doc.chunk_count} 个片段</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button className="p-2 text-gray-400 hover:text-blue-600">
                        <Eye className="w-5 h-5" />
                      </button>
                      <button className="p-2 text-gray-400 hover:text-green-600">
                        <Download className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDeleteDocument(doc.id)}
                        className="p-2 text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Knowledge;


  /**
   * 测试API连接
   */
  const testApiConnection = async () => {
    console.log('🔗 开始API连接测试...');
    
    try {
      // 测试健康检查端点
      console.log('📡 测试健康检查端点: /api/health');
      const healthResponse = await fetch('/api/health');
      console.log('健康检查响应:', {
        status: healthResponse.status,
        statusText: healthResponse.statusText,
        headers: Object.fromEntries(healthResponse.headers.entries())
      });
      
      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        console.log('✅ 健康检查成功:', healthData);
        alert('API连接正常！');
      } else {
        console.error('❌ 健康检查失败');
        alert(`API健康检查失败: ${healthResponse.status} ${healthResponse.statusText}`);
      }
    } catch (error) {
      console.error('💥 API连接测试失败:', error);
      alert(`API连接失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };