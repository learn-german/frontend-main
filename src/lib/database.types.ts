export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      grammar_exercises: {
        Row: {
          classification_groups: Json | null
          classification_items: Json | null
          correct_answer: string | null
          explanation: string
          group_id: string | null
          hint: string | null
          id: string
          lesson_id: string
          order_index: number
          prompt_text: string | null
          status: string
          tokens: Json | null
          transformation_hint: string | null
          type: string
        }
        Insert: {
          classification_groups?: Json | null
          classification_items?: Json | null
          correct_answer?: string | null
          explanation?: string
          group_id?: string | null
          hint?: string | null
          id?: string
          lesson_id: string
          order_index?: number
          prompt_text?: string | null
          status?: string
          tokens?: Json | null
          transformation_hint?: string | null
          type: string
        }
        Update: {
          classification_groups?: Json | null
          classification_items?: Json | null
          correct_answer?: string | null
          explanation?: string
          group_id?: string | null
          hint?: string | null
          id?: string
          lesson_id?: string
          order_index?: number
          prompt_text?: string | null
          status?: string
          tokens?: Json | null
          transformation_hint?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "grammar_exercises_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grammar_exercises_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          category: string
          completed_at: string
          lesson_id: string
          quiz_score: number | null
          user_id: string
        }
        Insert: {
          category?: string
          completed_at?: string
          lesson_id: string
          quiz_score?: number | null
          user_id: string
        }
        Update: {
          category?: string
          completed_at?: string
          lesson_id?: string
          quiz_score?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          audio_r2_key: string | null
          duration: string | null
          grammar: Json
          grammar_md: string | null
          id: string
          level: string
          listening_url: string | null
          module_id: string | null
          next_lesson_id: string | null
          objective: string | null
          order_index: number
          reading_text: string | null
          reading_text_vi: string | null
          speaking_md: string | null
          status: string
          summary: string | null
          title: string
          title_vi: string
          video_r2_key: string | null
          vocabulary: Json
          vocabulary_md: string | null
          writing_prompt_md: string | null
          xp_reward: number
          youtube_id: string | null
        }
        Insert: {
          audio_r2_key?: string | null
          duration?: string | null
          grammar?: Json
          grammar_md?: string | null
          id: string
          level: string
          listening_url?: string | null
          module_id?: string | null
          next_lesson_id?: string | null
          objective?: string | null
          order_index?: number
          reading_text?: string | null
          reading_text_vi?: string | null
          speaking_md?: string | null
          status?: string
          summary?: string | null
          title: string
          title_vi: string
          video_r2_key?: string | null
          vocabulary?: Json
          vocabulary_md?: string | null
          writing_prompt_md?: string | null
          xp_reward?: number
          youtube_id?: string | null
        }
        Update: {
          audio_r2_key?: string | null
          duration?: string | null
          grammar?: Json
          grammar_md?: string | null
          id?: string
          level?: string
          listening_url?: string | null
          module_id?: string | null
          next_lesson_id?: string | null
          objective?: string | null
          order_index?: number
          reading_text?: string | null
          reading_text_vi?: string | null
          speaking_md?: string | null
          status?: string
          summary?: string | null
          title?: string
          title_vi?: string
          video_r2_key?: string | null
          vocabulary?: Json
          vocabulary_md?: string | null
          writing_prompt_md?: string | null
          xp_reward?: number
          youtube_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_next_lesson_id_fkey"
            columns: ["next_lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_next_lesson_id_fkey"
            columns: ["next_lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      listening_clips: {
        Row: {
          id: string
          lesson_id: string
          order_index: number
          r2_key: string
        }
        Insert: {
          id?: string
          lesson_id: string
          order_index?: number
          r2_key: string
        }
        Update: {
          id?: string
          lesson_id?: string
          order_index?: number
          r2_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "listening_clips_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listening_clips_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          description: string | null
          id: string
          level: string
          order_index: number
          title: string
          title_vi: string
        }
        Insert: {
          description?: string | null
          id: string
          level: string
          order_index?: number
          title: string
          title_vi: string
        }
        Update: {
          description?: string | null
          id?: string
          level?: string
          order_index?: number
          title?: string
          title_vi?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          for_admin: boolean
          id: string
          lesson_id: string | null
          message: string
          read_at: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          for_admin?: boolean
          id?: string
          lesson_id?: string | null
          message: string
          read_at?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          for_admin?: boolean
          id?: string
          lesson_id?: string | null
          message?: string
          read_at?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_premium: boolean
          role: string
          unlocked_levels: string[]
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_premium?: boolean
          role?: string
          unlocked_levels?: string[]
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_premium?: boolean
          role?: string
          unlocked_levels?: string[]
        }
        Relationships: []
      }
      quiz_questions: {
        Row: {
          answer_text: string | null
          audio_clip_id: string | null
          audio_text: string | null
          category: string
          correct_answer: string
          explanation: string
          id: string
          lesson_id: string | null
          matching_pairs: Json | null
          options: Json | null
          order_index: number
          question_text: string
          reading_passage_id: string | null
          type: string
        }
        Insert: {
          answer_text?: string | null
          audio_clip_id?: string | null
          audio_text?: string | null
          category?: string
          correct_answer: string
          explanation?: string
          id?: string
          lesson_id?: string | null
          matching_pairs?: Json | null
          options?: Json | null
          order_index?: number
          question_text: string
          reading_passage_id?: string | null
          type: string
        }
        Update: {
          answer_text?: string | null
          audio_clip_id?: string | null
          audio_text?: string | null
          category?: string
          correct_answer?: string
          explanation?: string
          id?: string
          lesson_id?: string | null
          matching_pairs?: Json | null
          options?: Json | null
          order_index?: number
          question_text?: string
          reading_passage_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_audio_clip_id_fkey"
            columns: ["audio_clip_id"]
            isOneToOne: false
            referencedRelation: "listening_clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_questions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_questions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_questions_reading_passage_id_fkey"
            columns: ["reading_passage_id"]
            isOneToOne: false
            referencedRelation: "reading_passages"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_passages: {
        Row: {
          id: string
          lesson_id: string
          order_index: number
          text_de: string
        }
        Insert: {
          id?: string
          lesson_id: string
          order_index?: number
          text_de: string
        }
        Update: {
          id?: string
          lesson_id?: string
          order_index?: number
          text_de?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_passages_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_passages_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      user_stats: {
        Row: {
          last_activity_date: string | null
          streak: number
          updated_at: string
          user_id: string
          xp: number
        }
        Insert: {
          last_activity_date?: string | null
          streak?: number
          updated_at?: string
          user_id: string
          xp?: number
        }
        Update: {
          last_activity_date?: string | null
          streak?: number
          updated_at?: string
          user_id?: string
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      writing_submissions: {
        Row: {
          comment: string | null
          content: string
          graded_at: string | null
          id: string
          lesson_id: string
          score: number | null
          submitted_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          content: string
          graded_at?: string | null
          id?: string
          lesson_id: string
          score?: number | null
          submitted_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string | null
          content?: string
          graded_at?: string | null
          id?: string
          lesson_id?: string
          score?: number | null
          submitted_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "writing_submissions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writing_submissions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writing_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      grammar_exercises_public: {
        Row: {
          classification_groups: Json | null
          classification_items: Json | null
          explanation: string | null
          group_id: string | null
          hint: string | null
          id: string | null
          lesson_id: string | null
          order_index: number | null
          prompt_text: string | null
          tokens: Json | null
          transformation_hint: string | null
          type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grammar_exercises_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grammar_exercises_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_positions: {
        Row: {
          id: string | null
          module_id: string | null
          order_index: number | null
          status: string | null
        }
        Insert: {
          id?: string | null
          module_id?: string | null
          order_index?: number | null
          status?: string | null
        }
        Update: {
          id?: string | null
          module_id?: string | null
          order_index?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions_public: {
        Row: {
          answer_text: string | null
          audio_clip_id: string | null
          audio_text: string | null
          category: string | null
          explanation: string | null
          id: string | null
          lesson_id: string | null
          matching_pairs: Json | null
          options: Json | null
          order_index: number | null
          question_text: string | null
          reading_passage_id: string | null
          type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_audio_clip_id_fkey"
            columns: ["audio_clip_id"]
            isOneToOne: false
            referencedRelation: "listening_clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_questions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_questions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_questions_reading_passage_id_fkey"
            columns: ["reading_passage_id"]
            isOneToOne: false
            referencedRelation: "reading_passages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      increment_xp: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
