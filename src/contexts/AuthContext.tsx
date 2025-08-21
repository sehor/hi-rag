import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { UserProfile } from '../types/database';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * 认证状态提供者组件
 * 管理用户登录状态和用户资料
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * 获取用户资料
   * 如果用户资料不存在，自动创建一个
   */
  const fetchUserProfile = async (user: User) => {
    console.log('AuthContext: 开始获取用户资料...', user.id);
    try {
      // 使用 .limit(1) 代替 .single() 来避免 406 Not Acceptable 错误
      // .limit(1) 会返回一个数组，如果没有找到记录，则为空数组 []
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .limit(1);

      if (error) {
        // 如果仍然出错，记录错误并退出
        console.error('AuthContext: 获取用户资料失败:', error);
        setUserProfile(null);
        return;
      }

      // 如果查询成功但没有返回数据 (data 是空数组)，说明是新用户，需要创建资料
      if (data && data.length === 0) {
        console.log('AuthContext: 用户资料不存在，准备创建...');
        await createUserProfile(user);
        return;
      }

      // 如果查询成功并返回了数据
      if (data && data.length > 0) {
        console.log('AuthContext: 成功获取用户资料', data[0]);
        setUserProfile(data[0]);
      }
    } catch (error) {
      console.error('AuthContext: 获取用户资料时发生异常:', error);
      setUserProfile(null);
    }
  };

  /**
   * 创建用户资料
   */
  const createUserProfile = async (user: User) => {
    console.log('AuthContext: 开始创建用户资料...', user.id);
    try {
      const name = user.user_metadata?.name || user.email?.split('@')[0] || '用户';
      
      const { data, error } = await supabase
        .from('user_profiles')
        .insert({
          id: user.id,
          name: name,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('AuthContext: 创建用户资料失败:', error);
        return;
      }

      setUserProfile(data);
      console.log('AuthContext: 用户资料创建成功', data);
    } catch (error) {
      console.error('AuthContext: 创建用户资料时发生异常:', error);
    }
  };

  /**
   * 刷新用户资料
   */
  const refreshProfile = async () => {
    if (user) {
      await fetchUserProfile(user);
    }
  };

  /**
   * 用户登出
   */
  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setUserProfile(null);
    } catch (error) {
      console.error('登出失败:', error);
    }
  };

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    console.log('AuthContext: useEffect挂载，开始认证检查...');

    // 设置30秒超时，防止认证过程无限加载
    const timeoutId = setTimeout(() => {
      if (isMounted) {
        console.warn('认证检查超时 (30秒)，强制设置loading为false');
        setLoading(false);
      }
    }, 30000);

    // 监听认证状态变化，它会在监听器附加时立即触发一次
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => { // 注意：这里移除了 async
        console.log('AuthContext: onAuthStateChange触发', { event, session });
        if (!isMounted) {
          console.log('AuthContext: 组件已卸载，跳过状态更新');
          return;
        }

        try {
          const user = session?.user ?? null;
          setUser(user);
          if (user) {
            // 在后台获取用户资料，不使用 await，不阻塞主认证流程
            fetchUserProfile(user);
          } else {
            console.log('AuthContext: 用户未登录，设置userProfile为null');
            setUserProfile(null);
          }
        } catch (error) {
          console.error('处理认证状态变化时出错:', error);
        } finally {
          // 只要收到onAuthStateChange的回调，就认为核心认证完成
          if (isMounted) {
            console.log('AuthContext: 核心认证流程结束，清除超时并设置loading为false');
            clearTimeout(timeoutId);
            setLoading(false);
          }
        }
      }
    );

    // 清理函数
    return () => {
      console.log('AuthContext: useEffect清理，取消订阅');
      isMounted = false;
      subscription.unsubscribe();
      clearTimeout(timeoutId);
    };
  }, []);

  const value = {
    user,
    userProfile,
    loading,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * 使用认证状态的Hook
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};