import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Brain, FileText, MessageSquare, Upload, Zap, Shield } from 'lucide-react';

/**
 * 首页组件
 * 展示产品介绍、功能特性和快速开始
 */
const Home: React.FC = () => {
  const { userProfile } = useAuth();

  const features = [
    {
      icon: Upload,
      title: '智能文档上传',
      description: '支持PDF、Word、TXT等多种格式，自动解析和向量化处理'
    },
    {
      icon: Brain,
      title: 'AI智能问答',
      description: '基于您的知识库内容，提供准确、相关的智能回答'
    },
    {
      icon: Zap,
      title: '快速检索',
      description: '毫秒级语义搜索，快速定位相关信息和答案'
    },
    {
      icon: Shield,
      title: '数据安全',
      description: '企业级安全保障，您的数据完全私有和安全'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* 英雄区域 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        <div className="text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            欢迎回来，
            <span className="text-blue-600">{userProfile?.name || '用户'}</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            使用RAG智能问答系统，让您的文档变得更智能。上传文档，构建知识库，享受AI驱动的智能问答体验。
          </p>
          
          {/* 快速开始按钮 */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/knowledge"
              className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
            >
              <FileText className="w-5 h-5" />
              <span>管理知识库</span>
            </Link>
            <Link
              to="/chat"
              className="bg-white text-blue-600 border-2 border-blue-600 px-8 py-3 rounded-lg font-semibold hover:bg-blue-50 transition-colors flex items-center justify-center space-x-2"
            >
              <MessageSquare className="w-5 h-5" />
              <span>开始问答</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 功能特性 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">核心功能</h2>
          <p className="text-lg text-gray-600">强大的RAG技术，为您提供智能化的知识管理体验</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow"
              >
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 使用统计 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">使用概览</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600 mb-2">0</div>
              <div className="text-gray-600">已上传文档</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600 mb-2">0</div>
              <div className="text-gray-600">问答次数</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600 mb-2">0</div>
              <div className="text-gray-600">知识条目</div>
            </div>
          </div>
        </div>
      </div>

      {/* 快速操作 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-8 text-white text-center">
          <h2 className="text-2xl font-bold mb-4">准备好开始了吗？</h2>
          <p className="text-blue-100 mb-6">上传您的第一个文档，开始构建智能知识库</p>
          <Link
            to="/knowledge"
            className="bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors inline-flex items-center space-x-2"
          >
            <Upload className="w-5 h-5" />
            <span>立即上传文档</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Home;