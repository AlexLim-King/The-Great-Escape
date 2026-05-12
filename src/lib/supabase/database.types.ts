export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      games: {
        Row: {
          created_at: string
          description: string | null
          ends_at: string | null
          id: string
          join_code: string
          name: string
          owner_id: string
          starts_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          join_code: string
          name: string
          owner_id: string
          starts_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          join_code?: string
          name?: string
          owner_id?: string
          starts_at?: string | null
          status?: string
        }
        Relationships: []
      }
      mission_team_assignments: {
        Row: {
          created_at: string
          mission_id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          mission_id: string
          team_id: string
        }
        Update: {
          created_at?: string
          mission_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_team_assignments_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_team_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          assignment_mode: string
          created_at: string
          deadline_at: string | null
          deadline_duration_sec: number | null
          deadline_mode: string | null
          description: string | null
          display_order: number
          expected_answer: string | null
          game_id: string
          id: string
          points: number
          reference_image_path: string | null
          reference_links: Json
          submission_type: string
          title: string
          unlock_after: string | null
          unlock_groups: Json
          validation_mode: string
        }
        Insert: {
          assignment_mode?: string
          created_at?: string
          deadline_at?: string | null
          deadline_duration_sec?: number | null
          deadline_mode?: string | null
          description?: string | null
          display_order?: number
          expected_answer?: string | null
          game_id: string
          id?: string
          points?: number
          reference_image_path?: string | null
          reference_links?: Json
          submission_type: string
          title: string
          unlock_after?: string | null
          unlock_groups?: Json
          validation_mode: string
        }
        Update: {
          assignment_mode?: string
          created_at?: string
          deadline_at?: string | null
          deadline_duration_sec?: number | null
          deadline_mode?: string | null
          description?: string | null
          display_order?: number
          expected_answer?: string | null
          game_id?: string
          id?: string
          points?: number
          reference_image_path?: string | null
          reference_links?: Json
          submission_type?: string
          title?: string
          unlock_after?: string | null
          unlock_groups?: Json
          validation_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "missions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          game_id: string | null
          href: string | null
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          game_id?: string | null
          href?: string | null
          id?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          game_id?: string | null
          href?: string | null
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      submissions: {
        Row: {
          bonus_points: number
          created_at: string
          feedback: string | null
          id: string
          media_path: string | null
          mission_id: string
          payload_text: string | null
          status: string
          submitted_by: string
          team_id: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          bonus_points?: number
          created_at?: string
          feedback?: string | null
          id?: string
          media_path?: string | null
          mission_id: string
          payload_text?: string | null
          status?: string
          submitted_by: string
          team_id: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          bonus_points?: number
          created_at?: string
          feedback?: string | null
          id?: string
          media_path?: string | null
          mission_id?: string
          payload_text?: string | null
          status?: string
          submitted_by?: string
          team_id?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          joined_at: string
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          role?: string
          team_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_mission_state: {
        Row: {
          bonus_points: number
          completed_at: string | null
          expires_at: string | null
          mission_id: string
          state: string
          team_id: string
        }
        Insert: {
          bonus_points?: number
          completed_at?: string | null
          expires_at?: string | null
          mission_id: string
          state?: string
          team_id: string
        }
        Update: {
          bonus_points?: number
          completed_at?: string | null
          expires_at?: string | null
          mission_id?: string
          state?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_mission_state_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_mission_state_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          color: string
          created_at: string
          game_id: string
          id: string
          join_password_hash: string | null
          name: string
          requires_password: boolean | null
        }
        Insert: {
          color?: string
          created_at?: string
          game_id: string
          id?: string
          join_password_hash?: string | null
          name: string
          requires_password?: boolean | null
        }
        Update: {
          color?: string
          created_at?: string
          game_id?: string
          id?: string
          join_password_hash?: string | null
          name?: string
          requires_password?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_host_games: { Args: never; Returns: boolean }
      expire_overdue_missions_for_game: {
        Args: { p_game_id: string }
        Returns: number
      }
      expire_overdue_missions_for_team: {
        Args: { p_team_id: string }
        Returns: number
      }
      game_leaderboard: {
        Args: { p_game_id: string }
        Returns: {
          color: string
          completed: number
          score: number
          team_id: string
          team_name: string
        }[]
      }
      gen_join_code: { Args: never; Returns: string }
      join_team_with_password: {
        Args: { p_password: string; p_team_id: string }
        Returns: string
      }
      recompute_team_mission_state: {
        Args: { p_team_id: string }
        Returns: undefined
      }
      refresh_game_state: { Args: { p_game_id: string }; Returns: undefined }
      reorder_missions: {
        Args: { p_game_id: string; p_ids: string[] }
        Returns: undefined
      }
      set_team_password: {
        Args: { p_password: string; p_team_id: string }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

