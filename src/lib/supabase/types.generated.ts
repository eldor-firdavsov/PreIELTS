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
      ai_analyses: {
        Row: {
          analysis: Json
          created_at: string
          id: string
          payload: Json
          prompt_version: string
          scope: string
          subject_id: string
          user_id: string
        }
        Insert: {
          analysis: Json
          created_at?: string
          id?: string
          payload: Json
          prompt_version: string
          scope: string
          subject_id: string
          user_id: string
        }
        Update: {
          analysis?: Json
          created_at?: string
          id?: string
          payload?: Json
          prompt_version?: string
          scope?: string
          subject_id?: string
          user_id?: string
        }
        Relationships: []
      }
      answers: {
        Row: {
          id: string
          is_correct: boolean | null
          question_id: string
          session_id: string
          time_spent_seconds: number
          updated_at: string
          value: Json | null
        }
        Insert: {
          id?: string
          is_correct?: boolean | null
          question_id: string
          session_id: string
          time_spent_seconds?: number
          updated_at?: string
          value?: Json | null
        }
        Update: {
          id?: string
          is_correct?: boolean | null
          question_id?: string
          session_id?: string
          time_spent_seconds?: number
          updated_at?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "result_overview"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "test_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      content_testers: {
        Row: {
          created_at: string
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mistakes: {
        Row: {
          correct_answer: Json | null
          created_at: string
          id: string
          question_id: string
          question_type: Database["public"]["Enums"]["question_type"]
          result_id: string
          time_spent_seconds: number | null
          user_answer: Json | null
          user_id: string
        }
        Insert: {
          correct_answer?: Json | null
          created_at?: string
          id?: string
          question_id: string
          question_type: Database["public"]["Enums"]["question_type"]
          result_id: string
          time_spent_seconds?: number | null
          user_answer?: Json | null
          user_id: string
        }
        Update: {
          correct_answer?: Json | null
          created_at?: string
          id?: string
          question_id?: string
          question_type?: Database["public"]["Enums"]["question_type"]
          result_id?: string
          time_spent_seconds?: number | null
          user_answer?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mistakes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mistakes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mistakes_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "result_overview"
            referencedColumns: ["result_id"]
          },
          {
            foreignKeyName: "mistakes_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "result_type_accuracy"
            referencedColumns: ["result_id"]
          },
          {
            foreignKeyName: "mistakes_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "test_results"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          cefr_level: Database["public"]["Enums"]["cefr_level"] | null
          created_at: string
          current_band: number | null
          full_name: string | null
          id: string
          level_scale: Database["public"]["Enums"]["level_scale"] | null
          onboarded_at: string | null
          target_band: number | null
        }
        Insert: {
          cefr_level?: Database["public"]["Enums"]["cefr_level"] | null
          created_at?: string
          current_band?: number | null
          full_name?: string | null
          id: string
          level_scale?: Database["public"]["Enums"]["level_scale"] | null
          onboarded_at?: string | null
          target_band?: number | null
        }
        Update: {
          cefr_level?: Database["public"]["Enums"]["cefr_level"] | null
          created_at?: string
          current_band?: number | null
          full_name?: string | null
          id?: string
          level_scale?: Database["public"]["Enums"]["level_scale"] | null
          onboarded_at?: string | null
          target_band?: number | null
        }
        Relationships: []
      }
      question_groups: {
        Row: {
          id: string
          instructions: string | null
          ordinal: number
          section_id: string
          shared_options: Json | null
        }
        Insert: {
          id?: string
          instructions?: string | null
          ordinal: number
          section_id: string
          shared_options?: Json | null
        }
        Update: {
          id?: string
          instructions?: string | null
          ordinal?: number
          section_id?: string
          shared_options?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "question_groups_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "result_mistakes"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "question_groups_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          accepted_variants: string[] | null
          correct_answer: Json | null
          evidence: Json | null
          group_id: string
          id: string
          options: Json | null
          ordinal: number
          prompt: string
          type: Database["public"]["Enums"]["question_type"]
        }
        Insert: {
          accepted_variants?: string[] | null
          correct_answer?: Json | null
          evidence?: Json | null
          group_id: string
          id?: string
          options?: Json | null
          ordinal: number
          prompt: string
          type: Database["public"]["Enums"]["question_type"]
        }
        Update: {
          accepted_variants?: string[] | null
          correct_answer?: Json | null
          evidence?: Json | null
          group_id?: string
          id?: string
          options?: Json | null
          ordinal?: number
          prompt?: string
          type?: Database["public"]["Enums"]["question_type"]
        }
        Relationships: [
          {
            foreignKeyName: "questions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "question_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      section_results: {
        Row: {
          accuracy_by_type: Json
          band: number | null
          id: string
          kind: Database["public"]["Enums"]["section_kind"]
          raw_score: number | null
          raw_total: number | null
          result_id: string
          section_id: string
          time_seconds: number | null
        }
        Insert: {
          accuracy_by_type?: Json
          band?: number | null
          id?: string
          kind: Database["public"]["Enums"]["section_kind"]
          raw_score?: number | null
          raw_total?: number | null
          result_id: string
          section_id: string
          time_seconds?: number | null
        }
        Update: {
          accuracy_by_type?: Json
          band?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["section_kind"]
          raw_score?: number | null
          raw_total?: number | null
          result_id?: string
          section_id?: string
          time_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "section_results_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "result_overview"
            referencedColumns: ["result_id"]
          },
          {
            foreignKeyName: "section_results_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "result_type_accuracy"
            referencedColumns: ["result_id"]
          },
          {
            foreignKeyName: "section_results_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "test_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_results_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "result_mistakes"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "section_results_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          duration_seconds: number
          id: string
          kind: Database["public"]["Enums"]["section_kind"]
          ordinal: number
          stimulus: Json
          test_id: string
        }
        Insert: {
          duration_seconds: number
          id?: string
          kind: Database["public"]["Enums"]["section_kind"]
          ordinal: number
          stimulus?: Json
          test_id: string
        }
        Update: {
          duration_seconds?: number
          id?: string
          kind?: Database["public"]["Enums"]["section_kind"]
          ordinal?: number
          stimulus?: Json
          test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      test_results: {
        Row: {
          created_at: string
          id: string
          overall_band: number | null
          session_id: string
          total_time_seconds: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          overall_band?: number | null
          session_id: string
          total_time_seconds?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          overall_band?: number | null
          session_id?: string
          total_time_seconds?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "result_overview"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "test_results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "test_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      test_sessions: {
        Row: {
          created_at: string
          current_section_id: string | null
          id: string
          started_at: string
          status: Database["public"]["Enums"]["session_status"]
          submitted_at: string | null
          test_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_section_id?: string | null
          id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          submitted_at?: string | null
          test_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_section_id?: string | null
          id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          submitted_at?: string | null
          test_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_sessions_current_section_id_fkey"
            columns: ["current_section_id"]
            isOneToOne: false
            referencedRelation: "result_mistakes"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "test_sessions_current_section_id_fkey"
            columns: ["current_section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_sessions_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      tests: {
        Row: {
          created_at: string
          external_id: string
          id: string
          is_full_mock: boolean
          is_published: boolean
          source_provenance: Json
          title: string
        }
        Insert: {
          created_at?: string
          external_id: string
          id?: string
          is_full_mock?: boolean
          is_published?: boolean
          source_provenance?: Json
          title: string
        }
        Update: {
          created_at?: string
          external_id?: string
          id?: string
          is_full_mock?: boolean
          is_published?: boolean
          source_provenance?: Json
          title?: string
        }
        Relationships: []
      }
      user_progress: {
        Row: {
          band: number
          kind: Database["public"]["Enums"]["section_kind"]
          recorded_at: string
          result_id: string | null
          user_id: string
        }
        Insert: {
          band: number
          kind: Database["public"]["Enums"]["section_kind"]
          recorded_at?: string
          result_id?: string | null
          user_id: string
        }
        Update: {
          band?: number
          kind?: Database["public"]["Enums"]["section_kind"]
          recorded_at?: string
          result_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_progress_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "result_overview"
            referencedColumns: ["result_id"]
          },
          {
            foreignKeyName: "user_progress_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "result_type_accuracy"
            referencedColumns: ["result_id"]
          },
          {
            foreignKeyName: "user_progress_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "test_results"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      questions_public: {
        Row: {
          group_id: string | null
          id: string | null
          options: Json | null
          ordinal: number | null
          prompt: string | null
          type: Database["public"]["Enums"]["question_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "question_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      result_mistakes: {
        Row: {
          avg_seconds_per_question: number | null
          correct_answer: Json | null
          evidence: Json | null
          group_instructions: string | null
          has_evidence: boolean | null
          mistake_id: string | null
          options: Json | null
          prompt: string | null
          question_id: string | null
          question_ordinal: number | null
          question_type: Database["public"]["Enums"]["question_type"] | null
          result_id: string | null
          section_id: string | null
          section_kind: Database["public"]["Enums"]["section_kind"] | null
          section_ordinal: number | null
          section_title: string | null
          time_spent_seconds: number | null
          time_vs_average: number | null
          user_answer: Json | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mistakes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mistakes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mistakes_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "result_overview"
            referencedColumns: ["result_id"]
          },
          {
            foreignKeyName: "mistakes_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "result_type_accuracy"
            referencedColumns: ["result_id"]
          },
          {
            foreignKeyName: "mistakes_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "test_results"
            referencedColumns: ["id"]
          },
        ]
      }
      result_overview: {
        Row: {
          avg_seconds_per_question: number | null
          created_at: string | null
          external_id: string | null
          overall_band: number | null
          percent_correct: number | null
          raw_score: number | null
          raw_total: number | null
          result_id: string | null
          session_id: string | null
          test_id: string | null
          test_title: string | null
          total_time_seconds: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "test_sessions_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      result_sections: {
        Row: {
          accuracy_by_type: Json | null
          kind: Database["public"]["Enums"]["section_kind"] | null
          percent_correct: number | null
          raw_score: number | null
          raw_total: number | null
          result_id: string | null
          section_id: string | null
          section_ordinal: number | null
          section_title: string | null
          time_seconds: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "section_results_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "result_overview"
            referencedColumns: ["result_id"]
          },
          {
            foreignKeyName: "section_results_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "result_type_accuracy"
            referencedColumns: ["result_id"]
          },
          {
            foreignKeyName: "section_results_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "test_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_results_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "result_mistakes"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "section_results_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      result_skill_bands: {
        Row: {
          band: number | null
          kind: Database["public"]["Enums"]["section_kind"] | null
          percent_correct: number | null
          raw_score: number | null
          raw_total: number | null
          result_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_progress_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "result_overview"
            referencedColumns: ["result_id"]
          },
          {
            foreignKeyName: "user_progress_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "result_type_accuracy"
            referencedColumns: ["result_id"]
          },
          {
            foreignKeyName: "user_progress_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "test_results"
            referencedColumns: ["id"]
          },
        ]
      }
      result_type_accuracy: {
        Row: {
          correct: number | null
          percent_correct: number | null
          question_type: Database["public"]["Enums"]["question_type"] | null
          result_id: string | null
          total: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      answer_matches: {
        Args: {
          correct: Json
          qtype: Database["public"]["Enums"]["question_type"]
          submitted: Json
          variants: string[]
        }
        Returns: boolean
      }
      can_read_unpublished: { Args: never; Returns: boolean }
      normalise_answer: { Args: { raw: string }; Returns: string }
      raw_to_band: {
        Args: {
          kind: Database["public"]["Enums"]["section_kind"]
          raw: number
          total: number
        }
        Returns: number
      }
      round_half_band: { Args: { value: number }; Returns: number }
      score_session: { Args: { p_session_id: string }; Returns: string }
      seed_test: { Args: { payload: Json }; Returns: Json }
      start_or_resume_session: {
        Args: { p_test_id: string }
        Returns: Database["public"]["Tables"]["test_sessions"]["Row"]
      }
      study_plan_inputs: { Args: never; Returns: Json }
    }
    Enums: {
      question_type:
        | "multiple_choice"
        | "multi_select"
        | "true_false_not_given"
        | "yes_no_not_given"
        | "matching_headings"
        | "matching_information"
        | "sentence_completion"
        | "summary_completion"
        | "short_answer"
        | "form_completion"
        | "note_completion"
        | "map_labelling"
        | "writing_task"
        | "speaking_part"
      cefr_level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2"
      level_scale: "ielts" | "cefr" | "unsure"
      section_kind: "reading" | "listening" | "writing" | "speaking"
      session_status: "in_progress" | "submitted" | "abandoned" | "expired"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      question_type: [
        "multiple_choice",
        "multi_select",
        "true_false_not_given",
        "yes_no_not_given",
        "matching_headings",
        "matching_information",
        "sentence_completion",
        "summary_completion",
        "short_answer",
        "form_completion",
        "note_completion",
        "map_labelling",
        "writing_task",
        "speaking_part",
      ],
      section_kind: ["reading", "listening", "writing", "speaking"],
      session_status: ["in_progress", "submitted", "abandoned", "expired"],
    },
  },
} as const
