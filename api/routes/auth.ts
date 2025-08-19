import { Router } from 'express';
import { supabase } from '../lib/supabase';

const router = Router();

/**
 * 用户注册
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ 
        error: '邮箱、密码和姓名都是必填项' 
      });
    }
    
    // 使用Supabase进行用户注册
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
      return res.status(400).json({ 
        error: error.message 
      });
    }
    
    res.status(201).json({ 
      message: '注册成功',
      user: data.user 
    });
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({ 
      error: '服务器内部错误' 
    });
  }
});

/**
 * 用户登录
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        error: '邮箱和密码都是必填项' 
      });
    }
    
    // 使用Supabase进行用户登录
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) {
      return res.status(401).json({ 
        error: error.message 
      });
    }
    
    res.json({ 
      message: '登录成功',
      user: data.user,
      session: data.session 
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ 
      error: '服务器内部错误' 
    });
  }
});

/**
 * 用户登出
 */
router.post('/logout', async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      return res.status(400).json({ 
        error: error.message 
      });
    }
    
    res.json({ 
      message: '登出成功' 
    });
  } catch (error) {
    console.error('登出错误:', error);
    res.status(500).json({ 
      error: '服务器内部错误' 
    });
  }
});

/**
 * 获取当前用户信息
 */
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ 
        error: '未提供认证令牌' 
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ 
        error: '无效的认证令牌' 
      });
    }
    
    res.json({ 
      user 
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ 
      error: '服务器内部错误' 
    });
  }
});

export default router;