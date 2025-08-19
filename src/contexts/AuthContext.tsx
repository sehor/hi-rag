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
  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        // 如果用户资料不存在，尝试创建一个
        if (error.code === 'PGRST116') {
          console.log('用户资料不存在，正在创建...');
          await createUserProfile(userId);
          return;
        }
        console.error('获取用户资料失败:', error);
        return;
      }

      setUserProfile(data);
    } catch (error) {
      console.error('获取用户资料异常:', error);
    }
  };

  /**
   * 创建用户资料
   */
  const createUserProfile = async (userId: string) => {
    try {
      // 获取用户的基本信息
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const name = user.user_metadata?.name || user.email?.split('@')[0] || '用户';
      
      const { data, error } = await supabase
        .from('user_profiles')
        .insert({
          id: userId,
          name: name,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('创建用户资料失败:', error);
        return;
      }

      setUserProfile(data);
      console.log('用户资料创建成功');
    } catch (error) {
      console.error('创建用户资料异常:', error);
    }
  };

  /**
   * 刷新用户资料
   */
  const refreshProfile = async () => {
    if (user) {
      await fetchUserProfile(user.id);
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
    let timeoutId: NodeJS.Timeout;
    
    // 获取当前用户
    const getCurrentUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
        
        if (user) {
          await fetchUserProfile(user.id);
        }
      } catch (error) {
        console.error('获取当前用户失败:', error);
      } finally {
        setLoading(false);
      }
    };

    // 设置超时机制，防止无限加载
    timeoutId = setTimeout(() => {
      console.warn('认证检查超时，强制设置loading为false');
      setLoading(false);
    }, 10000); // 10秒超时

    getCurrentUser();

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // 清除超时定时器
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        setUser(session?.user ?? null);
        
        if (session?.user) {
          try {
            await fetchUserProfile(session.user.id);
          } catch (error) {
            console.error('获取用户资料失败:', error);
          }
        } else {
          setUserProfile(null);
        }
        
        setLoading(false);
      }
    );

    return () => {
       subscription.unsubscribe();
       if (timeoutId) {
         clearTimeout(timeoutId);
       }
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