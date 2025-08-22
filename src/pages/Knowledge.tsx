import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Upload, FileText, Trash2, Eye, Download, Plus, Search, FolderPlus } from 'lucide-react';
import { toast } from 'sonner';

/**
 * 分类接口定义
 */
interface Category {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  user_id?: string;
}

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
  category_id?: string;
}

/**
 * 知识库管理页面组件
 * 支持文件上传、文本输入和文档管理
 */
const Knowledge: React.FC = () => {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [textContent, setTextContent] = useState('');
  const [textTitle, setTextTitle] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
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
        if (selectedCategoryId) {
          formData.append('categoryId', selectedCategoryId);
        }
        
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
          userId: user.id,
          categoryId: selectedCategoryId || null
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
   * 加载分类列表
   */
  const loadCategories = useCallback(async () => {
    if (!user) return;
    
    try {
      const response = await fetch(`/api/documents/categories/${user.id}`);
      
      if (!response.ok) {
        throw new Error('获取分类列表失败');
      }
      
      const result = await response.json();
      setCategories(result.categories || []);
    } catch (error) {
      console.error('加载分类列表失败:', error);
    }
  }, [user?.id]);

  /**
   * 加载用户文档列表
   */
  const loadDocuments = useCallback(async () => {
    if (!user) return;
    
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (selectedCategoryId) {
        params.append('categoryId', selectedCategoryId);
      }
      
      const response = await fetch(`/api/documents/list/${user.id}?${params}`);
      
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
        chunk_count: doc.chunks_count || 0,
        category_id: doc.category_id
      }));
      
      setDocuments(docs);
    } catch (error) {
      console.error('加载文档列表失败:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, selectedCategoryId]); // 修复：只依赖user.id而不是整个user对象

  /**
   * 创建新分类
   */
  const createCategory = async () => {
    if (!user || !newCategoryName.trim()) return;
    
    try {
      const response = await fetch('/api/documents/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newCategoryName.trim(),
          description: newCategoryDescription.trim() || null,
          userId: user.id
        })
      });
      
      if (!response.ok) {
        throw new Error('创建分类失败');
      }
      
      // 重新加载分类列表
      await loadCategories();
      
      // 清空表单
      setNewCategoryName('');
      setNewCategoryDescription('');
      setShowCategoryModal(false);
      
      toast.success('分类创建成功');
    } catch (error) {
      console.error('创建分类失败:', error);
      toast.error('创建分类失败');
    }
  };

  /**
   * 删除分类
   */
  const deleteCategory = async (categoryId: string) => {
    if (!user) return;
    
    try {
      const response = await fetch(`/api/documents/categories/${categoryId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('删除分类失败');
      }
      
      // 重新加载分类列表和文档列表
      await loadCategories();
      await loadDocuments();
      
      // 如果删除的是当前选中的分类，清空选择
      if (selectedCategoryId === categoryId) {
        setSelectedCategoryId('');
      }
      
      toast.success('分类删除成功');
    } catch (error) {
      console.error('删除分类失败:', error);
      toast.error('删除分类失败');
    }
  };

  // 页面加载时获取文档列表和分类列表
  useEffect(() => {
    loadDocuments();
    loadCategories();
  }, [loadDocuments, loadCategories]);

  // 当选中分类改变时重新加载文档
  useEffect(() => {
    loadDocuments();
  }, [selectedCategoryId]);

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

        {/* 搜索栏和分类选择器 */}
        <div className="mb-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="搜索文档..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          {/* 分类选择器 */}
          <div className="flex items-center gap-4">
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">所有分类</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            
            <button
              onClick={() => setShowCategoryModal(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              <FolderPlus className="w-4 h-4" />
              管理分类
            </button>
          </div>
        </div>

        {/* 分类管理模态框 */}
        {showCategoryModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
              <h3 className="text-lg font-semibold mb-4">分类管理</h3>
              
              {/* 创建新分类 */}
              <div className="mb-6">
                <h4 className="text-md font-medium mb-2">创建新分类</h4>
                <input
                  type="text"
                  placeholder="分类名称"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg mb-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <textarea
                  placeholder="分类描述（可选）"
                  value={newCategoryDescription}
                  onChange={(e) => setNewCategoryDescription(e.target.value)}
                  rows={2}
                  className="w-full p-3 border border-gray-300 rounded-lg mb-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={createCategory}
                  disabled={!newCategoryName.trim()}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  创建分类
                </button>
              </div>
              
              {/* 现有分类列表 */}
              <div className="mb-4">
                <h4 className="text-md font-medium mb-2">现有分类</h4>
                <div className="max-h-40 overflow-y-auto">
                  {categories.length === 0 ? (
                    <p className="text-gray-500 text-sm">暂无分类</p>
                  ) : (
                    categories.map((category) => (
                      <div key={category.id} className="flex items-center justify-between p-2 border border-gray-200 rounded mb-2">
                        <div>
                          <div className="font-medium">{category.name}</div>
                          {category.description && (
                            <div className="text-sm text-gray-500">{category.description}</div>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            if (confirm(`确定要删除分类 "${category.name}" 吗？`)) {
                              deleteCategory(category.id);
                            }
                          }}
                          className="text-red-600 hover:text-red-800 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
              
              <div className="flex justify-end">
                <button
                  onClick={() => setShowCategoryModal(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  关闭
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
                文档列表 ({filteredDocuments.length})
              </h2>
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
                        <div className="flex items-center space-x-4 text-sm text-gray-500 mb-1">
                          <span>{formatFileSize(doc.file_size)}</span>
                          <span>{new Date(doc.upload_date).toLocaleDateString()}</span>
                          <span>{doc.chunk_count} 个片段</span>
                        </div>
                        {doc.category_id && (
                          <div className="text-sm">
                            <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                              {categories.find(cat => cat.id === doc.category_id)?.name || '未知分类'}
                            </span>
                          </div>
                        )}
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

      {/* 分类管理模态框 */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">管理分类</h3>
            
            {/* 创建新分类 */}
            <div className="mb-6">
              <h4 className="text-md font-medium mb-3">创建新分类</h4>
              <input
                type="text"
                placeholder="分类名称"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded mb-2"
              />
              <textarea
                placeholder="分类描述（可选）"
                value={newCategoryDescription}
                onChange={(e) => setNewCategoryDescription(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded mb-3 h-20 resize-none"
              />
              <button
                onClick={createCategory}
                disabled={!newCategoryName.trim()}
                className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                创建分类
              </button>
            </div>

            {/* 现有分类列表 */}
            <div className="mb-6">
              <h4 className="text-md font-medium mb-3">现有分类</h4>
              <div className="max-h-40 overflow-y-auto">
                {categories.length === 0 ? (
                  <p className="text-gray-500 text-sm">暂无分类</p>
                ) : (
                  categories.map((category) => (
                    <div key={category.id} className="flex items-center justify-between p-2 border border-gray-200 rounded mb-2">
                      <div className="flex-1">
                        <div className="font-medium">{category.name}</div>
                        {category.description && (
                          <div className="text-sm text-gray-600">{category.description}</div>
                        )}
                      </div>
                      <button
                        onClick={() => deleteCategory(category.id)}
                        className="text-red-500 hover:text-red-700 p-1"
                        title="删除分类"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 关闭按钮 */}
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setShowCategoryModal(false);
                  setNewCategoryName('');
                  setNewCategoryDescription('');
                }}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
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