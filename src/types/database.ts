/**
 * 数据库类型定义
 */
export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string;
          name: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      documents: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          content: string | null;
          file_url: string | null;
          file_type: string | null;
          file_size: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          content?: string | null;
          file_url?: string | null;
          file_type?: string | null;
          file_size?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          content?: string | null;
          file_url?: string | null;
          file_type?: string | null;
          file_size?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      document_chunks: {
        Row: {
          id: string;
          document_id: string;
          content: string;
          embedding: number[] | null;
          chunk_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          content: string;
          embedding?: number[] | null;
          chunk_index: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          document_id?: string;
          content?: string;
          embedding?: number[] | null;
          chunk_index?: number;
          created_at?: string;
        };
      };
      conversations: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          question: string;
          answer: string;
          role: 'user' | 'assistant';
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          question: string;
          answer: string;
          role: 'user' | 'assistant';
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          question?: string;
          answer?: string;
          role?: 'user' | 'assistant';
          created_at?: string;
        };
      };
      message_sources: {
        Row: {
          id: string;
          message_id: string;
          chunk_id: string;
          similarity_score: number;
        };
        Insert: {
          id?: string;
          message_id: string;
          chunk_id: string;
          similarity_score: number;
        };
        Update: {
          id?: string;
          message_id?: string;
          chunk_id?: string;
          similarity_score?: number;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}

/**
 * 用户配置类型
 */
export type UserProfile = Database['public']['Tables']['user_profiles']['Row'];

/**
 * 文档类型
 */
export type Document = Database['public']['Tables']['documents']['Row'];

/**
 * 文档块类型
 */
export type DocumentChunk = Database['public']['Tables']['document_chunks']['Row'];

/**
 * 对话类型
 */
export type Conversation = Database['public']['Tables']['conversations']['Row'];

/**
 * 消息类型
 */
export type Message = Database['public']['Tables']['messages']['Row'];

/**
 * 消息来源类型
 */
export type MessageSource = Database['public']['Tables']['message_sources']['Row'];