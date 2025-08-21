import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Send, Bot, User, History, Trash2, Plus, FileText } from 'lucide-react';

/**
 * 消息接口定义
 */
interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
  sources?: string[];
}

/**
 * 对话接口定义
 */
interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

/**
 * AI问答页面组件
 * 包含对话界面、历史记录和消息管理
 */
const Chat: React.FC = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedModel, setSelectedModel] = useState('openai/gpt-5-mini'); // 设置默认模型为GPT-5 Mini
  const [availableModels, setAvailableModels] = useState<Array<{id: string, name: string, provider: string}>>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /**
   * 滚动到消息底部
   */
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  /**
   * 创建新对话
   */
  const createNewConversation = () => {
    const newConversation: Conversation = {
      id: Date.now().toString(),
      title: '新对话',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      message_count: 0
    };
    
    setConversations(prev => [newConversation, ...prev]);
    setCurrentConversation(newConversation.id);
    setMessages([]);
  };

  /**
   * 选择对话
   */
  const selectConversation = (conversationId: string) => {
    setCurrentConversation(conversationId);
    // TODO: 加载对话消息
    setMessages([]);
    setShowHistory(false);
  };

  /**
   * 删除对话
   */
  const deleteConversation = (conversationId: string) => {
    if (!confirm('确定要删除这个对话吗？')) return;
    
    setConversations(prev => prev.filter(conv => conv.id !== conversationId));
    if (currentConversation === conversationId) {
      setCurrentConversation(null);
      setMessages([]);
    }
  };

  /**
   * 加载可用模型列表
   */
  const loadModels = async () => {
    try {
      const response = await fetch('/api/chat/models');
      if (response.ok) {
        const result = await response.json();
        setAvailableModels(result.data || []);
      }
    } catch (error) {
      console.error('加载模型列表失败:', error);
    }
  };

  useEffect(() => {
    loadModels();
  }, []);

  /**
   * 发送消息
   */
  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading || !user) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage.trim(),
      role: 'user',
      timestamp: new Date().toISOString()
    };

    // 如果没有当前对话，创建新对话
    if (!currentConversation) {
      createNewConversation();
    }

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // 准备消息历史
      const chatMessages = [...messages, userMessage].map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // 调用RAG聊天API
      const response = await fetch('/api/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: chatMessages,
          model: selectedModel,
          conversationId: currentConversation,
          userId: user.id // 添加用户ID
        })
      });

      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: result.data.message,
          role: 'assistant',
          timestamp: new Date().toISOString(),
          sources: result.data.sources || [] // 使用API返回的来源
        };
        
        setMessages(prev => [...prev, aiMessage]);
      } else {
        throw new Error(result.error || '未知错误');
      }
    } catch (error) {
      console.error('发送消息失败:', error);
      
      // 显示错误消息
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `抱歉，发生了错误：${error instanceof Error ? error.message : '未知错误'}`,
        role: 'assistant',
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 处理键盘事件
   */
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /**
   * 格式化时间
   */
  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  /**
   * 格式化日期
   */
  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('zh-CN');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* 侧边栏 - 对话历史 */}
      <div className={`bg-white border-r border-gray-200 transition-all duration-300 ${
        showHistory ? 'w-80' : 'w-0 overflow-hidden'
      } lg:w-80 lg:block`}>
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">对话历史</h2>
            <button
              onClick={createNewConversation}
              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              <History className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p>还没有对话记录</p>
            </div>
          ) : (
            <div className="p-2">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`p-3 rounded-lg cursor-pointer mb-2 group ${
                    currentConversation === conversation.id
                      ? 'bg-blue-50 border border-blue-200'
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => selectConversation(conversation.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-gray-900 truncate">
                        {conversation.title}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {formatDate(conversation.updated_at)} · {conversation.message_count} 条消息
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConversation(conversation.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 主聊天区域 */}
      <div className="flex-1 flex flex-col">
        {/* 顶部工具栏 */}
        <div className="bg-white border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="lg:hidden p-2 text-gray-400 hover:text-gray-600"
              >
                <History className="w-5 h-5" />
              </button>
              <h1 className="text-xl font-semibold text-gray-900">AI智能问答</h1>
              
              {/* 模型选择器 */}
              <div className="flex items-center space-x-2">
                <label className="text-sm text-gray-600">模型:</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {availableModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} ({model.provider})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={createNewConversation}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>新对话</span>
            </button>
          </div>
        </div>

        {/* 消息区域 */}
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Bot className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">开始新的对话</h3>
                <p className="text-gray-600 mb-6">向我提问任何关于您知识库的问题</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
                  <button
                    onClick={() => setInputMessage('我的知识库里有什么内容？')}
                    className="p-4 text-left border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50"
                  >
                    <FileText className="w-5 h-5 text-blue-600 mb-2" />
                    <p className="text-sm font-medium text-gray-900">查看知识库内容</p>
                    <p className="text-xs text-gray-600">了解已上传的文档和信息</p>
                  </button>
                  <button
                    onClick={() => setInputMessage('如何使用这个系统？')}
                    className="p-4 text-left border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50"
                  >
                    <Bot className="w-5 h-5 text-green-600 mb-2" />
                    <p className="text-sm font-medium text-gray-900">使用帮助</p>
                    <p className="text-xs text-gray-600">学习如何更好地使用AI问答</p>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex max-w-3xl ${
                    message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                  }`}>
                    {/* 头像 */}
                    <div className={`flex-shrink-0 ${
                      message.role === 'user' ? 'ml-3' : 'mr-3'
                    }`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        message.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-600'
                      }`}>
                        {message.role === 'user' ? (
                          <User className="w-5 h-5" />
                        ) : (
                          <Bot className="w-5 h-5" />
                        )}
                      </div>
                    </div>
                    
                    {/* 消息内容 */}
                    <div className={`flex-1 ${
                      message.role === 'user' ? 'text-right' : 'text-left'
                    }`}>
                      <div className={`inline-block p-4 rounded-lg ${
                        message.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-gray-200'
                      }`}>
                        <p className="whitespace-pre-wrap">{message.content}</p>
                        
                        {/* 来源文档 */}
                        {message.sources && message.sources.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <p className="text-xs text-gray-500 mb-2">参考来源：</p>
                            <div className="flex flex-wrap gap-1">
                              {message.sources.map((source, index) => (
                                <span
                                  key={index}
                                  className="inline-block px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded"
                                >
                                  {source}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatTime(message.timestamp)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* 加载指示器 */}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex mr-3">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                      <Bot className="w-5 h-5 text-gray-600" />
                    </div>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* 输入区域 */}
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-end space-x-4">
              <div className="flex-1">
                <textarea
                  ref={inputRef}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="输入您的问题..."
                  rows={1}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  style={{ minHeight: '44px', maxHeight: '120px' }}
                />
              </div>
              <button
                onClick={sendMessage}
                disabled={!inputMessage.trim() || isLoading}
                className="bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              按 Enter 发送，Shift + Enter 换行
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;