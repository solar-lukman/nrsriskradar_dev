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
      ai_predictions: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          confidence_score: number | null
          created_at: string
          expires_at: string | null
          explanation: string | null
          generated_at: string
          id: string
          model_version: string | null
          predicted_value: Json
          prediction_type: string
          risk_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          confidence_score?: number | null
          created_at?: string
          expires_at?: string | null
          explanation?: string | null
          generated_at?: string
          id?: string
          model_version?: string | null
          predicted_value: Json
          prediction_type: string
          risk_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          confidence_score?: number | null
          created_at?: string
          expires_at?: string | null
          explanation?: string | null
          generated_at?: string
          id?: string
          model_version?: string | null
          predicted_value?: Json
          prediction_type?: string
          risk_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_predictions_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "compliance_risk_register_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_predictions_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "risks"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_history: {
        Row: {
          action: string
          actor_id: string
          actor_role: Database["public"]["Enums"]["user_role"] | null
          comments: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["approval_status"] | null
          id: string
          metadata: Json | null
          risk_id: string
          to_status: Database["public"]["Enums"]["approval_status"]
        }
        Insert: {
          action: string
          actor_id: string
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          comments?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["approval_status"] | null
          id?: string
          metadata?: Json | null
          risk_id: string
          to_status: Database["public"]["Enums"]["approval_status"]
        }
        Update: {
          action?: string
          actor_id?: string
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          comments?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["approval_status"] | null
          id?: string
          metadata?: Json | null
          risk_id?: string
          to_status?: Database["public"]["Enums"]["approval_status"]
        }
        Relationships: [
          {
            foreignKeyName: "approval_history_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "compliance_risk_register_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_history_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "risks"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          risk_type: Database["public"]["Enums"]["risk_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          risk_type?: Database["public"]["Enums"]["risk_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          risk_type?: Database["public"]["Enums"]["risk_type"]
          updated_at?: string
        }
        Relationships: []
      }
      auth_failed_attempts: {
        Row: {
          attempted_at: string
          email: string
          id: string
          ip_address: string | null
        }
        Insert: {
          attempted_at?: string
          email: string
          id?: string
          ip_address?: string | null
        }
        Update: {
          attempted_at?: string
          email?: string
          id?: string
          ip_address?: string | null
        }
        Relationships: []
      }
      backup_configurations: {
        Row: {
          authentication_method: string | null
          backup_type: string
          compression_enabled: boolean | null
          created_at: string
          created_by: string | null
          encryption_enabled: boolean | null
          enterprise_endpoint: string | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          name: string
          retention_days: number
          schedule_cron: string
          storage_location: string
          updated_at: string
        }
        Insert: {
          authentication_method?: string | null
          backup_type: string
          compression_enabled?: boolean | null
          created_at?: string
          created_by?: string | null
          encryption_enabled?: boolean | null
          enterprise_endpoint?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name: string
          retention_days?: number
          schedule_cron: string
          storage_location: string
          updated_at?: string
        }
        Update: {
          authentication_method?: string | null
          backup_type?: string
          compression_enabled?: boolean | null
          created_at?: string
          created_by?: string | null
          encryption_enabled?: boolean | null
          enterprise_endpoint?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name?: string
          retention_days?: number
          schedule_cron?: string
          storage_location?: string
          updated_at?: string
        }
        Relationships: []
      }
      backup_logs: {
        Row: {
          backup_location: string | null
          backup_type: string
          checksum: string | null
          completed_at: string | null
          configuration_id: string
          created_by: string | null
          duration_seconds: number | null
          error_message: string | null
          file_size_bytes: number | null
          id: string
          metadata: Json | null
          records_backed_up: number | null
          started_at: string
          status: string
        }
        Insert: {
          backup_location?: string | null
          backup_type: string
          checksum?: string | null
          completed_at?: string | null
          configuration_id: string
          created_by?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          file_size_bytes?: number | null
          id?: string
          metadata?: Json | null
          records_backed_up?: number | null
          started_at?: string
          status?: string
        }
        Update: {
          backup_location?: string | null
          backup_type?: string
          checksum?: string | null
          completed_at?: string | null
          configuration_id?: string
          created_by?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          file_size_bytes?: number | null
          id?: string
          metadata?: Json | null
          records_backed_up?: number | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_backup_logs_configuration"
            columns: ["configuration_id"]
            isOneToOne: false
            referencedRelation: "backup_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_restore_operations: {
        Row: {
          approved_by: string | null
          backup_log_id: string
          checklist_id: string | null
          completed_at: string | null
          error_message: string | null
          id: string
          performed_by: string
          restore_type: string
          restored_records: number | null
          started_at: string
          status: string
          target_timestamp: string | null
          validation_results: Json | null
        }
        Insert: {
          approved_by?: string | null
          backup_log_id: string
          checklist_id?: string | null
          completed_at?: string | null
          error_message?: string | null
          id?: string
          performed_by: string
          restore_type: string
          restored_records?: number | null
          started_at?: string
          status?: string
          target_timestamp?: string | null
          validation_results?: Json | null
        }
        Update: {
          approved_by?: string | null
          backup_log_id?: string
          checklist_id?: string | null
          completed_at?: string | null
          error_message?: string | null
          id?: string
          performed_by?: string
          restore_type?: string
          restored_records?: number | null
          started_at?: string
          status?: string
          target_timestamp?: string | null
          validation_results?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_restore_backup_log"
            columns: ["backup_log_id"]
            isOneToOne: false
            referencedRelation: "backup_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_restore_checklist"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "recovery_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      bcp_audit_logs: {
        Row: {
          action: string
          bcp_id: string
          changes: Json | null
          id: string
          performed_at: string
          performed_by: string
        }
        Insert: {
          action: string
          bcp_id: string
          changes?: Json | null
          id?: string
          performed_at?: string
          performed_by: string
        }
        Update: {
          action?: string
          bcp_id?: string
          changes?: Json | null
          id?: string
          performed_at?: string
          performed_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "bcp_audit_logs_bcp_id_fkey"
            columns: ["bcp_id"]
            isOneToOne: false
            referencedRelation: "business_continuity_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      bcp_schema_check_logs: {
        Row: {
          checked_at: string
          checked_by: string | null
          client_info: Json | null
          error_message: string | null
          id: string
          missing_columns: string[] | null
          status: string
        }
        Insert: {
          checked_at?: string
          checked_by?: string | null
          client_info?: Json | null
          error_message?: string | null
          id?: string
          missing_columns?: string[] | null
          status: string
        }
        Update: {
          checked_at?: string
          checked_by?: string | null
          client_info?: Json | null
          error_message?: string | null
          id?: string
          missing_columns?: string[] | null
          status?: string
        }
        Relationships: []
      }
      bcp_version_history: {
        Row: {
          action: string
          after_values: Json
          bcp_id: string
          before_values: Json
          changed_fields: string[]
          id: string
          performed_at: string
          performed_by: string | null
        }
        Insert: {
          action: string
          after_values?: Json
          bcp_id: string
          before_values?: Json
          changed_fields?: string[]
          id?: string
          performed_at?: string
          performed_by?: string | null
        }
        Update: {
          action?: string
          after_values?: Json
          bcp_id?: string
          before_values?: Json
          changed_fields?: string[]
          id?: string
          performed_at?: string
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bcp_version_history_bcp_id_fkey"
            columns: ["bcp_id"]
            isOneToOne: false
            referencedRelation: "business_continuity_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      board_report_archives: {
        Row: {
          content: Json
          created_at: string
          file_url: string | null
          generated_at: string
          generated_by: string | null
          id: string
          is_scheduled: boolean
          metadata: Json | null
          period_end: string | null
          period_start: string | null
          report_type: string
          title: string
        }
        Insert: {
          content?: Json
          created_at?: string
          file_url?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          is_scheduled?: boolean
          metadata?: Json | null
          period_end?: string | null
          period_start?: string | null
          report_type: string
          title: string
        }
        Update: {
          content?: Json
          created_at?: string
          file_url?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          is_scheduled?: boolean
          metadata?: Json | null
          period_end?: string | null
          period_start?: string | null
          report_type?: string
          title?: string
        }
        Relationships: []
      }
      business_continuity_plans: {
        Row: {
          bia_assessment_date: string | null
          bia_criticality_rating: string | null
          bia_financial_impact: number | null
          bia_max_tolerable_downtime: number | null
          bia_operational_impact: string | null
          bia_regulatory_impact: string | null
          bia_reputational_impact: string | null
          business_function: string
          created_at: string
          created_by: string | null
          department: string
          dependencies: string[] | null
          description: string | null
          id: string
          last_tested_date: string | null
          last_updated_date: string
          mitigation_actions: Json | null
          next_test_date: string | null
          owner_id: string | null
          recovery_point_objective: number | null
          recovery_time_objective: number | null
          reference_number: string | null
          status: Database["public"]["Enums"]["bcp_status"]
          supporting_documents: Json | null
          test_findings: Json | null
          test_results: string | null
          test_scope: string | null
          test_status: Database["public"]["Enums"]["test_status"]
          test_type: string | null
          title: string
          updated_at: string
        }
        Insert: {
          bia_assessment_date?: string | null
          bia_criticality_rating?: string | null
          bia_financial_impact?: number | null
          bia_max_tolerable_downtime?: number | null
          bia_operational_impact?: string | null
          bia_regulatory_impact?: string | null
          bia_reputational_impact?: string | null
          business_function: string
          created_at?: string
          created_by?: string | null
          department: string
          dependencies?: string[] | null
          description?: string | null
          id?: string
          last_tested_date?: string | null
          last_updated_date?: string
          mitigation_actions?: Json | null
          next_test_date?: string | null
          owner_id?: string | null
          recovery_point_objective?: number | null
          recovery_time_objective?: number | null
          reference_number?: string | null
          status?: Database["public"]["Enums"]["bcp_status"]
          supporting_documents?: Json | null
          test_findings?: Json | null
          test_results?: string | null
          test_scope?: string | null
          test_status?: Database["public"]["Enums"]["test_status"]
          test_type?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          bia_assessment_date?: string | null
          bia_criticality_rating?: string | null
          bia_financial_impact?: number | null
          bia_max_tolerable_downtime?: number | null
          bia_operational_impact?: string | null
          bia_regulatory_impact?: string | null
          bia_reputational_impact?: string | null
          business_function?: string
          created_at?: string
          created_by?: string | null
          department?: string
          dependencies?: string[] | null
          description?: string | null
          id?: string
          last_tested_date?: string | null
          last_updated_date?: string
          mitigation_actions?: Json | null
          next_test_date?: string | null
          owner_id?: string | null
          recovery_point_objective?: number | null
          recovery_time_objective?: number | null
          reference_number?: string | null
          status?: Database["public"]["Enums"]["bcp_status"]
          supporting_documents?: Json | null
          test_findings?: Json | null
          test_results?: string | null
          test_scope?: string | null
          test_status?: Database["public"]["Enums"]["test_status"]
          test_type?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      control_documents: {
        Row: {
          created_at: string
          created_by: string | null
          department: string | null
          description: string | null
          document_number: string | null
          document_type: Database["public"]["Enums"]["document_type"]
          effective_date: string | null
          file_extension: string | null
          file_size: number | null
          file_url: string | null
          id: string
          metadata: Json | null
          mfiles_id: string | null
          next_review_date: string | null
          owner_id: string | null
          review_date: string | null
          status: Database["public"]["Enums"]["document_status"]
          title: string
          updated_at: string
          version: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          document_number?: string | null
          document_type: Database["public"]["Enums"]["document_type"]
          effective_date?: string | null
          file_extension?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          metadata?: Json | null
          mfiles_id?: string | null
          next_review_date?: string | null
          owner_id?: string | null
          review_date?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          title: string
          updated_at?: string
          version?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          document_number?: string | null
          document_type?: Database["public"]["Enums"]["document_type"]
          effective_date?: string | null
          file_extension?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          metadata?: Json | null
          mfiles_id?: string | null
          next_review_date?: string | null
          owner_id?: string | null
          review_date?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          title?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      departments: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_acknowledgments: {
        Row: {
          acknowledged_at: string
          document_id: string
          id: string
          user_id: string
          version_acknowledged: string
        }
        Insert: {
          acknowledged_at?: string
          document_id: string
          id?: string
          user_id: string
          version_acknowledged: string
        }
        Update: {
          acknowledged_at?: string
          document_id?: string
          id?: string
          user_id?: string
          version_acknowledged?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_acknowledgments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "control_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      forum_discussions: {
        Row: {
          author_id: string
          category_id: string
          content: string
          created_at: string
          id: string
          is_locked: boolean | null
          is_moderated: boolean | null
          is_pinned: boolean | null
          last_activity_at: string | null
          reply_count: number | null
          title: string
          updated_at: string
          updated_by: string | null
          view_count: number | null
        }
        Insert: {
          author_id: string
          category_id: string
          content: string
          created_at?: string
          id?: string
          is_locked?: boolean | null
          is_moderated?: boolean | null
          is_pinned?: boolean | null
          last_activity_at?: string | null
          reply_count?: number | null
          title: string
          updated_at?: string
          updated_by?: string | null
          view_count?: number | null
        }
        Update: {
          author_id?: string
          category_id?: string
          content?: string
          created_at?: string
          id?: string
          is_locked?: boolean | null
          is_moderated?: boolean | null
          is_pinned?: boolean | null
          last_activity_at?: string | null
          reply_count?: number | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "forum_discussions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "forum_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_moderation_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          moderator_id: string
          reason: string | null
          target_id: string
          target_type: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          moderator_id: string
          reason?: string | null
          target_id: string
          target_type: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          moderator_id?: string
          reason?: string | null
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      forum_posts: {
        Row: {
          author_id: string
          content: string
          created_at: string
          discussion_id: string
          id: string
          is_locked: boolean
          is_moderated: boolean | null
          parent_post_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          discussion_id: string
          id?: string
          is_locked?: boolean
          is_moderated?: boolean | null
          parent_post_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          discussion_id?: string
          id?: string
          is_locked?: boolean
          is_moderated?: boolean | null
          parent_post_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "forum_posts_discussion_id_fkey"
            columns: ["discussion_id"]
            isOneToOne: false
            referencedRelation: "forum_discussions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_posts_parent_post_id_fkey"
            columns: ["parent_post_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_votes: {
        Row: {
          created_at: string
          discussion_id: string | null
          id: string
          post_id: string | null
          user_id: string
          vote_type: string
        }
        Insert: {
          created_at?: string
          discussion_id?: string | null
          id?: string
          post_id?: string | null
          user_id: string
          vote_type: string
        }
        Update: {
          created_at?: string
          discussion_id?: string | null
          id?: string
          post_id?: string | null
          user_id?: string
          vote_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_votes_discussion_id_fkey"
            columns: ["discussion_id"]
            isOneToOne: false
            referencedRelation: "forum_discussions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          appetite_in_app: boolean
          approvals_in_app: boolean
          bcp_changes_email: boolean | null
          bcp_changes_in_app: boolean
          created_at: string
          document_uploads_email: boolean | null
          document_uploads_in_app: boolean
          email_enabled: boolean | null
          id: string
          in_app_enabled: boolean | null
          quiet_hours_enabled: boolean
          quiet_hours_end: string
          quiet_hours_start: string
          risk_updates_email: boolean | null
          risk_updates_in_app: boolean
          system_alerts_email: boolean | null
          system_alerts_in_app: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          appetite_in_app?: boolean
          approvals_in_app?: boolean
          bcp_changes_email?: boolean | null
          bcp_changes_in_app?: boolean
          created_at?: string
          document_uploads_email?: boolean | null
          document_uploads_in_app?: boolean
          email_enabled?: boolean | null
          id?: string
          in_app_enabled?: boolean | null
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          risk_updates_email?: boolean | null
          risk_updates_in_app?: boolean
          system_alerts_email?: boolean | null
          system_alerts_in_app?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          appetite_in_app?: boolean
          approvals_in_app?: boolean
          bcp_changes_email?: boolean | null
          bcp_changes_in_app?: boolean
          created_at?: string
          document_uploads_email?: boolean | null
          document_uploads_in_app?: boolean
          email_enabled?: boolean | null
          id?: string
          in_app_enabled?: boolean | null
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          risk_updates_email?: boolean | null
          risk_updates_in_app?: boolean
          system_alerts_email?: boolean | null
          system_alerts_in_app?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          category: string
          created_at: string
          expires_at: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          resource_id: string | null
          resource_type: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      number_sequences: {
        Row: {
          created_at: string
          current_sequence: number
          entity_type: string
          id: string
          pad_length: number
          period_yymm: string
          prefix: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_sequence?: number
          entity_type: string
          id?: string
          pad_length?: number
          period_yymm: string
          prefix: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_sequence?: number
          entity_type?: string
          id?: string
          pad_length?: number
          period_yymm?: string
          prefix?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          department: string | null
          email: string
          full_name: string | null
          id: string
          is_locked: boolean
          locked_at: string | null
          locked_reason: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email: string
          full_name?: string | null
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_reason?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_reason?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recovery_checklists: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          estimated_time_minutes: number | null
          id: string
          is_active: boolean | null
          prerequisites: Json | null
          priority: string
          steps: Json
          title: string
          updated_at: string
          validation_steps: Json | null
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          estimated_time_minutes?: number | null
          id?: string
          is_active?: boolean | null
          prerequisites?: Json | null
          priority?: string
          steps?: Json
          title: string
          updated_at?: string
          validation_steps?: Json | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          estimated_time_minutes?: number | null
          id?: string
          is_active?: boolean | null
          prerequisites?: Json | null
          priority?: string
          steps?: Json
          title?: string
          updated_at?: string
          validation_steps?: Json | null
        }
        Relationships: []
      }
      report_schedules: {
        Row: {
          created_at: string
          created_by: string | null
          frequency: string
          id: string
          is_active: boolean | null
          last_run_at: string | null
          metadata: Json | null
          next_run_at: string
          recipients: Json | null
          report_type: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          frequency: string
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          metadata?: Json | null
          next_run_at: string
          recipients?: Json | null
          report_type: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          frequency?: string
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          metadata?: Json | null
          next_run_at?: string
          recipients?: Json | null
          report_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      risk_appetite_config: {
        Row: {
          category: Database["public"]["Enums"]["risk_category"] | null
          created_at: string
          created_by: string | null
          description: string | null
          escalation_action: string
          id: string
          is_active: boolean
          risk_type: Database["public"]["Enums"]["risk_type"]
          taxpayer_segment: string | null
          threshold_score: number
          tolerance_level: string
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["risk_category"] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          escalation_action?: string
          id?: string
          is_active?: boolean
          risk_type: Database["public"]["Enums"]["risk_type"]
          taxpayer_segment?: string | null
          threshold_score: number
          tolerance_level: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["risk_category"] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          escalation_action?: string
          id?: string
          is_active?: boolean
          risk_type?: Database["public"]["Enums"]["risk_type"]
          taxpayer_segment?: string | null
          threshold_score?: number
          tolerance_level?: string
          updated_at?: string
        }
        Relationships: []
      }
      risk_assessments: {
        Row: {
          answers: Json
          assessed_by: string | null
          assessment_date: string
          assessment_type: string
          control_score: number | null
          created_at: string
          id: string
          impact: number
          likelihood: number
          notes: string | null
          risk_id: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          answers?: Json
          assessed_by?: string | null
          assessment_date?: string
          assessment_type?: string
          control_score?: number | null
          created_at?: string
          id?: string
          impact: number
          likelihood: number
          notes?: string | null
          risk_id: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          answers?: Json
          assessed_by?: string | null
          assessment_date?: string
          assessment_type?: string
          control_score?: number | null
          created_at?: string
          id?: string
          impact?: number
          likelihood?: number
          notes?: string | null
          risk_id?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_assessments_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "compliance_risk_register_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_assessments_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "risks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_assessments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "assessment_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_attachments: {
        Row: {
          attachment_type: string
          created_at: string
          description: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          risk_id: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          attachment_type?: string
          created_at?: string
          description?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          risk_id: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          attachment_type?: string
          created_at?: string
          description?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          risk_id?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_attachments_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "compliance_risk_register_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_attachments_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "risks"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_audit_logs: {
        Row: {
          action: string
          changes: Json | null
          id: string
          performed_at: string
          performed_by: string
          risk_id: string
        }
        Insert: {
          action: string
          changes?: Json | null
          id?: string
          performed_at?: string
          performed_by: string
          risk_id: string
        }
        Update: {
          action?: string
          changes?: Json | null
          id?: string
          performed_at?: string
          performed_by?: string
          risk_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_audit_logs_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "admin_auth_overview"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "risk_audit_logs_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "risk_audit_logs_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "compliance_risk_register_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_audit_logs_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "risks"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          risk_type: Database["public"]["Enums"]["risk_type"]
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          risk_type?: Database["public"]["Enums"]["risk_type"]
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          risk_type?: Database["public"]["Enums"]["risk_type"]
          updated_at?: string
        }
        Relationships: []
      }
      risk_category_audit_logs: {
        Row: {
          action: string
          category_id: string | null
          category_name: string | null
          changes: Json | null
          id: string
          performed_at: string
          performed_by: string | null
          reason: string | null
          risk_type: Database["public"]["Enums"]["risk_type"] | null
        }
        Insert: {
          action: string
          category_id?: string | null
          category_name?: string | null
          changes?: Json | null
          id?: string
          performed_at?: string
          performed_by?: string | null
          reason?: string | null
          risk_type?: Database["public"]["Enums"]["risk_type"] | null
        }
        Update: {
          action?: string
          category_id?: string | null
          category_name?: string | null
          changes?: Json | null
          id?: string
          performed_at?: string
          performed_by?: string | null
          reason?: string | null
          risk_type?: Database["public"]["Enums"]["risk_type"] | null
        }
        Relationships: []
      }
      risk_controls: {
        Row: {
          control_name: string
          control_type: string
          created_at: string
          created_by: string | null
          description: string | null
          effectiveness_rating: string
          id: string
          last_tested_date: string | null
          next_test_date: string | null
          owner_id: string | null
          risk_id: string
          status: string
          test_frequency: string
          updated_at: string
        }
        Insert: {
          control_name: string
          control_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          effectiveness_rating?: string
          id?: string
          last_tested_date?: string | null
          next_test_date?: string | null
          owner_id?: string | null
          risk_id: string
          status?: string
          test_frequency?: string
          updated_at?: string
        }
        Update: {
          control_name?: string
          control_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          effectiveness_rating?: string
          id?: string
          last_tested_date?: string | null
          next_test_date?: string | null
          owner_id?: string | null
          risk_id?: string
          status?: string
          test_frequency?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_controls_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "compliance_risk_register_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_controls_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "risks"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_events: {
        Row: {
          corrective_actions: Json | null
          created_at: string
          description: string
          discovered_date: string | null
          event_date: string | null
          event_description: string | null
          event_type: string
          financial_impact: number | null
          financial_impact_currency: string | null
          id: string
          immediate_response: string | null
          impact_amount: number | null
          impact_description: string | null
          lessons_learned: string | null
          metadata: Json | null
          occurred_at: string
          operational_impact: string | null
          owner_id: string | null
          reference_number: string | null
          reported_by: string | null
          reputational_impact: string | null
          resolution_date: string | null
          resolution_notes: string | null
          resolved_at: string | null
          risk_id: string | null
          risk_posture: string | null
          root_cause: string | null
          severity: string | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          corrective_actions?: Json | null
          created_at?: string
          description: string
          discovered_date?: string | null
          event_date?: string | null
          event_description?: string | null
          event_type?: string
          financial_impact?: number | null
          financial_impact_currency?: string | null
          id?: string
          immediate_response?: string | null
          impact_amount?: number | null
          impact_description?: string | null
          lessons_learned?: string | null
          metadata?: Json | null
          occurred_at?: string
          operational_impact?: string | null
          owner_id?: string | null
          reference_number?: string | null
          reported_by?: string | null
          reputational_impact?: string | null
          resolution_date?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          risk_id?: string | null
          risk_posture?: string | null
          root_cause?: string | null
          severity?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          corrective_actions?: Json | null
          created_at?: string
          description?: string
          discovered_date?: string | null
          event_date?: string | null
          event_description?: string | null
          event_type?: string
          financial_impact?: number | null
          financial_impact_currency?: string | null
          id?: string
          immediate_response?: string | null
          impact_amount?: number | null
          impact_description?: string | null
          lessons_learned?: string | null
          metadata?: Json | null
          occurred_at?: string
          operational_impact?: string | null
          owner_id?: string | null
          reference_number?: string | null
          reported_by?: string | null
          reputational_impact?: string | null
          resolution_date?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          risk_id?: string | null
          risk_posture?: string | null
          root_cause?: string | null
          severity?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_events_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "compliance_risk_register_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_events_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "risks"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_history: {
        Row: {
          change_type: string
          changed_at: string
          changed_by: string | null
          id: string
          risk_id: string
          snapshot: Json
        }
        Insert: {
          change_type?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          risk_id: string
          snapshot: Json
        }
        Update: {
          change_type?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          risk_id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "risk_history_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "compliance_risk_register_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_history_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "risks"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_mitigation_task_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_status: string | null
          id: string
          note: string | null
          risk_id: string
          task_id: string
          to_status: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          note?: string | null
          risk_id: string
          task_id: string
          to_status: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          note?: string | null
          risk_id?: string
          task_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_mitigation_task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "risk_mitigation_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_mitigation_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          evidence_notes: string | null
          id: string
          priority: string
          risk_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          evidence_notes?: string | null
          id?: string
          priority?: string
          risk_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          evidence_notes?: string | null
          id?: string
          priority?: string
          risk_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      risk_scoring_matrix: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          impact_level: number
          likelihood_level: number
          risk_level: string
          risk_score: number
          updated_at: string
        }
        Insert: {
          color: string
          created_at?: string
          description?: string | null
          id?: string
          impact_level: number
          likelihood_level: number
          risk_level: string
          risk_score: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          impact_level?: number
          likelihood_level?: number
          risk_level?: string
          risk_score?: number
          updated_at?: string
        }
        Relationships: []
      }
      risks: {
        Row: {
          actual_impact_amount: number | null
          ai_analyzed_at: string | null
          ai_confidence: number | null
          ai_predicted_score: number | null
          ai_recommended_impact: number | null
          ai_recommended_likelihood: number | null
          ai_score_explanation: string | null
          ai_score_generated_at: string | null
          ai_score_reasoning: string | null
          ai_score_status: string | null
          approval_status: Database["public"]["Enums"]["approval_status"]
          approved_at: string | null
          approved_by: string | null
          assigned_to_id: string | null
          category: Database["public"]["Enums"]["risk_category"]
          compliance_description: string | null
          control_effectiveness_rating: string | null
          control_effectiveness_score: number | null
          created_at: string
          created_by: string | null
          crystallization_status: string | null
          crystallized_at: string | null
          current_reviewer_id: string | null
          department: string | null
          description: string
          estimated_tax_at_risk: number | null
          flagged_for_audit: boolean | null
          id: string
          information_sources: string | null
          inherent_impact: number
          inherent_impact_rationale: string | null
          inherent_likelihood: number
          inherent_likelihood_rationale: string | null
          last_review_comment: string | null
          mitigation_actions: Json | null
          mitigation_budget: number | null
          mitigation_budget_currency: string
          mitigation_budget_spent: number | null
          mitigation_plan: string | null
          monitoring_officer_id: string | null
          owner_id: string | null
          post_control_assessed_at: string | null
          post_control_assessed_by: string | null
          post_control_impact: number | null
          post_control_likelihood: number | null
          post_control_notes: string | null
          pre_submission_status:
            | Database["public"]["Enums"]["risk_status"]
            | null
          residual_impact: number
          residual_impact_rationale: string | null
          residual_likelihood: number
          residual_likelihood_rationale: string | null
          returned_at: string | null
          returned_by: string | null
          review_date: string | null
          review_frequency: string | null
          risk_reference: string | null
          risk_type: Database["public"]["Enums"]["risk_type"]
          status: Database["public"]["Enums"]["risk_status"]
          strategic_objective: string | null
          submitted_at: string | null
          submitted_by: string | null
          target_control_score: number | null
          target_date: string | null
          tax_sector: string | null
          tax_sub_sector: string | null
          tax_type: string | null
          taxpayer_segment: string | null
          title: string
          treatment_owner_id: string | null
          treatment_strategy: string | null
          treatment_timeline: string | null
          updated_at: string
        }
        Insert: {
          actual_impact_amount?: number | null
          ai_analyzed_at?: string | null
          ai_confidence?: number | null
          ai_predicted_score?: number | null
          ai_recommended_impact?: number | null
          ai_recommended_likelihood?: number | null
          ai_score_explanation?: string | null
          ai_score_generated_at?: string | null
          ai_score_reasoning?: string | null
          ai_score_status?: string | null
          approval_status?: Database["public"]["Enums"]["approval_status"]
          approved_at?: string | null
          approved_by?: string | null
          assigned_to_id?: string | null
          category: Database["public"]["Enums"]["risk_category"]
          compliance_description?: string | null
          control_effectiveness_rating?: string | null
          control_effectiveness_score?: number | null
          created_at?: string
          created_by?: string | null
          crystallization_status?: string | null
          crystallized_at?: string | null
          current_reviewer_id?: string | null
          department?: string | null
          description: string
          estimated_tax_at_risk?: number | null
          flagged_for_audit?: boolean | null
          id?: string
          information_sources?: string | null
          inherent_impact: number
          inherent_impact_rationale?: string | null
          inherent_likelihood: number
          inherent_likelihood_rationale?: string | null
          last_review_comment?: string | null
          mitigation_actions?: Json | null
          mitigation_budget?: number | null
          mitigation_budget_currency?: string
          mitigation_budget_spent?: number | null
          mitigation_plan?: string | null
          monitoring_officer_id?: string | null
          owner_id?: string | null
          post_control_assessed_at?: string | null
          post_control_assessed_by?: string | null
          post_control_impact?: number | null
          post_control_likelihood?: number | null
          post_control_notes?: string | null
          pre_submission_status?:
            | Database["public"]["Enums"]["risk_status"]
            | null
          residual_impact: number
          residual_impact_rationale?: string | null
          residual_likelihood: number
          residual_likelihood_rationale?: string | null
          returned_at?: string | null
          returned_by?: string | null
          review_date?: string | null
          review_frequency?: string | null
          risk_reference?: string | null
          risk_type?: Database["public"]["Enums"]["risk_type"]
          status?: Database["public"]["Enums"]["risk_status"]
          strategic_objective?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          target_control_score?: number | null
          target_date?: string | null
          tax_sector?: string | null
          tax_sub_sector?: string | null
          tax_type?: string | null
          taxpayer_segment?: string | null
          title: string
          treatment_owner_id?: string | null
          treatment_strategy?: string | null
          treatment_timeline?: string | null
          updated_at?: string
        }
        Update: {
          actual_impact_amount?: number | null
          ai_analyzed_at?: string | null
          ai_confidence?: number | null
          ai_predicted_score?: number | null
          ai_recommended_impact?: number | null
          ai_recommended_likelihood?: number | null
          ai_score_explanation?: string | null
          ai_score_generated_at?: string | null
          ai_score_reasoning?: string | null
          ai_score_status?: string | null
          approval_status?: Database["public"]["Enums"]["approval_status"]
          approved_at?: string | null
          approved_by?: string | null
          assigned_to_id?: string | null
          category?: Database["public"]["Enums"]["risk_category"]
          compliance_description?: string | null
          control_effectiveness_rating?: string | null
          control_effectiveness_score?: number | null
          created_at?: string
          created_by?: string | null
          crystallization_status?: string | null
          crystallized_at?: string | null
          current_reviewer_id?: string | null
          department?: string | null
          description?: string
          estimated_tax_at_risk?: number | null
          flagged_for_audit?: boolean | null
          id?: string
          information_sources?: string | null
          inherent_impact?: number
          inherent_impact_rationale?: string | null
          inherent_likelihood?: number
          inherent_likelihood_rationale?: string | null
          last_review_comment?: string | null
          mitigation_actions?: Json | null
          mitigation_budget?: number | null
          mitigation_budget_currency?: string
          mitigation_budget_spent?: number | null
          mitigation_plan?: string | null
          monitoring_officer_id?: string | null
          owner_id?: string | null
          post_control_assessed_at?: string | null
          post_control_assessed_by?: string | null
          post_control_impact?: number | null
          post_control_likelihood?: number | null
          post_control_notes?: string | null
          pre_submission_status?:
            | Database["public"]["Enums"]["risk_status"]
            | null
          residual_impact?: number
          residual_impact_rationale?: string | null
          residual_likelihood?: number
          residual_likelihood_rationale?: string | null
          returned_at?: string | null
          returned_by?: string | null
          review_date?: string | null
          review_frequency?: string | null
          risk_reference?: string | null
          risk_type?: Database["public"]["Enums"]["risk_type"]
          status?: Database["public"]["Enums"]["risk_status"]
          strategic_objective?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          target_control_score?: number | null
          target_date?: string | null
          tax_sector?: string | null
          tax_sub_sector?: string | null
          tax_type?: string | null
          taxpayer_segment?: string | null
          title?: string
          treatment_owner_id?: string | null
          treatment_strategy?: string | null
          treatment_timeline?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "risks_assigned_to_id_fkey"
            columns: ["assigned_to_id"]
            isOneToOne: false
            referencedRelation: "admin_auth_overview"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "risks_assigned_to_id_fkey"
            columns: ["assigned_to_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "risks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_auth_overview"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "risks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "risks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "admin_auth_overview"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "risks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      strategic_objectives: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_audit_logs: {
        Row: {
          action: string
          category: string
          details: Json | null
          id: string
          ip_address: unknown
          performed_at: string
          resource_id: string | null
          resource_type: string | null
          session_id: string | null
          severity: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          category: string
          details?: Json | null
          id?: string
          ip_address?: unknown
          performed_at?: string
          resource_id?: string | null
          resource_type?: string | null
          session_id?: string | null
          severity?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          category?: string
          details?: Json | null
          id?: string
          ip_address?: unknown
          performed_at?: string
          resource_id?: string | null
          resource_type?: string | null
          session_id?: string | null
          severity?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_encrypted: boolean | null
          setting_key: string
          setting_value: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          is_encrypted?: boolean | null
          setting_key: string
          setting_value: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_encrypted?: boolean | null
          setting_key?: string
          setting_value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      template_category_links: {
        Row: {
          category: Database["public"]["Enums"]["risk_category"]
          created_at: string
          id: string
          template_id: string
        }
        Insert: {
          category: Database["public"]["Enums"]["risk_category"]
          created_at?: string
          id?: string
          template_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["risk_category"]
          created_at?: string
          id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_category_links_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "assessment_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_questions: {
        Row: {
          created_at: string
          help_text: string | null
          id: string
          is_required: boolean
          options: Json
          question_text: string
          question_type: string
          section_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          help_text?: string | null
          id?: string
          is_required?: boolean
          options?: Json
          question_text: string
          question_type?: string
          section_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          help_text?: string | null
          id?: string
          is_required?: boolean
          options?: Json
          question_text?: string
          question_type?: string
          section_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_questions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "template_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      template_sections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          sort_order: number
          template_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          sort_order?: number
          template_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          sort_order?: number
          template_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "assessment_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      training_modules: {
        Row: {
          category: string | null
          created_at: string
          csdd_module_id: string | null
          description: string | null
          difficulty_level: string | null
          duration_minutes: number | null
          external_url: string | null
          id: string
          is_active: boolean | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          csdd_module_id?: string | null
          description?: string | null
          difficulty_level?: string | null
          duration_minutes?: number | null
          external_url?: string | null
          id?: string
          is_active?: boolean | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          csdd_module_id?: string | null
          description?: string | null
          difficulty_level?: string | null
          duration_minutes?: number | null
          external_url?: string | null
          id?: string
          is_active?: boolean | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      treatment_strategy_status_map: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          target_status: Database["public"]["Enums"]["risk_status"]
          treatment_strategy: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          target_status: Database["public"]["Enums"]["risk_status"]
          treatment_strategy: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          target_status?: Database["public"]["Enums"]["risk_status"]
          treatment_strategy?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_activity_logs: {
        Row: {
          action: string
          details: Json | null
          id: string
          ip_address: unknown
          performed_at: string
          resource_id: string | null
          resource_type: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          details?: Json | null
          id?: string
          ip_address?: unknown
          performed_at?: string
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          details?: Json | null
          id?: string
          ip_address?: unknown
          performed_at?: string
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_login_history: {
        Row: {
          failure_reason: string | null
          id: string
          ip_address: unknown
          login_at: string
          success: boolean
          user_agent: string | null
          user_id: string
        }
        Insert: {
          failure_reason?: string | null
          id?: string
          ip_address?: unknown
          login_at?: string
          success?: boolean
          user_agent?: string | null
          user_id: string
        }
        Update: {
          failure_reason?: string | null
          id?: string
          ip_address?: unknown
          login_at?: string
          success?: boolean
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          assigned_at: string
          assigned_by: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by: string
          id?: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: []
      }
      whistleblow_attachments: {
        Row: {
          case_id: string
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          uploaded_by: string | null
          uploaded_by_type: string
        }
        Insert: {
          case_id: string
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          uploaded_by?: string | null
          uploaded_by_type?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          uploaded_by?: string | null
          uploaded_by_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "whistleblow_attachments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "whistleblow_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      whistleblow_audit_log: {
        Row: {
          action: string
          case_id: string | null
          details: Json | null
          id: string
          performed_at: string
          performed_by: string | null
        }
        Insert: {
          action: string
          case_id?: string | null
          details?: Json | null
          id?: string
          performed_at?: string
          performed_by?: string | null
        }
        Update: {
          action?: string
          case_id?: string | null
          details?: Json | null
          id?: string
          performed_at?: string
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whistleblow_audit_log_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "whistleblow_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      whistleblow_cases: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          case_number: string | null
          case_reference: string | null
          category: string
          created_at: string
          date_of_incident: string | null
          description: string
          evidence_description: string | null
          evidence_urls: Json | null
          flagged_stagnant: boolean | null
          flagged_unassigned: boolean | null
          follow_up_token: string
          id: string
          incident_date: string | null
          incident_location: string | null
          individuals_involved: string | null
          involved_parties: string | null
          is_anonymous: boolean | null
          location: string | null
          priority: string
          reporter_email: string | null
          reporter_name: string | null
          reporter_passphrase_hash: string | null
          reporter_phone: string | null
          resolution_notes: string | null
          resolved_at: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          case_number?: string | null
          case_reference?: string | null
          category: string
          created_at?: string
          date_of_incident?: string | null
          description: string
          evidence_description?: string | null
          evidence_urls?: Json | null
          flagged_stagnant?: boolean | null
          flagged_unassigned?: boolean | null
          follow_up_token?: string
          id?: string
          incident_date?: string | null
          incident_location?: string | null
          individuals_involved?: string | null
          involved_parties?: string | null
          is_anonymous?: boolean | null
          location?: string | null
          priority?: string
          reporter_email?: string | null
          reporter_name?: string | null
          reporter_passphrase_hash?: string | null
          reporter_phone?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          case_number?: string | null
          case_reference?: string | null
          category?: string
          created_at?: string
          date_of_incident?: string | null
          description?: string
          evidence_description?: string | null
          evidence_urls?: Json | null
          flagged_stagnant?: boolean | null
          flagged_unassigned?: boolean | null
          follow_up_token?: string
          id?: string
          incident_date?: string | null
          incident_location?: string | null
          individuals_involved?: string | null
          involved_parties?: string | null
          is_anonymous?: boolean | null
          location?: string | null
          priority?: string
          reporter_email?: string | null
          reporter_name?: string | null
          reporter_passphrase_hash?: string | null
          reporter_phone?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      whistleblow_messages: {
        Row: {
          attachments: Json | null
          case_id: string
          created_at: string
          id: string
          message: string
          sender_id: string | null
          sender_type: string
        }
        Insert: {
          attachments?: Json | null
          case_id: string
          created_at?: string
          id?: string
          message: string
          sender_id?: string | null
          sender_type: string
        }
        Update: {
          attachments?: Json | null
          case_id?: string
          created_at?: string
          id?: string
          message?: string
          sender_id?: string | null
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "whistleblow_messages_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "whistleblow_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      whistleblow_submission_attempts: {
        Row: {
          attempted_at: string
          fingerprint: string | null
          id: string
          ip_address: string | null
          succeeded: boolean
        }
        Insert: {
          attempted_at?: string
          fingerprint?: string | null
          id?: string
          ip_address?: string | null
          succeeded?: boolean
        }
        Update: {
          attempted_at?: string
          fingerprint?: string | null
          id?: string
          ip_address?: string | null
          succeeded?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      admin_auth_overview: {
        Row: {
          assigned_roles: string[] | null
          created_at: string | null
          department: string | null
          email: string | null
          email_confirmed_at: string | null
          full_name: string | null
          is_locked: boolean | null
          last_sign_in_at: string | null
          locked_at: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          user_id: string | null
        }
        Relationships: []
      }
      compliance_risk_register_view: {
        Row: {
          category: Database["public"]["Enums"]["risk_category"] | null
          compliance_description: string | null
          created_at: string | null
          created_by: string | null
          department: string | null
          description: string | null
          estimated_tax_at_risk: number | null
          id: string | null
          information_sources: string | null
          inherent_impact: number | null
          inherent_likelihood: number | null
          monitoring_officer_id: string | null
          owner_id: string | null
          residual_impact: number | null
          residual_likelihood: number | null
          review_date: string | null
          risk_reference: string | null
          status: Database["public"]["Enums"]["risk_status"] | null
          target_date: string | null
          tax_sector: string | null
          tax_sub_sector: string | null
          tax_type: string | null
          taxpayer_segment: string | null
          title: string | null
          treatment_owner_id: string | null
          treatment_strategy: string | null
          treatment_timeline: string | null
          updated_at: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["risk_category"] | null
          compliance_description?: string | null
          created_at?: string | null
          created_by?: string | null
          department?: string | null
          description?: string | null
          estimated_tax_at_risk?: number | null
          id?: string | null
          information_sources?: string | null
          inherent_impact?: number | null
          inherent_likelihood?: number | null
          monitoring_officer_id?: string | null
          owner_id?: string | null
          residual_impact?: number | null
          residual_likelihood?: number | null
          review_date?: string | null
          risk_reference?: string | null
          status?: Database["public"]["Enums"]["risk_status"] | null
          target_date?: string | null
          tax_sector?: string | null
          tax_sub_sector?: string | null
          tax_type?: string | null
          taxpayer_segment?: string | null
          title?: string | null
          treatment_owner_id?: string | null
          treatment_strategy?: string | null
          treatment_timeline?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["risk_category"] | null
          compliance_description?: string | null
          created_at?: string | null
          created_by?: string | null
          department?: string | null
          description?: string | null
          estimated_tax_at_risk?: number | null
          id?: string | null
          information_sources?: string | null
          inherent_impact?: number | null
          inherent_likelihood?: number | null
          monitoring_officer_id?: string | null
          owner_id?: string | null
          residual_impact?: number | null
          residual_likelihood?: number | null
          review_date?: string | null
          risk_reference?: string | null
          status?: Database["public"]["Enums"]["risk_status"] | null
          target_date?: string | null
          tax_sector?: string | null
          tax_sub_sector?: string | null
          tax_type?: string | null
          taxpayer_segment?: string | null
          title?: string | null
          treatment_owner_id?: string | null
          treatment_strategy?: string | null
          treatment_timeline?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "risks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_auth_overview"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "risks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "risks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "admin_auth_overview"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "risks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      risk_workflow_audit_view: {
        Row: {
          action: string | null
          actor_department: string | null
          actor_email: string | null
          actor_id: string | null
          actor_name: string | null
          actor_role: Database["public"]["Enums"]["user_role"] | null
          comments: string | null
          created_at: string | null
          from_status: Database["public"]["Enums"]["approval_status"] | null
          id: string | null
          metadata: Json | null
          risk_id: string | null
          risk_reference: string | null
          risk_title: string | null
          to_status: Database["public"]["Enums"]["approval_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_history_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "compliance_risk_register_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_history_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "risks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_set_user_locked: {
        Args: { _locked: boolean; _reason?: string; _user_id: string }
        Returns: undefined
      }
      apply_workflow_transition: {
        Args: { p_action: string; p_reason?: string; p_risk_id: string }
        Returns: Json
      }
      can_access_risk: { Args: { _risk_id: string }; Returns: boolean }
      check_whistleblow_rate_limit: {
        Args: {
          _fingerprint: string
          _ip: string
          _max_per_fingerprint?: number
          _max_per_ip?: number
          _window_minutes?: number
        }
        Returns: Json
      }
      clear_failed_login_attempts: {
        Args: { _email: string }
        Returns: undefined
      }
      generate_reference_number: {
        Args: { p_entity_type: string }
        Returns: string
      }
      get_admin_auth_overview: {
        Args: never
        Returns: {
          assigned_roles: string[] | null
          created_at: string | null
          department: string | null
          email: string | null
          email_confirmed_at: string | null
          full_name: string | null
          is_locked: boolean | null
          last_sign_in_at: string | null
          locked_at: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "admin_auth_overview"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_approval_inbox: {
        Args: never
        Returns: {
          age_days: number
          approval_status: Database["public"]["Enums"]["approval_status"]
          bucket: string
          category: Database["public"]["Enums"]["risk_category"]
          department: string
          id: string
          residual_score: number
          returned_at: string
          reviewer_id: string
          reviewer_name: string
          risk_reference: string
          risk_type: Database["public"]["Enums"]["risk_type"]
          status: Database["public"]["Enums"]["risk_status"]
          submitted_at: string
          submitter_name: string
          title: string
        }[]
      }
      get_backup_status_summary: {
        Args: never
        Returns: {
          active_configurations: number
          failed_backups_24h: number
          last_full_backup: string
          next_scheduled_backup: string
          recent_backups_24h: number
          successful_backups_24h: number
          total_configurations: number
        }[]
      }
      get_user_role: {
        Args: { user_uuid: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_user_roles: {
        Args: { user_uuid: string }
        Returns: {
          assigned_at: string
          role: Database["public"]["Enums"]["user_role"]
        }[]
      }
      is_account_locked: { Args: { _email: string }; Returns: boolean }
      is_template_manager: { Args: never; Returns: boolean }
      log_approval_action: {
        Args: {
          p_action: string
          p_comments?: string
          p_metadata?: Json
          p_risk_id: string
          p_to_status: Database["public"]["Enums"]["approval_status"]
        }
        Returns: string
      }
      log_password_change_event: { Args: never; Returns: string }
      log_system_audit: {
        Args: {
          p_action: string
          p_category: string
          p_details?: Json
          p_resource_id?: string
          p_resource_type?: string
          p_severity?: string
          p_user_id: string
        }
        Returns: string
      }
      log_user_activity: {
        Args: {
          p_action: string
          p_details?: Json
          p_resource_id?: string
          p_resource_type?: string
          p_user_id: string
        }
        Returns: string
      }
      record_failed_login: {
        Args: { _email: string; _ip?: string }
        Returns: Json
      }
      reevaluate_risk_appetite: {
        Args: {
          p_actor?: string
          p_category?: Database["public"]["Enums"]["risk_category"]
          p_risk_type?: Database["public"]["Enums"]["risk_type"]
          p_segment?: string
        }
        Returns: Json
      }
      resolve_risk_appetite: {
        Args: {
          p_category: Database["public"]["Enums"]["risk_category"]
          p_risk_type: Database["public"]["Enums"]["risk_type"]
          p_taxpayer_segment: string
        }
        Returns: {
          escalation_action: string
          id: string
          threshold_score: number
          tolerance_level: string
        }[]
      }
      risk_category_usage: {
        Args: { p_category_id: string }
        Returns: {
          category_id: string
          category_name: string
          is_in_use: boolean
          reference_count: number
          risk_type: Database["public"]["Enums"]["risk_type"]
        }[]
      }
      schedule_backup_operation: {
        Args: {
          p_backup_type: string
          p_configuration_id: string
          p_created_by?: string
        }
        Returns: string
      }
      send_notification: {
        Args: {
          p_category?: string
          p_message: string
          p_metadata?: Json
          p_resource_id?: string
          p_resource_type?: string
          p_title: string
          p_type?: string
          p_user_id: string
        }
        Returns: string
      }
      update_mitigation_task_status: {
        Args: { _new_status: string; _note?: string; _task_id: string }
        Returns: undefined
      }
      user_has_role: {
        Args: {
          check_role: Database["public"]["Enums"]["user_role"]
          user_uuid: string
        }
        Returns: boolean
      }
    }
    Enums: {
      approval_status:
        | "Draft"
        | "Submitted"
        | "Under Review"
        | "Approved"
        | "Returned"
      bcp_status: "Ready" | "Needs Review" | "Outdated"
      document_status:
        | "Draft"
        | "Under Review"
        | "Approved"
        | "Archived"
        | "Superseded"
      document_type:
        | "Policy"
        | "SOP"
        | "Risk Framework"
        | "Procedure"
        | "Guideline"
        | "Standard"
      risk_category:
        | "Strategic"
        | "Operational"
        | "Financial"
        | "Compliance"
        | "Technology"
        | "Reputational"
        | "Environmental"
        | "Human Resources"
        | "Registration"
        | "Filing"
        | "Disclosure/Reporting"
        | "Payment"
        | "Security, Safety & Health"
        | "Information Security"
        | "Environmental, Social & Governance - ESG"
        | "TEST"
      risk_status:
        | "New"
        | "In Review"
        | "Mitigated"
        | "Escalated"
        | "Crystallized"
        | "Draft"
        | "Submitted"
        | "Approved"
      risk_type: "institutional" | "compliance"
      test_status: "Not Tested" | "Passed" | "Failed" | "Overdue"
      user_role:
        | "RC"
        | "RR"
        | "RO"
        | "RMD"
        | "CRO"
        | "ERMSC"
        | "EC"
        | "RCB"
        | "ADMIN"
        | "USER"
        | "SUPERVISOR"
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
    Enums: {
      approval_status: [
        "Draft",
        "Submitted",
        "Under Review",
        "Approved",
        "Returned",
      ],
      bcp_status: ["Ready", "Needs Review", "Outdated"],
      document_status: [
        "Draft",
        "Under Review",
        "Approved",
        "Archived",
        "Superseded",
      ],
      document_type: [
        "Policy",
        "SOP",
        "Risk Framework",
        "Procedure",
        "Guideline",
        "Standard",
      ],
      risk_category: [
        "Strategic",
        "Operational",
        "Financial",
        "Compliance",
        "Technology",
        "Reputational",
        "Environmental",
        "Human Resources",
        "Registration",
        "Filing",
        "Disclosure/Reporting",
        "Payment",
        "Security, Safety & Health",
        "Information Security",
        "Environmental, Social & Governance - ESG",
        "TEST",
      ],
      risk_status: [
        "New",
        "In Review",
        "Mitigated",
        "Escalated",
        "Crystallized",
        "Draft",
        "Submitted",
        "Approved",
      ],
      risk_type: ["institutional", "compliance"],
      test_status: ["Not Tested", "Passed", "Failed", "Overdue"],
      user_role: [
        "RC",
        "RR",
        "RO",
        "RMD",
        "CRO",
        "ERMSC",
        "EC",
        "RCB",
        "ADMIN",
        "USER",
        "SUPERVISOR",
      ],
    },
  },
} as const
