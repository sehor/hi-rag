/**
 * Supabase客户端配置
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://lmuwwbhmrczjreugcftk.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtdXd3YmhtcmN6anJldWdjZnRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1NTg2ODIsImV4cCI6MjA3MTEzNDY4Mn0.nXyPI-F7NBp_xB6-AdWBKVabfRY1DNJBI1uy9MKsclA';

/**
 * 创建Supabase客户端实例
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

/**
 * 获取当前用户
 */
export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error('获取用户信息失败:', error);
    return null;
  }
  return user;
};

/**
 * 用户注册
 */
export const signUp = async (email: string, password: string, name: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name
      }
    }
  });
  
  if (error) {
    throw new Error(error.message);
  }
  
  return data;
};

/**
 * 用户登录
 */
export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  
  if (error) {
    throw new Error(error.message);
  }
  
  return data;
};

/**
 * 用户登出
 */
export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message);
  }
};