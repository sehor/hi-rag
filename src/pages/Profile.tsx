import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { User, FileText, MessageSquare, Settings, Edit2, Save, X } from 'lucide-react';

/**
 * 用户中心页面组件
 * 显示用户个人信息、使用统计和账户设置
 */
const Profile: React.FC = () => {
  const { user, userProfile, refreshProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: userProfile?.name || ''
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (userProfile) {
      setFormData({
        name: userProfile?.name || ''
      });
    }
  }, [userProfile]);

  // 模拟使用统计数据
  const stats = {
    documentsCount: 12,
    questionsCount: 45,
    totalChunks: 156
  };

  /**
   * 处理编辑表单提交
   */
  const handleSaveProfile = async () => {
    setIsLoading(true);
    try {
      // TODO: 实现更新用户资料的API调用
      console.log('Updating profile:', formData);
      
      // 模拟API调用延迟
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setIsEditing(false);
      await refreshProfile();
    } catch (error) {
      console.error('Failed to update profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 取消编辑
   */
  const handleCancelEdit = () => {
    setFormData({
        name: userProfile?.name || ''
      });
    setIsEditing(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* 页面标题 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">个人中心</h1>
          <p className="text-gray-600 mt-2">管理您的个人信息和账户设置</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 个人信息卡片 */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                  <User className="w-5 h-5 mr-2" />
                  个人信息
                </h2>
                {!isEditing && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
                  >
                    <Edit2 className="w-4 h-4 mr-1" />
                    编辑
                  </button>
                )}
              </div>

              <div className="space-y-4">
                {/* 邮箱 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    邮箱地址
                  </label>
                  <div className="text-gray-900 bg-gray-50 px-3 py-2 rounded-md">
                    {user?.email}
                  </div>
                </div>

                {/* 姓名 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    姓名
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="请输入您的姓名"
                    />
                  ) : (
                    <div className="text-gray-900 px-3 py-2">
                      {userProfile?.name || '未设置'}
                    </div>
                  )}
                </div>



                {/* 注册时间 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    注册时间
                  </label>
                  <div className="text-gray-900 px-3 py-2">
                    {user?.created_at ? new Date(user.created_at).toLocaleDateString('zh-CN') : '未知'}
                  </div>
                </div>

                {/* 编辑模式下的操作按钮 */}
                {isEditing && (
                  <div className="flex space-x-3 pt-4">
                    <button
                      onClick={handleSaveProfile}
                      disabled={isLoading}
                      className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {isLoading ? '保存中...' : '保存'}
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      disabled={isLoading}
                      className="flex items-center px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <X className="w-4 h-4 mr-2" />
                      取消
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 侧边栏 */}
          <div className="space-y-6">
            {/* 使用统计 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">使用统计</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <FileText className="w-5 h-5 text-blue-600 mr-2" />
                    <span className="text-gray-700">已上传文档</span>
                  </div>
                  <span className="text-2xl font-bold text-blue-600">{stats.documentsCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <MessageSquare className="w-5 h-5 text-green-600 mr-2" />
                    <span className="text-gray-700">问答次数</span>
                  </div>
                  <span className="text-2xl font-bold text-green-600">{stats.questionsCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Settings className="w-5 h-5 text-purple-600 mr-2" />
                    <span className="text-gray-700">知识条目</span>
                  </div>
                  <span className="text-2xl font-bold text-purple-600">{stats.totalChunks}</span>
                </div>
              </div>
            </div>

            {/* 账户设置 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">账户设置</h3>
              <div className="space-y-3">
                <button className="w-full text-left px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-md transition-colors">
                  修改密码
                </button>
                <button className="w-full text-left px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-md transition-colors">
                  通知设置
                </button>
                <button className="w-full text-left px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-md transition-colors">
                  隐私设置
                </button>
                <button className="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 rounded-md transition-colors">
                  删除账户
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;