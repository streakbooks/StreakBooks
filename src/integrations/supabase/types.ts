export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      accounting_periods: {
        Row: {
          company_id: string;
          created_at: string;
          end_date: string;
          id: string;
          locked_at: string | null;
          locked_by: string | null;
          name: string;
          start_date: string;
          status: Database["public"]["Enums"]["period_status"];
        };
        Insert: {
          company_id: string;
          created_at?: string;
          end_date: string;
          id?: string;
          locked_at?: string | null;
          locked_by?: string | null;
          name: string;
          start_date: string;
          status?: Database["public"]["Enums"]["period_status"];
        };
        Update: {
          company_id?: string;
          created_at?: string;
          end_date?: string;
          id?: string;
          locked_at?: string | null;
          locked_by?: string | null;
          name?: string;
          start_date?: string;
          status?: Database["public"]["Enums"]["period_status"];
        };
        Relationships: [
          {
            foreignKeyName: "accounting_periods_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      accounts: {
        Row: {
          account_kind: string | null;
          account_number_masked: string | null;
          account_type: Database["public"]["Enums"]["account_type"];
          archived_at: string | null;
          archived_by: string | null;
          bank_name: string | null;
          cash_flow_class: string | null;
          catalog_key: string | null;
          code: string;
          company_id: string;
          created_at: string;
          created_by: string | null;
          currency_code: string | null;
          default_tax_code_id: string | null;
          description: string | null;
          detail_type: string | null;
          fs_line: string | null;
          id: string;
          is_active: boolean;
          is_control: boolean;
          is_header: boolean;
          is_locked: boolean;
          is_payment_enabled: boolean;
          is_postable: boolean;
          is_system: boolean;
          name: string;
          normal_balance: Database["public"]["Enums"]["normal_balance"];
          parent_id: string | null;
          recommendation_level: string | null;
          show_in_expense_claims: boolean;
          show_on_dashboard_watchlist: boolean;
          sort_order: number;
          source: string;
          statutory_mapping: Json;
          subtype: string | null;
          system_key: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          account_kind?: string | null;
          account_number_masked?: string | null;
          account_type: Database["public"]["Enums"]["account_type"];
          archived_at?: string | null;
          archived_by?: string | null;
          bank_name?: string | null;
          cash_flow_class?: string | null;
          catalog_key?: string | null;
          code: string;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          currency_code?: string | null;
          default_tax_code_id?: string | null;
          description?: string | null;
          detail_type?: string | null;
          fs_line?: string | null;
          id?: string;
          is_active?: boolean;
          is_control?: boolean;
          is_header?: boolean;
          is_locked?: boolean;
          is_payment_enabled?: boolean;
          is_postable?: boolean;
          is_system?: boolean;
          name: string;
          normal_balance: Database["public"]["Enums"]["normal_balance"];
          parent_id?: string | null;
          recommendation_level?: string | null;
          show_in_expense_claims?: boolean;
          show_on_dashboard_watchlist?: boolean;
          sort_order?: number;
          source?: string;
          statutory_mapping?: Json;
          subtype?: string | null;
          system_key?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          account_kind?: string | null;
          account_number_masked?: string | null;
          account_type?: Database["public"]["Enums"]["account_type"];
          archived_at?: string | null;
          archived_by?: string | null;
          bank_name?: string | null;
          cash_flow_class?: string | null;
          catalog_key?: string | null;
          code?: string;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          currency_code?: string | null;
          default_tax_code_id?: string | null;
          description?: string | null;
          detail_type?: string | null;
          fs_line?: string | null;
          id?: string;
          is_active?: boolean;
          is_control?: boolean;
          is_header?: boolean;
          is_locked?: boolean;
          is_payment_enabled?: boolean;
          is_postable?: boolean;
          is_system?: boolean;
          name?: string;
          normal_balance?: Database["public"]["Enums"]["normal_balance"];
          parent_id?: string | null;
          recommendation_level?: string | null;
          show_in_expense_claims?: boolean;
          show_on_dashboard_watchlist?: boolean;
          sort_order?: number;
          source?: string;
          statutory_mapping?: Json;
          subtype?: string | null;
          system_key?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "accounts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "accounts_default_tax_code_id_fkey";
            columns: ["default_tax_code_id"];
            isOneToOne: false;
            referencedRelation: "tax_codes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "accounts_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      action_document_requests: {
        Row: {
          attachment_id: string | null;
          cancelled_at: string | null;
          company_id: string;
          completed_at: string | null;
          created_at: string;
          id: string;
          instructions: string;
          requested_by: string;
          requested_from: string;
          subject: string;
        };
        Insert: {
          attachment_id?: string | null;
          cancelled_at?: string | null;
          company_id: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          instructions?: string;
          requested_by: string;
          requested_from: string;
          subject: string;
        };
        Update: {
          attachment_id?: string | null;
          cancelled_at?: string | null;
          company_id?: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          instructions?: string;
          requested_by?: string;
          requested_from?: string;
          subject?: string;
        };
        Relationships: [
          {
            foreignKeyName: "action_document_requests_attachment_id_fkey";
            columns: ["attachment_id"];
            isOneToOne: false;
            referencedRelation: "document_attachments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_document_requests_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      action_notification_preferences: {
        Row: {
          category: string;
          company_id: string;
          enabled: boolean;
          recipient_user_id: string;
          updated_at: string;
        };
        Insert: {
          category: string;
          company_id: string;
          enabled?: boolean;
          recipient_user_id: string;
          updated_at?: string;
        };
        Update: {
          category?: string;
          company_id?: string;
          enabled?: boolean;
          recipient_user_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "action_notification_preferences_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      action_notification_refresh_state: {
        Row: {
          company_id: string;
          last_refreshed_at: string;
          recipient_user_id: string;
        };
        Insert: {
          company_id: string;
          last_refreshed_at?: string;
          recipient_user_id: string;
        };
        Update: {
          company_id?: string;
          last_refreshed_at?: string;
          recipient_user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "action_notification_refresh_state_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      action_notifications: {
        Row: {
          action_kind: string;
          archived_at: string | null;
          body: string;
          category: string;
          company_id: string;
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          event_key: string;
          id: string;
          priority: string;
          read_at: string | null;
          recipient_user_id: string;
          resolved_at: string | null;
          target_path: string | null;
          title: string;
        };
        Insert: {
          action_kind?: string;
          archived_at?: string | null;
          body?: string;
          category: string;
          company_id: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          event_key: string;
          id?: string;
          priority?: string;
          read_at?: string | null;
          recipient_user_id: string;
          resolved_at?: string | null;
          target_path?: string | null;
          title: string;
        };
        Update: {
          action_kind?: string;
          archived_at?: string | null;
          body?: string;
          category?: string;
          company_id?: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          event_key?: string;
          id?: string;
          priority?: string;
          read_at?: string | null;
          recipient_user_id?: string;
          resolved_at?: string | null;
          target_path?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "action_notifications_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_suggestions: {
        Row: {
          applied_journal_id: string | null;
          company_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          intent: string;
          payload: Json;
          status: string;
          summary: string;
          title: string;
          updated_at: string;
          validation_errors: Json;
        };
        Insert: {
          applied_journal_id?: string | null;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          intent: string;
          payload?: Json;
          status?: string;
          summary?: string;
          title?: string;
          updated_at?: string;
          validation_errors?: Json;
        };
        Update: {
          applied_journal_id?: string | null;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          intent?: string;
          payload?: Json;
          status?: string;
          summary?: string;
          title?: string;
          updated_at?: string;
          validation_errors?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "ai_suggestions_applied_journal_id_fkey";
            columns: ["applied_journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_suggestions_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_usage_events: {
        Row: {
          company_id: string;
          created_at: string;
          error_code: string | null;
          estimated_tokens: number;
          id: string;
          intent: string;
          latency_ms: number | null;
          model: string | null;
          prompt_chars: number;
          provider: string | null;
          status: string;
          user_id: string | null;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          error_code?: string | null;
          estimated_tokens?: number;
          id?: string;
          intent: string;
          latency_ms?: number | null;
          model?: string | null;
          prompt_chars?: number;
          provider?: string | null;
          status: string;
          user_id?: string | null;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          error_code?: string | null;
          estimated_tokens?: number;
          id?: string;
          intent?: string;
          latency_ms?: number | null;
          model?: string | null;
          prompt_chars?: number;
          provider?: string | null;
          status?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      approval_requests: {
        Row: {
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          decision_reason: string | null;
          expires_at: string;
          id: string;
          impact: Json;
          kind: string;
          payload: Json;
          reason: string;
          requester_id: string;
          status: string;
        };
        Insert: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_reason?: string | null;
          expires_at: string;
          id?: string;
          impact?: Json;
          kind: string;
          payload?: Json;
          reason: string;
          requester_id: string;
          status?: string;
        };
        Update: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_reason?: string | null;
          expires_at?: string;
          id?: string;
          impact?: Json;
          kind?: string;
          payload?: Json;
          reason?: string;
          requester_id?: string;
          status?: string;
        };
        Relationships: [];
      };
      asset_depreciation_entries: {
        Row: {
          amount_minor: number;
          asset_id: string;
          company_id: string;
          created_at: string;
          id: string;
          journal_id: string;
          period_end: string;
          run_id: string;
        };
        Insert: {
          amount_minor: number;
          asset_id: string;
          company_id: string;
          created_at?: string;
          id?: string;
          journal_id: string;
          period_end: string;
          run_id: string;
        };
        Update: {
          amount_minor?: number;
          asset_id?: string;
          company_id?: string;
          created_at?: string;
          id?: string;
          journal_id?: string;
          period_end?: string;
          run_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "asset_depreciation_entries_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "fixed_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "asset_depreciation_entries_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "asset_depreciation_entries_journal_id_fkey";
            columns: ["journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "asset_depreciation_entries_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "asset_depreciation_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      asset_depreciation_runs: {
        Row: {
          asset_count: number;
          company_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          journal_id: string | null;
          period_end: string;
          total_minor: number;
        };
        Insert: {
          asset_count?: number;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          journal_id?: string | null;
          period_end: string;
          total_minor?: number;
        };
        Update: {
          asset_count?: number;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          journal_id?: string | null;
          period_end?: string;
          total_minor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "asset_depreciation_runs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "asset_depreciation_runs_journal_id_fkey";
            columns: ["journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
        ];
      };
      asset_types: {
        Row: {
          accumulated_account_id: string;
          annual_rate_bps: number | null;
          asset_account_id: string;
          company_id: string;
          created_at: string;
          depreciation_method: string;
          expense_account_id: string;
          id: string;
          is_active: boolean;
          name: string;
          updated_at: string;
          useful_life_months: number | null;
        };
        Insert: {
          accumulated_account_id: string;
          annual_rate_bps?: number | null;
          asset_account_id: string;
          company_id: string;
          created_at?: string;
          depreciation_method?: string;
          expense_account_id: string;
          id?: string;
          is_active?: boolean;
          name: string;
          updated_at?: string;
          useful_life_months?: number | null;
        };
        Update: {
          accumulated_account_id?: string;
          annual_rate_bps?: number | null;
          asset_account_id?: string;
          company_id?: string;
          created_at?: string;
          depreciation_method?: string;
          expense_account_id?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          updated_at?: string;
          useful_life_months?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "asset_types_accumulated_account_id_fkey";
            columns: ["accumulated_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "asset_types_asset_account_id_fkey";
            columns: ["asset_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "asset_types_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "asset_types_expense_account_id_fkey";
            columns: ["expense_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_events: {
        Row: {
          action: string;
          actor_user_id: string | null;
          company_id: string;
          created_at: string;
          details: Json;
          entity_id: string | null;
          entity_type: string;
          id: string;
        };
        Insert: {
          action: string;
          actor_user_id?: string | null;
          company_id: string;
          created_at?: string;
          details?: Json;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
        };
        Update: {
          action?: string;
          actor_user_id?: string | null;
          company_id?: string;
          created_at?: string;
          details?: Json;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_events_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      bank_account_details: {
        Row: {
          account_number: string | null;
          bank_account_id: string;
          bic: string | null;
          company_id: string;
          iban: string | null;
          opening_statement_balance_date: string | null;
          opening_statement_balance_minor: number | null;
          sort_code: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          account_number?: string | null;
          bank_account_id: string;
          bic?: string | null;
          company_id: string;
          iban?: string | null;
          opening_statement_balance_date?: string | null;
          opening_statement_balance_minor?: number | null;
          sort_code?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          account_number?: string | null;
          bank_account_id?: string;
          bic?: string | null;
          company_id?: string;
          iban?: string | null;
          opening_statement_balance_date?: string | null;
          opening_statement_balance_minor?: number | null;
          sort_code?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "bank_account_details_bank_account_id_fkey";
            columns: ["bank_account_id"];
            isOneToOne: true;
            referencedRelation: "bank_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bank_account_details_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      bank_accounts: {
        Row: {
          company_id: string;
          created_at: string;
          currency_code: string;
          gl_account_id: string;
          id: string;
          is_active: boolean;
          name: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          currency_code: string;
          gl_account_id: string;
          id?: string;
          is_active?: boolean;
          name: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          currency_code?: string;
          gl_account_id?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bank_accounts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bank_accounts_gl_account_id_fkey";
            columns: ["gl_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      bank_coding_history: {
        Row: {
          company_id: string;
          created_at: string;
          description_sample: string | null;
          direction: string;
          id: string;
          last_used_at: string;
          offset_account_id: string;
          payee_normalized: string;
          times_used: number;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          description_sample?: string | null;
          direction: string;
          id?: string;
          last_used_at?: string;
          offset_account_id: string;
          payee_normalized: string;
          times_used?: number;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          description_sample?: string | null;
          direction?: string;
          id?: string;
          last_used_at?: string;
          offset_account_id?: string;
          payee_normalized?: string;
          times_used?: number;
        };
        Relationships: [
          {
            foreignKeyName: "bank_coding_history_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bank_coding_history_offset_account_id_fkey";
            columns: ["offset_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      bank_feed_connections: {
        Row: {
          bank_account_id: string;
          company_id: string;
          created_at: string;
          external_account_id: string | null;
          id: string;
          last_error: string | null;
          last_sync_at: string | null;
          provider: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          bank_account_id: string;
          company_id: string;
          created_at?: string;
          external_account_id?: string | null;
          id?: string;
          last_error?: string | null;
          last_sync_at?: string | null;
          provider: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          bank_account_id?: string;
          company_id?: string;
          created_at?: string;
          external_account_id?: string | null;
          id?: string;
          last_error?: string | null;
          last_sync_at?: string | null;
          provider?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bank_feed_connections_bank_account_id_fkey";
            columns: ["bank_account_id"];
            isOneToOne: false;
            referencedRelation: "bank_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bank_feed_connections_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      bank_import_mappings: {
        Row: {
          bank_account_id: string;
          company_id: string;
          created_at: string;
          id: string;
          mapping: Json;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          bank_account_id: string;
          company_id: string;
          created_at?: string;
          id?: string;
          mapping?: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          bank_account_id?: string;
          company_id?: string;
          created_at?: string;
          id?: string;
          mapping?: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "bank_import_mappings_bank_account_id_fkey";
            columns: ["bank_account_id"];
            isOneToOne: false;
            referencedRelation: "bank_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bank_import_mappings_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      bank_rules: {
        Row: {
          apply_mode: string;
          bank_account_id: string | null;
          company_id: string;
          condition_logic: string;
          conditions: Json;
          contact_id: string | null;
          created_at: string;
          created_by: string;
          description: string | null;
          direction: string;
          id: string;
          is_active: boolean;
          match_field: string;
          match_pattern: string;
          match_type: string;
          max_amount_minor: number | null;
          min_amount_minor: number | null;
          name: string;
          offset_account_id: string;
          priority: number;
          tax_code_id: string | null;
          updated_at: string;
        };
        Insert: {
          apply_mode?: string;
          bank_account_id?: string | null;
          company_id: string;
          condition_logic?: string;
          conditions?: Json;
          contact_id?: string | null;
          created_at?: string;
          created_by: string;
          description?: string | null;
          direction?: string;
          id?: string;
          is_active?: boolean;
          match_field?: string;
          match_pattern: string;
          match_type?: string;
          max_amount_minor?: number | null;
          min_amount_minor?: number | null;
          name: string;
          offset_account_id: string;
          priority?: number;
          tax_code_id?: string | null;
          updated_at?: string;
        };
        Update: {
          apply_mode?: string;
          bank_account_id?: string | null;
          company_id?: string;
          condition_logic?: string;
          conditions?: Json;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          direction?: string;
          id?: string;
          is_active?: boolean;
          match_field?: string;
          match_pattern?: string;
          match_type?: string;
          max_amount_minor?: number | null;
          min_amount_minor?: number | null;
          name?: string;
          offset_account_id?: string;
          priority?: number;
          tax_code_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bank_rules_bank_account_id_fkey";
            columns: ["bank_account_id"];
            isOneToOne: false;
            referencedRelation: "bank_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bank_rules_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bank_rules_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bank_rules_offset_account_id_fkey";
            columns: ["offset_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bank_rules_tax_code_id_fkey";
            columns: ["tax_code_id"];
            isOneToOne: false;
            referencedRelation: "tax_codes";
            referencedColumns: ["id"];
          },
        ];
      };
      bank_statement_imports: {
        Row: {
          bank_account_id: string;
          company_id: string;
          created_at: string;
          created_by: string;
          duplicate_count: number;
          error_count: number;
          error_summary: string | null;
          filename: string;
          id: string;
          imported_count: number;
          row_count: number;
          status: string;
        };
        Insert: {
          bank_account_id: string;
          company_id: string;
          created_at?: string;
          created_by: string;
          duplicate_count?: number;
          error_count?: number;
          error_summary?: string | null;
          filename: string;
          id?: string;
          imported_count?: number;
          row_count?: number;
          status?: string;
        };
        Update: {
          bank_account_id?: string;
          company_id?: string;
          created_at?: string;
          created_by?: string;
          duplicate_count?: number;
          error_count?: number;
          error_summary?: string | null;
          filename?: string;
          id?: string;
          imported_count?: number;
          row_count?: number;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bank_statement_imports_bank_account_id_fkey";
            columns: ["bank_account_id"];
            isOneToOne: false;
            referencedRelation: "bank_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bank_statement_imports_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      bank_transactions: {
        Row: {
          amount_minor: number;
          bank_account_id: string;
          company_id: string;
          contact_id: string | null;
          created_at: string;
          description: string | null;
          exclude_reason: string | null;
          excluded_at: string | null;
          excluded_by: string | null;
          external_id: string | null;
          id: string;
          import_id: string | null;
          payee: string | null;
          payee_normalized: string | null;
          project_id: string | null;
          reference: string | null;
          status: Database["public"]["Enums"]["bank_txn_status"];
          txn_date: string;
        };
        Insert: {
          amount_minor: number;
          bank_account_id: string;
          company_id: string;
          contact_id?: string | null;
          created_at?: string;
          description?: string | null;
          exclude_reason?: string | null;
          excluded_at?: string | null;
          excluded_by?: string | null;
          external_id?: string | null;
          id?: string;
          import_id?: string | null;
          payee?: string | null;
          payee_normalized?: string | null;
          project_id?: string | null;
          reference?: string | null;
          status?: Database["public"]["Enums"]["bank_txn_status"];
          txn_date: string;
        };
        Update: {
          amount_minor?: number;
          bank_account_id?: string;
          company_id?: string;
          contact_id?: string | null;
          created_at?: string;
          description?: string | null;
          exclude_reason?: string | null;
          excluded_at?: string | null;
          excluded_by?: string | null;
          external_id?: string | null;
          id?: string;
          import_id?: string | null;
          payee?: string | null;
          payee_normalized?: string | null;
          project_id?: string | null;
          reference?: string | null;
          status?: Database["public"]["Enums"]["bank_txn_status"];
          txn_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey";
            columns: ["bank_account_id"];
            isOneToOne: false;
            referencedRelation: "bank_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bank_transactions_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bank_transactions_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bank_transactions_import_id_fkey";
            columns: ["import_id"];
            isOneToOne: false;
            referencedRelation: "bank_statement_imports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bank_transactions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      bank_transfers: {
        Row: {
          amount_minor: number;
          company_id: string;
          created_at: string;
          created_by: string;
          currency_code: string;
          from_bank_account_id: string;
          fx_difference_minor: number;
          id: string;
          memo: string | null;
          posted_journal_id: string | null;
          status: string;
          to_amount_minor: number | null;
          to_bank_account_id: string;
          to_currency_code: string | null;
          transfer_date: string;
          void_journal_id: string | null;
        };
        Insert: {
          amount_minor: number;
          company_id: string;
          created_at?: string;
          created_by: string;
          currency_code: string;
          from_bank_account_id: string;
          fx_difference_minor?: number;
          id?: string;
          memo?: string | null;
          posted_journal_id?: string | null;
          status?: string;
          to_amount_minor?: number | null;
          to_bank_account_id: string;
          to_currency_code?: string | null;
          transfer_date: string;
          void_journal_id?: string | null;
        };
        Update: {
          amount_minor?: number;
          company_id?: string;
          created_at?: string;
          created_by?: string;
          currency_code?: string;
          from_bank_account_id?: string;
          fx_difference_minor?: number;
          id?: string;
          memo?: string | null;
          posted_journal_id?: string | null;
          status?: string;
          to_amount_minor?: number | null;
          to_bank_account_id?: string;
          to_currency_code?: string | null;
          transfer_date?: string;
          void_journal_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "bank_transfers_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bank_transfers_from_bank_account_id_fkey";
            columns: ["from_bank_account_id"];
            isOneToOne: false;
            referencedRelation: "bank_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bank_transfers_posted_journal_id_fkey";
            columns: ["posted_journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bank_transfers_to_bank_account_id_fkey";
            columns: ["to_bank_account_id"];
            isOneToOne: false;
            referencedRelation: "bank_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bank_transfers_void_journal_id_fkey";
            columns: ["void_journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
        ];
      };
      bill_internal_notes: {
        Row: {
          bill_id: string;
          body: string;
          company_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
        };
        Insert: {
          bill_id: string;
          body: string;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
        };
        Update: {
          bill_id?: string;
          body?: string;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bill_internal_notes_bill_id_fkey";
            columns: ["bill_id"];
            isOneToOne: false;
            referencedRelation: "purchase_bills";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bill_internal_notes_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_addons: {
        Row: {
          amount_minor: number;
          code: string;
          currency: string;
          description: string;
          name: string;
          needs_review: boolean;
          self_serve: boolean;
          unit_label: string;
        };
        Insert: {
          amount_minor: number;
          code: string;
          currency: string;
          description?: string;
          name: string;
          needs_review?: boolean;
          self_serve?: boolean;
          unit_label: string;
        };
        Update: {
          amount_minor?: number;
          code?: string;
          currency?: string;
          description?: string;
          name?: string;
          needs_review?: boolean;
          self_serve?: boolean;
          unit_label?: string;
        };
        Relationships: [];
      };
      billing_checkouts: {
        Row: {
          billing_interval: string;
          company_id: string;
          created_at: string;
          created_by: string | null;
          currency: string;
          id: string;
          offer_code: string | null;
          plan_code: string;
          provider: string;
          provider_session_id: string | null;
          status: string;
          unit_amount_minor: number;
        };
        Insert: {
          billing_interval: string;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          currency: string;
          id?: string;
          offer_code?: string | null;
          plan_code: string;
          provider: string;
          provider_session_id?: string | null;
          status?: string;
          unit_amount_minor: number;
        };
        Update: {
          billing_interval?: string;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          id?: string;
          offer_code?: string | null;
          plan_code?: string;
          provider?: string;
          provider_session_id?: string | null;
          status?: string;
          unit_amount_minor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "billing_checkouts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_checkouts_plan_code_fkey";
            columns: ["plan_code"];
            isOneToOne: false;
            referencedRelation: "billing_plans";
            referencedColumns: ["code"];
          },
        ];
      };
      billing_cost_inputs: {
        Row: {
          key: string;
          label: string;
          max_quantity: number;
          needs_review: boolean;
          source_url: string | null;
          typical_quantity: number;
          unit_cost_minor_usd: number;
        };
        Insert: {
          key: string;
          label: string;
          max_quantity?: number;
          needs_review?: boolean;
          source_url?: string | null;
          typical_quantity?: number;
          unit_cost_minor_usd: number;
        };
        Update: {
          key?: string;
          label?: string;
          max_quantity?: number;
          needs_review?: boolean;
          source_url?: string | null;
          typical_quantity?: number;
          unit_cost_minor_usd?: number;
        };
        Relationships: [];
      };
      billing_events: {
        Row: {
          company_id: string | null;
          created_at: string;
          event_id: string | null;
          event_type: string;
          id: string;
          provider: string;
        };
        Insert: {
          company_id?: string | null;
          created_at?: string;
          event_id?: string | null;
          event_type: string;
          id?: string;
          provider: string;
        };
        Update: {
          company_id?: string | null;
          created_at?: string;
          event_id?: string | null;
          event_type?: string;
          id?: string;
          provider?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_events_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_features: {
        Row: {
          catalogue_status: string;
          category: string;
          cost_tag: string | null;
          default_enabled: boolean;
          description: string;
          key: string;
          label: string;
          metering: string;
          module: string;
          version_no: number;
        };
        Insert: {
          catalogue_status?: string;
          category?: string;
          cost_tag?: string | null;
          default_enabled?: boolean;
          description?: string;
          key: string;
          label: string;
          metering?: string;
          module?: string;
          version_no?: number;
        };
        Update: {
          catalogue_status?: string;
          category?: string;
          cost_tag?: string | null;
          default_enabled?: boolean;
          description?: string;
          key?: string;
          label?: string;
          metering?: string;
          module?: string;
          version_no?: number;
        };
        Relationships: [];
      };
      billing_lifetime_payments: {
        Row: {
          amount_minor: number;
          company_id: string;
          created_at: string;
          created_by: string;
          currency: string;
          id: string;
          source_id: string;
        };
        Insert: {
          amount_minor: number;
          company_id: string;
          created_at?: string;
          created_by: string;
          currency: string;
          id?: string;
          source_id: string;
        };
        Update: {
          amount_minor?: number;
          company_id?: string;
          created_at?: string;
          created_by?: string;
          currency?: string;
          id?: string;
          source_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_lifetime_payments_company_fk";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_offers: {
        Row: {
          amount_currency: string | null;
          amount_minor: number;
          code: string;
          duration_months: number | null;
          ends_on: string | null;
          extra_free_months: number;
          extra_trial_days: number;
          intervals: string;
          is_active: boolean;
          kind: string;
          max_redemptions: number | null;
          name: string;
          percent_bps: number;
          plan_codes: string[] | null;
          redemption_count: number;
          starts_on: string | null;
          updated_at: string;
        };
        Insert: {
          amount_currency?: string | null;
          amount_minor?: number;
          code: string;
          duration_months?: number | null;
          ends_on?: string | null;
          extra_free_months?: number;
          extra_trial_days?: number;
          intervals?: string;
          is_active?: boolean;
          kind: string;
          max_redemptions?: number | null;
          name: string;
          percent_bps?: number;
          plan_codes?: string[] | null;
          redemption_count?: number;
          starts_on?: string | null;
          updated_at?: string;
        };
        Update: {
          amount_currency?: string | null;
          amount_minor?: number;
          code?: string;
          duration_months?: number | null;
          ends_on?: string | null;
          extra_free_months?: number;
          extra_trial_days?: number;
          intervals?: string;
          is_active?: boolean;
          kind?: string;
          max_redemptions?: number | null;
          name?: string;
          percent_bps?: number;
          plan_codes?: string[] | null;
          redemption_count?: number;
          starts_on?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      billing_operators: {
        Row: {
          created_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      billing_plans: {
        Row: {
          audience: string;
          bills_per_month: number | null;
          code: string;
          highlights: Json;
          invoices_per_month: number | null;
          is_active: boolean;
          is_public: boolean;
          monthly_gbp: number;
          monthly_inr: number;
          monthly_usd: number;
          multi_currency: boolean;
          name: string;
          sort_order: number;
          summary: string;
          updated_at: string;
          users_included: number;
        };
        Insert: {
          audience: string;
          bills_per_month?: number | null;
          code: string;
          highlights?: Json;
          invoices_per_month?: number | null;
          is_active?: boolean;
          is_public?: boolean;
          monthly_gbp: number;
          monthly_inr: number;
          monthly_usd: number;
          multi_currency?: boolean;
          name: string;
          sort_order: number;
          summary: string;
          updated_at?: string;
          users_included: number;
        };
        Update: {
          audience?: string;
          bills_per_month?: number | null;
          code?: string;
          highlights?: Json;
          invoices_per_month?: number | null;
          is_active?: boolean;
          is_public?: boolean;
          monthly_gbp?: number;
          monthly_inr?: number;
          monthly_usd?: number;
          multi_currency?: boolean;
          name?: string;
          sort_order?: number;
          summary?: string;
          updated_at?: string;
          users_included?: number;
        };
        Relationships: [];
      };
      billing_prorations: {
        Row: {
          company_id: string;
          created_at: string;
          created_by: string;
          id: string;
          proration_minor: number;
          provider_called: boolean;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          created_by: string;
          id?: string;
          proration_minor: number;
          provider_called?: boolean;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          proration_minor?: number;
          provider_called?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "billing_prorations_company_fk";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_provider_fees: {
        Row: {
          company_id: string;
          created_at: string;
          created_by: string;
          currency: string;
          fee_minor: number;
          gross_minor: number;
          id: string;
          provider: string;
          provider_charge_id: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          created_by: string;
          currency: string;
          fee_minor: number;
          gross_minor: number;
          id?: string;
          provider: string;
          provider_charge_id: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          created_by?: string;
          currency?: string;
          fee_minor?: number;
          gross_minor?: number;
          id?: string;
          provider?: string;
          provider_charge_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_provider_fees_company_fk";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_provider_reconciliations: {
        Row: {
          company_id: string;
          created_at: string;
          created_by: string;
          difference_minor: number | null;
          id: string;
          state: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          created_by: string;
          difference_minor?: number | null;
          id?: string;
          state: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          created_by?: string;
          difference_minor?: number | null;
          id?: string;
          state?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_provider_reconciliations_company_fk";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_settings: {
        Row: {
          annual_free_months: number;
          card_required: boolean;
          id: boolean;
          past_due_grace_days: number;
          require_owner_approval: boolean;
          trial_days: number;
          trial_plan_code: string;
          updated_at: string;
        };
        Insert: {
          annual_free_months?: number;
          card_required?: boolean;
          id?: boolean;
          past_due_grace_days?: number;
          require_owner_approval?: boolean;
          trial_days?: number;
          trial_plan_code?: string;
          updated_at?: string;
        };
        Update: {
          annual_free_months?: number;
          card_required?: boolean;
          id?: boolean;
          past_due_grace_days?: number;
          require_owner_approval?: boolean;
          trial_days?: number;
          trial_plan_code?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      billing_usage_drafts: {
        Row: {
          company_id: string;
          created_at: string;
          created_by: string;
          currency: string;
          id: string;
          net_minor: number | null;
          posted: boolean;
          provider_called: boolean;
          quantity: number;
          status: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          created_by: string;
          currency: string;
          id?: string;
          net_minor?: number | null;
          posted?: boolean;
          provider_called?: boolean;
          quantity: number;
          status: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          created_by?: string;
          currency?: string;
          id?: string;
          net_minor?: number | null;
          posted?: boolean;
          provider_called?: boolean;
          quantity?: number;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_usage_drafts_company_fk";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      break_glass_events: {
        Row: {
          action: string;
          actor_id: string | null;
          company_id: string;
          created_at: string;
          event_reason: string | null;
          grant_id: string;
          id: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          company_id: string;
          created_at?: string;
          event_reason?: string | null;
          grant_id: string;
          id?: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          company_id?: string;
          created_at?: string;
          event_reason?: string | null;
          grant_id?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "break_glass_events_company_fk";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "break_glass_events_grant_id_fkey";
            columns: ["grant_id"];
            isOneToOne: false;
            referencedRelation: "break_glass_grants";
            referencedColumns: ["id"];
          },
        ];
      };
      break_glass_grants: {
        Row: {
          approval_id: string | null;
          approver_id: string | null;
          company_id: string;
          created_at: string;
          expires_at: string;
          id: string;
          reason: string;
          requester_id: string;
          status: string;
          support_grant_id: string | null;
        };
        Insert: {
          approval_id?: string | null;
          approver_id?: string | null;
          company_id: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          reason: string;
          requester_id: string;
          status: string;
          support_grant_id?: string | null;
        };
        Update: {
          approval_id?: string | null;
          approver_id?: string | null;
          company_id?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          reason?: string;
          requester_id?: string;
          status?: string;
          support_grant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "break_glass_grants_approval_id_fkey";
            columns: ["approval_id"];
            isOneToOne: true;
            referencedRelation: "approval_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "break_glass_grants_company_fk";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "break_glass_grants_support_grant_id_fkey";
            columns: ["support_grant_id"];
            isOneToOne: true;
            referencedRelation: "platform_support_grants";
            referencedColumns: ["id"];
          },
        ];
      };
      budget_lines: {
        Row: {
          account_id: string;
          amount_minor: number;
          budget_id: string;
          company_id: string;
          id: string;
          period_month: string;
        };
        Insert: {
          account_id: string;
          amount_minor: number;
          budget_id: string;
          company_id: string;
          id?: string;
          period_month: string;
        };
        Update: {
          account_id?: string;
          amount_minor?: number;
          budget_id?: string;
          company_id?: string;
          id?: string;
          period_month?: string;
        };
        Relationships: [
          {
            foreignKeyName: "budget_lines_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "budget_lines_budget_id_fkey";
            columns: ["budget_id"];
            isOneToOne: false;
            referencedRelation: "budgets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "budget_lines_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      budgets: {
        Row: {
          company_id: string;
          created_at: string;
          created_by: string | null;
          fiscal_year_start: string;
          id: string;
          name: string;
          notes: string | null;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          fiscal_year_start: string;
          id?: string;
          name: string;
          notes?: string | null;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          fiscal_year_start?: string;
          id?: string;
          name?: string;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "budgets_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      coa_apply_events: {
        Row: {
          actor_user_id: string | null;
          catalog_version: string | null;
          company_id: string;
          conflict_count: number;
          created_at: string;
          created_count: number;
          detail_level: string;
          details: Json;
          id: string;
          industry_codes: string[];
          skipped_count: number;
        };
        Insert: {
          actor_user_id?: string | null;
          catalog_version?: string | null;
          company_id: string;
          conflict_count?: number;
          created_at?: string;
          created_count?: number;
          detail_level: string;
          details?: Json;
          id?: string;
          industry_codes?: string[];
          skipped_count?: number;
        };
        Update: {
          actor_user_id?: string | null;
          catalog_version?: string | null;
          company_id?: string;
          conflict_count?: number;
          created_at?: string;
          created_count?: number;
          detail_level?: string;
          details?: Json;
          id?: string;
          industry_codes?: string[];
          skipped_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "coa_apply_events_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      coa_audit_log: {
        Row: {
          account_id: string | null;
          action: string;
          actor_id: string | null;
          company_id: string;
          created_at: string;
          id: string;
          new_values: Json | null;
          old_values: Json | null;
        };
        Insert: {
          account_id?: string | null;
          action: string;
          actor_id?: string | null;
          company_id: string;
          created_at?: string;
          id?: string;
          new_values?: Json | null;
          old_values?: Json | null;
        };
        Update: {
          account_id?: string | null;
          action?: string;
          actor_id?: string | null;
          company_id?: string;
          created_at?: string;
          id?: string;
          new_values?: Json | null;
          old_values?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "coa_audit_log_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "coa_audit_log_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      coa_industries: {
        Row: {
          code: string;
          description: string;
          family: string;
          is_active: boolean;
          name: string;
        };
        Insert: {
          code: string;
          description?: string;
          family: string;
          is_active?: boolean;
          name: string;
        };
        Update: {
          code?: string;
          description?: string;
          family?: string;
          is_active?: boolean;
          name?: string;
        };
        Relationships: [];
      };
      communication_digest_preferences: {
        Row: {
          company_id: string;
          frequency: string;
          hour_local: number;
          updated_at: string;
          user_id: string;
          weekday: number;
        };
        Insert: {
          company_id: string;
          frequency?: string;
          hour_local?: number;
          updated_at?: string;
          user_id: string;
          weekday?: number;
        };
        Update: {
          company_id?: string;
          frequency?: string;
          hour_local?: number;
          updated_at?: string;
          user_id?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: "communication_digest_preferences_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      communication_scheduled_deliveries: {
        Row: {
          alert_count: number;
          company_id: string;
          created_at: string;
          error: string | null;
          frequency: string;
          id: string;
          provider: string;
          provider_message_id: string | null;
          recipient: string;
          scheduled_at: string;
          state: string;
          user_id: string;
        };
        Insert: {
          alert_count: number;
          company_id: string;
          created_at?: string;
          error?: string | null;
          frequency: string;
          id?: string;
          provider?: string;
          provider_message_id?: string | null;
          recipient: string;
          scheduled_at: string;
          state: string;
          user_id: string;
        };
        Update: {
          alert_count?: number;
          company_id?: string;
          created_at?: string;
          error?: string | null;
          frequency?: string;
          id?: string;
          provider?: string;
          provider_message_id?: string | null;
          recipient?: string;
          scheduled_at?: string;
          state?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "communication_scheduled_deliveries_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      communication_send_claims: {
        Row: {
          company_id: string;
          created_at: string;
          kind: string;
          user_id: string;
          window_start: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          kind: string;
          user_id: string;
          window_start: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          kind?: string;
          user_id?: string;
          window_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: "communication_send_claims_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      companies: {
        Row: {
          archived_at: string | null;
          base_currency: string;
          country_code: string;
          created_at: string;
          created_by: string;
          date_format: string;
          document_theme_color: string;
          first_day_of_week: number;
          fiscal_year_end_day: number;
          fiscal_year_end_month: number;
          id: string;
          invoice_footer: string;
          is_demo: boolean;
          legal_name: string | null;
          locale: string;
          name: string;
          number_decimal_separator: string;
          number_thousands_separator: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          base_currency: string;
          country_code: string;
          created_at?: string;
          created_by: string;
          date_format?: string;
          document_theme_color?: string;
          first_day_of_week?: number;
          fiscal_year_end_day: number;
          fiscal_year_end_month: number;
          id?: string;
          invoice_footer?: string;
          is_demo?: boolean;
          legal_name?: string | null;
          locale?: string;
          name: string;
          number_decimal_separator?: string;
          number_thousands_separator?: string;
          timezone: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          base_currency?: string;
          country_code?: string;
          created_at?: string;
          created_by?: string;
          date_format?: string;
          document_theme_color?: string;
          first_day_of_week?: number;
          fiscal_year_end_day?: number;
          fiscal_year_end_month?: number;
          id?: string;
          invoice_footer?: string;
          is_demo?: boolean;
          legal_name?: string | null;
          locale?: string;
          name?: string;
          number_decimal_separator?: string;
          number_thousands_separator?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      company_branding: {
        Row: {
          address_text: string | null;
          bank_details: string | null;
          company_id: string;
          default_notes: string | null;
          invoice_email: string | null;
          invoice_phone: string | null;
          letterhead_line: string | null;
          logo_path: string | null;
          logo_url: string | null;
          payment_instructions: string | null;
          tax_number: string | null;
          trading_name: string | null;
          updated_at: string;
        };
        Insert: {
          address_text?: string | null;
          bank_details?: string | null;
          company_id: string;
          default_notes?: string | null;
          invoice_email?: string | null;
          invoice_phone?: string | null;
          letterhead_line?: string | null;
          logo_path?: string | null;
          logo_url?: string | null;
          payment_instructions?: string | null;
          tax_number?: string | null;
          trading_name?: string | null;
          updated_at?: string;
        };
        Update: {
          address_text?: string | null;
          bank_details?: string | null;
          company_id?: string;
          default_notes?: string | null;
          invoice_email?: string | null;
          invoice_phone?: string | null;
          letterhead_line?: string | null;
          logo_path?: string | null;
          logo_url?: string | null;
          payment_instructions?: string | null;
          tax_number?: string | null;
          trading_name?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_branding_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: true;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      company_closure_requests: {
        Row: {
          approver_id: string | null;
          company_id: string;
          created_at: string;
          id: string;
          reason: string;
          requester_id: string;
          status: string;
        };
        Insert: {
          approver_id?: string | null;
          company_id: string;
          created_at?: string;
          id?: string;
          reason: string;
          requester_id: string;
          status: string;
        };
        Update: {
          approver_id?: string | null;
          company_id?: string;
          created_at?: string;
          id?: string;
          reason?: string;
          requester_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_closure_requests_company_fk";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      company_coa_settings: {
        Row: {
          catalog_version: string | null;
          company_id: string;
          detail_level: string;
          industry_codes: string[];
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          catalog_version?: string | null;
          company_id: string;
          detail_level?: string;
          industry_codes?: string[];
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          catalog_version?: string | null;
          company_id?: string;
          detail_level?: string;
          industry_codes?: string[];
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "company_coa_settings_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: true;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      company_contact_settings: {
        Row: {
          account_number_prefix: string;
          company_id: string;
          default_kind: string;
          default_payment_terms_days: number;
          next_account_number: number;
          updated_at: string;
        };
        Insert: {
          account_number_prefix?: string;
          company_id: string;
          default_kind?: string;
          default_payment_terms_days?: number;
          next_account_number?: number;
          updated_at?: string;
        };
        Update: {
          account_number_prefix?: string;
          company_id?: string;
          default_kind?: string;
          default_payment_terms_days?: number;
          next_account_number?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_contact_settings_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: true;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      company_currencies: {
        Row: {
          company_id: string;
          currency_code: string;
          enabled_at: string;
        };
        Insert: {
          company_id: string;
          currency_code: string;
          enabled_at?: string;
        };
        Update: {
          company_id?: string;
          currency_code?: string;
          enabled_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_currencies_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      company_invitations: {
        Row: {
          accepted_at: string | null;
          adjustments: Json;
          company_id: string;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          revoked_at: string | null;
          role: Database["public"]["Enums"]["company_role"];
          token_hash: string;
        };
        Insert: {
          accepted_at?: string | null;
          adjustments?: Json;
          company_id: string;
          created_at?: string;
          email: string;
          expires_at: string;
          id?: string;
          invited_by?: string | null;
          revoked_at?: string | null;
          role: Database["public"]["Enums"]["company_role"];
          token_hash: string;
        };
        Update: {
          accepted_at?: string | null;
          adjustments?: Json;
          company_id?: string;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["company_role"];
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_invitations_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      company_members: {
        Row: {
          company_id: string;
          created_at: string;
          id: string;
          invited_by: string | null;
          role: Database["public"]["Enums"]["company_role"];
          status: Database["public"]["Enums"]["membership_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          id?: string;
          invited_by?: string | null;
          role: Database["public"]["Enums"]["company_role"];
          status?: Database["public"]["Enums"]["membership_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          id?: string;
          invited_by?: string | null;
          role?: Database["public"]["Enums"]["company_role"];
          status?: Database["public"]["Enums"]["membership_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      company_payment_terms: {
        Row: {
          calculation_method: string;
          company_id: string;
          created_at: string;
          days: number;
          id: string;
          is_active: boolean;
          name: string;
        };
        Insert: {
          calculation_method?: string;
          company_id: string;
          created_at?: string;
          days?: number;
          id?: string;
          is_active?: boolean;
          name: string;
        };
        Update: {
          calculation_method?: string;
          company_id?: string;
          created_at?: string;
          days?: number;
          id?: string;
          is_active?: boolean;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_payment_terms_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      company_reminder_settings: {
        Row: {
          company_id: string;
          first_after_days: number;
          include_bank_details: boolean;
          max_reminders: number;
          repeat_every_days: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          company_id: string;
          first_after_days?: number;
          include_bank_details?: boolean;
          max_reminders?: number;
          repeat_every_days?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          company_id?: string;
          first_after_days?: number;
          include_bank_details?: boolean;
          max_reminders?: number;
          repeat_every_days?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "company_reminder_settings_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: true;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      company_subscriptions: {
        Row: {
          billing_interval: string;
          cancel_at_period_end: boolean;
          company_id: string;
          currency: string;
          current_period_end: string | null;
          grandfathered: boolean;
          offer_code: string | null;
          paused_at: string | null;
          plan_code: string;
          price_lock_until: string | null;
          price_version_id: string | null;
          provider: string;
          provider_customer_id: string | null;
          provider_subscription_id: string | null;
          read_only_until: string | null;
          scheduled_at: string | null;
          scheduled_plan_code: string | null;
          started_at: string | null;
          status: string;
          trial_ends_at: string | null;
          trial_started_at: string | null;
          unit_amount_minor: number | null;
          updated_at: string;
        };
        Insert: {
          billing_interval?: string;
          cancel_at_period_end?: boolean;
          company_id: string;
          currency?: string;
          current_period_end?: string | null;
          grandfathered?: boolean;
          offer_code?: string | null;
          paused_at?: string | null;
          plan_code: string;
          price_lock_until?: string | null;
          price_version_id?: string | null;
          provider?: string;
          provider_customer_id?: string | null;
          provider_subscription_id?: string | null;
          read_only_until?: string | null;
          scheduled_at?: string | null;
          scheduled_plan_code?: string | null;
          started_at?: string | null;
          status: string;
          trial_ends_at?: string | null;
          trial_started_at?: string | null;
          unit_amount_minor?: number | null;
          updated_at?: string;
        };
        Update: {
          billing_interval?: string;
          cancel_at_period_end?: boolean;
          company_id?: string;
          currency?: string;
          current_period_end?: string | null;
          grandfathered?: boolean;
          offer_code?: string | null;
          paused_at?: string | null;
          plan_code?: string;
          price_lock_until?: string | null;
          price_version_id?: string | null;
          provider?: string;
          provider_customer_id?: string | null;
          provider_subscription_id?: string | null;
          read_only_until?: string | null;
          scheduled_at?: string | null;
          scheduled_plan_code?: string | null;
          started_at?: string | null;
          status?: string;
          trial_ends_at?: string | null;
          trial_started_at?: string | null;
          unit_amount_minor?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_subscriptions_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: true;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_subscriptions_plan_code_fkey";
            columns: ["plan_code"];
            isOneToOne: false;
            referencedRelation: "billing_plans";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "company_subscriptions_price_version_id_fkey";
            columns: ["price_version_id"];
            isOneToOne: false;
            referencedRelation: "plan_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      company_tax_pack_applications: {
        Row: {
          applied_at: string;
          applied_by: string | null;
          company_id: string;
          details: Json;
          id: string;
          pack_id: string;
          pack_version: string;
          verification_status: string;
        };
        Insert: {
          applied_at?: string;
          applied_by?: string | null;
          company_id: string;
          details?: Json;
          id?: string;
          pack_id: string;
          pack_version: string;
          verification_status: string;
        };
        Update: {
          applied_at?: string;
          applied_by?: string | null;
          company_id?: string;
          details?: Json;
          id?: string;
          pack_id?: string;
          pack_version?: string;
          verification_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_tax_pack_applications_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      company_tax_settings: {
        Row: {
          applied_pack_id: string | null;
          applied_pack_version: string | null;
          company_id: string;
          created_at: string;
          default_purchase_tax_code_id: string | null;
          default_sales_tax_code_id: string | null;
          filing_frequency: string | null;
          input_tax_account_id: string | null;
          jurisdiction_code: string | null;
          non_recoverable_tax_account_id: string | null;
          output_tax_account_id: string | null;
          prices_include_tax: boolean;
          registration_date: string | null;
          registration_end_date: string | null;
          registration_number: string | null;
          tax_basis: string;
          tax_regime: string;
          updated_at: string;
        };
        Insert: {
          applied_pack_id?: string | null;
          applied_pack_version?: string | null;
          company_id: string;
          created_at?: string;
          default_purchase_tax_code_id?: string | null;
          default_sales_tax_code_id?: string | null;
          filing_frequency?: string | null;
          input_tax_account_id?: string | null;
          jurisdiction_code?: string | null;
          non_recoverable_tax_account_id?: string | null;
          output_tax_account_id?: string | null;
          prices_include_tax?: boolean;
          registration_date?: string | null;
          registration_end_date?: string | null;
          registration_number?: string | null;
          tax_basis?: string;
          tax_regime?: string;
          updated_at?: string;
        };
        Update: {
          applied_pack_id?: string | null;
          applied_pack_version?: string | null;
          company_id?: string;
          created_at?: string;
          default_purchase_tax_code_id?: string | null;
          default_sales_tax_code_id?: string | null;
          filing_frequency?: string | null;
          input_tax_account_id?: string | null;
          jurisdiction_code?: string | null;
          non_recoverable_tax_account_id?: string | null;
          output_tax_account_id?: string | null;
          prices_include_tax?: boolean;
          registration_date?: string | null;
          registration_end_date?: string | null;
          registration_number?: string | null;
          tax_basis?: string;
          tax_regime?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_tax_settings_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: true;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_tax_settings_default_purchase_tax_code_id_fkey";
            columns: ["default_purchase_tax_code_id"];
            isOneToOne: false;
            referencedRelation: "tax_codes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_tax_settings_default_sales_tax_code_id_fkey";
            columns: ["default_sales_tax_code_id"];
            isOneToOne: false;
            referencedRelation: "tax_codes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_tax_settings_input_tax_account_id_fkey";
            columns: ["input_tax_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_tax_settings_non_recoverable_tax_account_id_fkey";
            columns: ["non_recoverable_tax_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_tax_settings_output_tax_account_id_fkey";
            columns: ["output_tax_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      company_workflow_settings: {
        Row: {
          accounting_require_journal_memo: boolean;
          banking_csv_date_format: string;
          company_id: string;
          purchases_bill_view_mode: string;
          purchases_default_notes: string | null;
          purchases_default_payment_terms_days: number;
          purchases_duplicate_policy: string;
          purchases_require_po: boolean;
          sales_default_notes: string | null;
          sales_default_payment_terms_days: number;
          sales_payment_instructions: string | null;
          sales_prices_include_tax: boolean;
          sales_quote_validity_days: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          accounting_require_journal_memo?: boolean;
          banking_csv_date_format?: string;
          company_id: string;
          purchases_bill_view_mode?: string;
          purchases_default_notes?: string | null;
          purchases_default_payment_terms_days?: number;
          purchases_duplicate_policy?: string;
          purchases_require_po?: boolean;
          sales_default_notes?: string | null;
          sales_default_payment_terms_days?: number;
          sales_payment_instructions?: string | null;
          sales_prices_include_tax?: boolean;
          sales_quote_validity_days?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          accounting_require_journal_memo?: boolean;
          banking_csv_date_format?: string;
          company_id?: string;
          purchases_bill_view_mode?: string;
          purchases_default_notes?: string | null;
          purchases_default_payment_terms_days?: number;
          purchases_duplicate_policy?: string;
          purchases_require_po?: boolean;
          sales_default_notes?: string | null;
          sales_default_payment_terms_days?: number;
          sales_payment_instructions?: string | null;
          sales_prices_include_tax?: boolean;
          sales_quote_validity_days?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "company_workflow_settings_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: true;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_addresses: {
        Row: {
          city: string | null;
          company_id: string;
          contact_id: string;
          country: string | null;
          created_at: string;
          id: string;
          is_primary: boolean;
          label: string;
          line1: string | null;
          line2: string | null;
          postal_code: string | null;
          region: string | null;
        };
        Insert: {
          city?: string | null;
          company_id: string;
          contact_id: string;
          country?: string | null;
          created_at?: string;
          id?: string;
          is_primary?: boolean;
          label?: string;
          line1?: string | null;
          line2?: string | null;
          postal_code?: string | null;
          region?: string | null;
        };
        Update: {
          city?: string | null;
          company_id?: string;
          contact_id?: string;
          country?: string | null;
          created_at?: string;
          id?: string;
          is_primary?: boolean;
          label?: string;
          line1?: string | null;
          line2?: string | null;
          postal_code?: string | null;
          region?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "contact_addresses_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_addresses_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_group_members: {
        Row: {
          company_id: string;
          contact_id: string;
          created_at: string;
          group_id: string;
        };
        Insert: {
          company_id: string;
          contact_id: string;
          created_at?: string;
          group_id: string;
        };
        Update: {
          company_id?: string;
          contact_id?: string;
          created_at?: string;
          group_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contact_group_members_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_group_members_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_group_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "contact_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_groups: {
        Row: {
          color: string | null;
          company_id: string;
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          name: string;
        };
        Insert: {
          color?: string | null;
          company_id: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
        };
        Update: {
          color?: string | null;
          company_id?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contact_groups_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_payment_details: {
        Row: {
          account_name: string;
          account_number: string;
          bank_name: string;
          company_id: string;
          contact_id: string;
          country_code: string;
          routing_code: string | null;
          verified_at: string;
          verified_by: string | null;
        };
        Insert: {
          account_name: string;
          account_number: string;
          bank_name: string;
          company_id: string;
          contact_id: string;
          country_code: string;
          routing_code?: string | null;
          verified_at: string;
          verified_by?: string | null;
        };
        Update: {
          account_name?: string;
          account_number?: string;
          bank_name?: string;
          company_id?: string;
          contact_id?: string;
          country_code?: string;
          routing_code?: string | null;
          verified_at?: string;
          verified_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "contact_payment_details_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_payment_details_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: true;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_people: {
        Row: {
          company_id: string;
          contact_id: string;
          created_at: string;
          email: string | null;
          first_name: string;
          id: string;
          is_primary: boolean;
          job_title: string | null;
          last_name: string;
          phone: string | null;
          role_label: string | null;
          sort_order: number;
        };
        Insert: {
          company_id: string;
          contact_id: string;
          created_at?: string;
          email?: string | null;
          first_name?: string;
          id?: string;
          is_primary?: boolean;
          job_title?: string | null;
          last_name?: string;
          phone?: string | null;
          role_label?: string | null;
          sort_order?: number;
        };
        Update: {
          company_id?: string;
          contact_id?: string;
          created_at?: string;
          email?: string | null;
          first_name?: string;
          id?: string;
          is_primary?: boolean;
          job_title?: string | null;
          last_name?: string;
          phone?: string | null;
          role_label?: string | null;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "contact_people_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_people_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_tag_assignments: {
        Row: {
          company_id: string;
          contact_id: string;
          created_at: string;
          tag_id: string;
        };
        Insert: {
          company_id: string;
          contact_id: string;
          created_at?: string;
          tag_id: string;
        };
        Update: {
          company_id?: string;
          contact_id?: string;
          created_at?: string;
          tag_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contact_tag_assignments_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_tag_assignments_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_tag_assignments_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "contact_tags";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_tags: {
        Row: {
          company_id: string;
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contact_tags_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      contacts: {
        Row: {
          account_number: string | null;
          archived_at: string | null;
          billing_address_line1: string | null;
          billing_address_line2: string | null;
          billing_city: string | null;
          billing_country: string | null;
          billing_postal: string | null;
          billing_region: string | null;
          company_id: string;
          created_at: string;
          credit_limit_minor: number | null;
          default_currency: string | null;
          default_purchase_account_id: string | null;
          default_sales_account_id: string | null;
          delivery_address_line1: string | null;
          delivery_city: string | null;
          delivery_country: string | null;
          delivery_postal: string | null;
          delivery_region: string | null;
          email: string | null;
          id: string;
          is_active: boolean;
          kind: Database["public"]["Enums"]["contact_kind"];
          legal_name: string | null;
          name: string;
          notes: string | null;
          payment_terms_days: number;
          phone: string | null;
          purchase_tax_inclusive: boolean | null;
          sales_tax_inclusive: boolean | null;
          tax_number: string | null;
          updated_at: string;
          website: string | null;
        };
        Insert: {
          account_number?: string | null;
          archived_at?: string | null;
          billing_address_line1?: string | null;
          billing_address_line2?: string | null;
          billing_city?: string | null;
          billing_country?: string | null;
          billing_postal?: string | null;
          billing_region?: string | null;
          company_id: string;
          created_at?: string;
          credit_limit_minor?: number | null;
          default_currency?: string | null;
          default_purchase_account_id?: string | null;
          default_sales_account_id?: string | null;
          delivery_address_line1?: string | null;
          delivery_city?: string | null;
          delivery_country?: string | null;
          delivery_postal?: string | null;
          delivery_region?: string | null;
          email?: string | null;
          id?: string;
          is_active?: boolean;
          kind?: Database["public"]["Enums"]["contact_kind"];
          legal_name?: string | null;
          name: string;
          notes?: string | null;
          payment_terms_days?: number;
          phone?: string | null;
          purchase_tax_inclusive?: boolean | null;
          sales_tax_inclusive?: boolean | null;
          tax_number?: string | null;
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          account_number?: string | null;
          archived_at?: string | null;
          billing_address_line1?: string | null;
          billing_address_line2?: string | null;
          billing_city?: string | null;
          billing_country?: string | null;
          billing_postal?: string | null;
          billing_region?: string | null;
          company_id?: string;
          created_at?: string;
          credit_limit_minor?: number | null;
          default_currency?: string | null;
          default_purchase_account_id?: string | null;
          default_sales_account_id?: string | null;
          delivery_address_line1?: string | null;
          delivery_city?: string | null;
          delivery_country?: string | null;
          delivery_postal?: string | null;
          delivery_region?: string | null;
          email?: string | null;
          id?: string;
          is_active?: boolean;
          kind?: Database["public"]["Enums"]["contact_kind"];
          legal_name?: string | null;
          name?: string;
          notes?: string | null;
          payment_terms_days?: number;
          phone?: string | null;
          purchase_tax_inclusive?: boolean | null;
          sales_tax_inclusive?: boolean | null;
          tax_number?: string | null;
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contacts_default_purchase_account_id_fkey";
            columns: ["default_purchase_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contacts_default_sales_account_id_fkey";
            columns: ["default_sales_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      conversion_balance_batches: {
        Row: {
          bill_count: number;
          company_id: string;
          conversion_date: string;
          created_at: string;
          created_by: string | null;
          id: string;
          invoice_count: number;
          journal_ids: string[];
          note: string | null;
          opening_date: string;
          plug_to_opening_equity_minor: number;
          reverse_reason: string | null;
          reversed_at: string | null;
          reversed_by: string | null;
          status: string;
          tb_line_count: number;
          total_credit_minor: number;
          total_debit_minor: number;
        };
        Insert: {
          bill_count?: number;
          company_id: string;
          conversion_date: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          invoice_count?: number;
          journal_ids?: string[];
          note?: string | null;
          opening_date: string;
          plug_to_opening_equity_minor?: number;
          reverse_reason?: string | null;
          reversed_at?: string | null;
          reversed_by?: string | null;
          status?: string;
          tb_line_count?: number;
          total_credit_minor?: number;
          total_debit_minor?: number;
        };
        Update: {
          bill_count?: number;
          company_id?: string;
          conversion_date?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          invoice_count?: number;
          journal_ids?: string[];
          note?: string | null;
          opening_date?: string;
          plug_to_opening_equity_minor?: number;
          reverse_reason?: string | null;
          reversed_at?: string | null;
          reversed_by?: string | null;
          status?: string;
          tb_line_count?: number;
          total_credit_minor?: number;
          total_debit_minor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "conversion_balance_batches_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      currency_decimals: {
        Row: {
          code: string;
          decimal_places: number;
        };
        Insert: {
          code: string;
          decimal_places: number;
        };
        Update: {
          code?: string;
          decimal_places?: number;
        };
        Relationships: [];
      };
      document_attachments: {
        Row: {
          company_id: string;
          content_base64: string | null;
          content_type: string | null;
          created_at: string;
          entity_id: string;
          entity_type: string;
          file_name: string;
          folder_id: string | null;
          id: string;
          size_bytes: number | null;
          storage_bucket: string | null;
          storage_path: string;
          uploaded_by: string | null;
        };
        Insert: {
          company_id: string;
          content_base64?: string | null;
          content_type?: string | null;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          file_name: string;
          folder_id?: string | null;
          id?: string;
          size_bytes?: number | null;
          storage_bucket?: string | null;
          storage_path: string;
          uploaded_by?: string | null;
        };
        Update: {
          company_id?: string;
          content_base64?: string | null;
          content_type?: string | null;
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          file_name?: string;
          folder_id?: string | null;
          id?: string;
          size_bytes?: number | null;
          storage_bucket?: string | null;
          storage_path?: string;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "document_attachments_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_attachments_folder_same_company";
            columns: ["company_id", "folder_id"];
            isOneToOne: false;
            referencedRelation: "document_folders";
            referencedColumns: ["company_id", "id"];
          },
        ];
      };
      document_folders: {
        Row: {
          company_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          parent_id: string | null;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          parent_id?: string | null;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          parent_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_folders_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_folders_parent_same_company";
            columns: ["company_id", "parent_id"];
            isOneToOne: false;
            referencedRelation: "document_folders";
            referencedColumns: ["company_id", "id"];
          },
        ];
      };
      document_sequences: {
        Row: {
          company_id: string;
          document_type: string;
          id: string;
          next_number: number;
          padding: number;
          prefix: string;
        };
        Insert: {
          company_id: string;
          document_type: string;
          id?: string;
          next_number?: number;
          padding?: number;
          prefix?: string;
        };
        Update: {
          company_id?: string;
          document_type?: string;
          id?: string;
          next_number?: number;
          padding?: number;
          prefix?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_sequences_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      document_share_links: {
        Row: {
          company_id: string;
          created_at: string;
          created_by: string | null;
          entity_id: string;
          entity_type: string;
          expires_at: string | null;
          id: string;
          last_viewed_at: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
          token_hash: string;
          view_count: number;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          entity_id: string;
          entity_type: string;
          expires_at?: string | null;
          id?: string;
          last_viewed_at?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          token_hash: string;
          view_count?: number;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          entity_id?: string;
          entity_type?: string;
          expires_at?: string | null;
          id?: string;
          last_viewed_at?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          token_hash?: string;
          view_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "document_share_links_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_share_links_entity_id_fkey";
            columns: ["entity_id"];
            isOneToOne: false;
            referencedRelation: "sales_invoices";
            referencedColumns: ["id"];
          },
        ];
      };
      document_theme_defaults: {
        Row: {
          company_id: string;
          kind: string;
          theme_id: string;
        };
        Insert: {
          company_id: string;
          kind: string;
          theme_id: string;
        };
        Update: {
          company_id?: string;
          kind?: string;
          theme_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_theme_defaults_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_theme_defaults_company_id_theme_id_fkey";
            columns: ["company_id", "theme_id"];
            isOneToOne: false;
            referencedRelation: "document_themes";
            referencedColumns: ["company_id", "id"];
          },
        ];
      };
      document_themes: {
        Row: {
          company_id: string;
          config: Json;
          created_at: string;
          id: string;
          name: string;
          revision: number;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          config?: Json;
          created_at?: string;
          id?: string;
          name: string;
          revision?: number;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          config?: Json;
          created_at?: string;
          id?: string;
          name?: string;
          revision?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_themes_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      document_tracking_assignments: {
        Row: {
          category_id: string;
          company_id: string;
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: string;
          option_id: string;
        };
        Insert: {
          category_id: string;
          company_id: string;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          id?: string;
          option_id: string;
        };
        Update: {
          category_id?: string;
          company_id?: string;
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          option_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_tracking_assignments_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "tracking_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_tracking_assignments_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_tracking_assignments_option_id_fkey";
            columns: ["option_id"];
            isOneToOne: false;
            referencedRelation: "tracking_options";
            referencedColumns: ["id"];
          },
        ];
      };
      email_outbox: {
        Row: {
          company_id: string;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          error: string | null;
          id: string;
          provider: string;
          provider_message_id: string | null;
          sent_by: string | null;
          status: string;
          subject: string;
          template: string;
          to_addresses: string[];
        };
        Insert: {
          company_id: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          error?: string | null;
          id?: string;
          provider: string;
          provider_message_id?: string | null;
          sent_by?: string | null;
          status: string;
          subject: string;
          template: string;
          to_addresses: string[];
        };
        Update: {
          company_id?: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          error?: string | null;
          id?: string;
          provider?: string;
          provider_message_id?: string | null;
          sent_by?: string | null;
          status?: string;
          subject?: string;
          template?: string;
          to_addresses?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "email_outbox_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      employee_expense_claims: {
        Row: {
          amount_minor: number;
          claim_date: string;
          claimant_user_id: string;
          company_id: string;
          created_at: string;
          currency_code: string;
          description: string;
          expense_account_id: string;
          id: string;
          posted_journal_id: string | null;
          reimbursement_payment_id: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database["public"]["Enums"]["expense_claim_status"];
          tax_minor: number;
          updated_at: string;
        };
        Insert: {
          amount_minor: number;
          claim_date: string;
          claimant_user_id: string;
          company_id: string;
          created_at?: string;
          currency_code: string;
          description: string;
          expense_account_id: string;
          id?: string;
          posted_journal_id?: string | null;
          reimbursement_payment_id?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["expense_claim_status"];
          tax_minor?: number;
          updated_at?: string;
        };
        Update: {
          amount_minor?: number;
          claim_date?: string;
          claimant_user_id?: string;
          company_id?: string;
          created_at?: string;
          currency_code?: string;
          description?: string;
          expense_account_id?: string;
          id?: string;
          posted_journal_id?: string | null;
          reimbursement_payment_id?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["expense_claim_status"];
          tax_minor?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employee_expense_claims_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_expense_claims_expense_account_id_fkey";
            columns: ["expense_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_expense_claims_posted_journal_id_fkey";
            columns: ["posted_journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_expense_claims_reimbursement_payment_id_fkey";
            columns: ["reimbursement_payment_id"];
            isOneToOne: false;
            referencedRelation: "supplier_payments";
            referencedColumns: ["id"];
          },
        ];
      };
      entitlement_overrides: {
        Row: {
          approval_status: string;
          created_at: string;
          created_by: string | null;
          effect: string;
          expires_at: string | null;
          feature_key: string;
          id: string;
          limit_value: number | null;
          notes: string;
          plan_code: string | null;
          reason: string;
          scope: string;
          scope_id: string | null;
          source: string;
          starts_at: string | null;
        };
        Insert: {
          approval_status?: string;
          created_at?: string;
          created_by?: string | null;
          effect: string;
          expires_at?: string | null;
          feature_key: string;
          id?: string;
          limit_value?: number | null;
          notes?: string;
          plan_code?: string | null;
          reason: string;
          scope: string;
          scope_id?: string | null;
          source: string;
          starts_at?: string | null;
        };
        Update: {
          approval_status?: string;
          created_at?: string;
          created_by?: string | null;
          effect?: string;
          expires_at?: string | null;
          feature_key?: string;
          id?: string;
          limit_value?: number | null;
          notes?: string;
          plan_code?: string | null;
          reason?: string;
          scope?: string;
          scope_id?: string | null;
          source?: string;
          starts_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "entitlement_overrides_feature_key_fkey";
            columns: ["feature_key"];
            isOneToOne: false;
            referencedRelation: "billing_features";
            referencedColumns: ["key"];
          },
        ];
      };
      exchange_rates: {
        Row: {
          company_id: string;
          created_at: string;
          created_by: string | null;
          from_currency: string;
          id: string;
          note: string | null;
          rate: number;
          rate_date: string;
          to_currency: string;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          from_currency: string;
          id?: string;
          note?: string | null;
          rate: number;
          rate_date: string;
          to_currency: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          from_currency?: string;
          id?: string;
          note?: string | null;
          rate?: number;
          rate_date?: string;
          to_currency?: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "exchange_rates_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      feature_dependencies: {
        Row: {
          feature_key: string;
          kind: string;
          other_key: string;
        };
        Insert: {
          feature_key: string;
          kind: string;
          other_key: string;
        };
        Update: {
          feature_key?: string;
          kind?: string;
          other_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: "feature_dependencies_feature_key_fkey";
            columns: ["feature_key"];
            isOneToOne: false;
            referencedRelation: "billing_features";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "feature_dependencies_other_key_fkey";
            columns: ["other_key"];
            isOneToOne: false;
            referencedRelation: "billing_features";
            referencedColumns: ["key"];
          },
        ];
      };
      feature_prices: {
        Row: {
          amount_minor: number;
          billing_interval: string;
          created_at: string;
          currency: string;
          effective_from: string | null;
          effective_to: string | null;
          feature_key: string;
          id: string;
          included_qty: number;
          max_qty: number | null;
          min_qty: number;
          model: string;
          reason: string;
          status: string;
          supersedes_id: string | null;
          tax_bps: number;
          tax_treatment: string;
          tiers: Json;
          version_no: number;
        };
        Insert: {
          amount_minor: number;
          billing_interval: string;
          created_at?: string;
          currency: string;
          effective_from?: string | null;
          effective_to?: string | null;
          feature_key: string;
          id?: string;
          included_qty?: number;
          max_qty?: number | null;
          min_qty?: number;
          model: string;
          reason: string;
          status?: string;
          supersedes_id?: string | null;
          tax_bps?: number;
          tax_treatment?: string;
          tiers?: Json;
          version_no?: number;
        };
        Update: {
          amount_minor?: number;
          billing_interval?: string;
          created_at?: string;
          currency?: string;
          effective_from?: string | null;
          effective_to?: string | null;
          feature_key?: string;
          id?: string;
          included_qty?: number;
          max_qty?: number | null;
          min_qty?: number;
          model?: string;
          reason?: string;
          status?: string;
          supersedes_id?: string | null;
          tax_bps?: number;
          tax_treatment?: string;
          tiers?: Json;
          version_no?: number;
        };
        Relationships: [
          {
            foreignKeyName: "feature_prices_feature_key_fkey";
            columns: ["feature_key"];
            isOneToOne: false;
            referencedRelation: "billing_features";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "feature_prices_supersedes_id_fkey";
            columns: ["supersedes_id"];
            isOneToOne: false;
            referencedRelation: "feature_prices";
            referencedColumns: ["id"];
          },
        ];
      };
      feature_rollouts: {
        Row: {
          allowlist: string[];
          created_at: string;
          created_by: string | null;
          ends_at: string | null;
          feature_key: string;
          id: string;
          mode: string;
          percent: number;
          reason: string;
          starts_at: string | null;
          target_region: string | null;
        };
        Insert: {
          allowlist?: string[];
          created_at?: string;
          created_by?: string | null;
          ends_at?: string | null;
          feature_key: string;
          id?: string;
          mode: string;
          percent?: number;
          reason: string;
          starts_at?: string | null;
          target_region?: string | null;
        };
        Update: {
          allowlist?: string[];
          created_at?: string;
          created_by?: string | null;
          ends_at?: string | null;
          feature_key?: string;
          id?: string;
          mode?: string;
          percent?: number;
          reason?: string;
          starts_at?: string | null;
          target_region?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "feature_rollouts_feature_key_fkey";
            columns: ["feature_key"];
            isOneToOne: false;
            referencedRelation: "billing_features";
            referencedColumns: ["key"];
          },
        ];
      };
      firm_client_links: {
        Row: {
          access_level: Database["public"]["Enums"]["firm_access_level"];
          company_id: string;
          created_at: string;
          firm_id: string;
          id: string;
          linked_by: string | null;
          revoked_at: string | null;
        };
        Insert: {
          access_level?: Database["public"]["Enums"]["firm_access_level"];
          company_id: string;
          created_at?: string;
          firm_id: string;
          id?: string;
          linked_by?: string | null;
          revoked_at?: string | null;
        };
        Update: {
          access_level?: Database["public"]["Enums"]["firm_access_level"];
          company_id?: string;
          created_at?: string;
          firm_id?: string;
          id?: string;
          linked_by?: string | null;
          revoked_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "firm_client_links_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "firm_client_links_firm_id_fkey";
            columns: ["firm_id"];
            isOneToOne: false;
            referencedRelation: "firms";
            referencedColumns: ["id"];
          },
        ];
      };
      firm_members: {
        Row: {
          created_at: string;
          firm_id: string;
          id: string;
          role: Database["public"]["Enums"]["firm_member_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          firm_id: string;
          id?: string;
          role?: Database["public"]["Enums"]["firm_member_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          firm_id?: string;
          id?: string;
          role?: Database["public"]["Enums"]["firm_member_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "firm_members_firm_id_fkey";
            columns: ["firm_id"];
            isOneToOne: false;
            referencedRelation: "firms";
            referencedColumns: ["id"];
          },
        ];
      };
      firms: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      fixed_asset_import_refs: {
        Row: {
          asset_id: string;
          company_id: string;
          created_at: string;
          created_by: string;
          external_code: string;
          original_payload: Json;
        };
        Insert: {
          asset_id: string;
          company_id: string;
          created_at?: string;
          created_by: string;
          external_code: string;
          original_payload: Json;
        };
        Update: {
          asset_id?: string;
          company_id?: string;
          created_at?: string;
          created_by?: string;
          external_code?: string;
          original_payload?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "fixed_asset_import_refs_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: true;
            referencedRelation: "fixed_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fixed_asset_import_refs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      fixed_assets: {
        Row: {
          accumulated_account_id: string;
          annual_rate_bps: number | null;
          asset_account_id: string;
          asset_number: string;
          asset_type_id: string | null;
          company_id: string;
          cost_minor: number;
          created_at: string;
          created_by: string | null;
          depreciated_through: string | null;
          depreciation_method: string;
          depreciation_start_date: string;
          description: string | null;
          disposal_date: string | null;
          disposal_journal_id: string | null;
          disposal_proceeds_minor: number | null;
          expense_account_id: string;
          id: string;
          name: string;
          notes: string | null;
          opening_accumulated_minor: number;
          purchase_date: string;
          residual_minor: number;
          source_bill_id: string | null;
          source_bill_line_id: string | null;
          status: string;
          updated_at: string;
          useful_life_months: number | null;
        };
        Insert: {
          accumulated_account_id: string;
          annual_rate_bps?: number | null;
          asset_account_id: string;
          asset_number: string;
          asset_type_id?: string | null;
          company_id: string;
          cost_minor: number;
          created_at?: string;
          created_by?: string | null;
          depreciated_through?: string | null;
          depreciation_method: string;
          depreciation_start_date: string;
          description?: string | null;
          disposal_date?: string | null;
          disposal_journal_id?: string | null;
          disposal_proceeds_minor?: number | null;
          expense_account_id: string;
          id?: string;
          name: string;
          notes?: string | null;
          opening_accumulated_minor?: number;
          purchase_date: string;
          residual_minor?: number;
          source_bill_id?: string | null;
          source_bill_line_id?: string | null;
          status?: string;
          updated_at?: string;
          useful_life_months?: number | null;
        };
        Update: {
          accumulated_account_id?: string;
          annual_rate_bps?: number | null;
          asset_account_id?: string;
          asset_number?: string;
          asset_type_id?: string | null;
          company_id?: string;
          cost_minor?: number;
          created_at?: string;
          created_by?: string | null;
          depreciated_through?: string | null;
          depreciation_method?: string;
          depreciation_start_date?: string;
          description?: string | null;
          disposal_date?: string | null;
          disposal_journal_id?: string | null;
          disposal_proceeds_minor?: number | null;
          expense_account_id?: string;
          id?: string;
          name?: string;
          notes?: string | null;
          opening_accumulated_minor?: number;
          purchase_date?: string;
          residual_minor?: number;
          source_bill_id?: string | null;
          source_bill_line_id?: string | null;
          status?: string;
          updated_at?: string;
          useful_life_months?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "fixed_assets_accumulated_account_id_fkey";
            columns: ["accumulated_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fixed_assets_asset_account_id_fkey";
            columns: ["asset_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fixed_assets_asset_type_id_fkey";
            columns: ["asset_type_id"];
            isOneToOne: false;
            referencedRelation: "asset_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fixed_assets_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fixed_assets_disposal_journal_id_fkey";
            columns: ["disposal_journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fixed_assets_expense_account_id_fkey";
            columns: ["expense_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fixed_assets_source_bill_id_fkey";
            columns: ["source_bill_id"];
            isOneToOne: false;
            referencedRelation: "purchase_bills";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fixed_assets_source_bill_line_id_fkey";
            columns: ["source_bill_line_id"];
            isOneToOne: false;
            referencedRelation: "purchase_bill_lines";
            referencedColumns: ["id"];
          },
        ];
      };
      fx_journal_tags: {
        Row: {
          company_id: string;
          created_at: string;
          currency_code: string;
          journal_id: string;
          kind: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          currency_code: string;
          journal_id: string;
          kind: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          currency_code?: string;
          journal_id?: string;
          kind?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fx_journal_tags_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      fx_realised_postings: {
        Row: {
          allocation_id: string;
          company_id: string;
          created_at: string;
          currency_code: string;
          document_id: string;
          document_rate: number;
          gain_loss_base_minor: number;
          id: string;
          journal_id: string | null;
          kind: string;
          reversal_journal_id: string | null;
          reversed_at: string | null;
          settled_minor: number;
          settlement_rate: number;
        };
        Insert: {
          allocation_id: string;
          company_id: string;
          created_at?: string;
          currency_code: string;
          document_id: string;
          document_rate: number;
          gain_loss_base_minor: number;
          id?: string;
          journal_id?: string | null;
          kind: string;
          reversal_journal_id?: string | null;
          reversed_at?: string | null;
          settled_minor: number;
          settlement_rate: number;
        };
        Update: {
          allocation_id?: string;
          company_id?: string;
          created_at?: string;
          currency_code?: string;
          document_id?: string;
          document_rate?: number;
          gain_loss_base_minor?: number;
          id?: string;
          journal_id?: string | null;
          kind?: string;
          reversal_journal_id?: string | null;
          reversed_at?: string | null;
          settled_minor?: number;
          settlement_rate?: number;
        };
        Relationships: [
          {
            foreignKeyName: "fx_realised_postings_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      fx_revaluation_runs: {
        Row: {
          as_of_date: string;
          company_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          journal_ids: string[];
          note: string | null;
          rates: Json;
          reverse_on: string;
          seq: number;
          total_gain_minor: number;
          total_loss_minor: number;
        };
        Insert: {
          as_of_date: string;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          journal_ids?: string[];
          note?: string | null;
          rates?: Json;
          reverse_on: string;
          seq?: number;
          total_gain_minor?: number;
          total_loss_minor?: number;
        };
        Update: {
          as_of_date?: string;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          journal_ids?: string[];
          note?: string | null;
          rates?: Json;
          reverse_on?: string;
          seq?: number;
          total_gain_minor?: number;
          total_loss_minor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "fx_revaluation_runs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      inbox_documents: {
        Row: {
          company_id: string;
          content_type: string | null;
          created_at: string;
          created_by: string;
          file_name: string;
          id: string;
          linked_entity_id: string | null;
          linked_entity_type: string | null;
          note: string | null;
          scan_status: string;
          size_bytes: number;
          status: string;
        };
        Insert: {
          company_id: string;
          content_type?: string | null;
          created_at?: string;
          created_by: string;
          file_name: string;
          id?: string;
          linked_entity_id?: string | null;
          linked_entity_type?: string | null;
          note?: string | null;
          scan_status?: string;
          size_bytes: number;
          status?: string;
        };
        Update: {
          company_id?: string;
          content_type?: string | null;
          created_at?: string;
          created_by?: string;
          file_name?: string;
          id?: string;
          linked_entity_id?: string | null;
          linked_entity_type?: string | null;
          note?: string | null;
          scan_status?: string;
          size_bytes?: number;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inbox_documents_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      issued_document_appearances: {
        Row: {
          appearance: Json;
          captured_at: string;
          company_id: string;
          document_id: string;
          kind: string;
          provenance: string;
          theme_id: string | null;
          theme_revision: number | null;
        };
        Insert: {
          appearance: Json;
          captured_at?: string;
          company_id: string;
          document_id: string;
          kind: string;
          provenance: string;
          theme_id?: string | null;
          theme_revision?: number | null;
        };
        Update: {
          appearance?: Json;
          captured_at?: string;
          company_id?: string;
          document_id?: string;
          kind?: string;
          provenance?: string;
          theme_id?: string | null;
          theme_revision?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "issued_document_appearances_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "issued_document_appearances_company_id_theme_id_fkey";
            columns: ["company_id", "theme_id"];
            isOneToOne: false;
            referencedRelation: "document_themes";
            referencedColumns: ["company_id", "id"];
          },
        ];
      };
      journal_auto_reversals: {
        Row: {
          attempts: number;
          company_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          journal_id: string;
          last_error: string | null;
          origin: string;
          processed_at: string | null;
          reversal_journal_id: string | null;
          reverse_on: string;
          status: string;
        };
        Insert: {
          attempts?: number;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          journal_id: string;
          last_error?: string | null;
          origin?: string;
          processed_at?: string | null;
          reversal_journal_id?: string | null;
          reverse_on: string;
          status?: string;
        };
        Update: {
          attempts?: number;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          journal_id?: string;
          last_error?: string | null;
          origin?: string;
          processed_at?: string | null;
          reversal_journal_id?: string | null;
          reverse_on?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "journal_auto_reversals_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      journal_lines: {
        Row: {
          account_id: string;
          company_id: string;
          created_at: string;
          credit_minor: number;
          debit_minor: number;
          description: string | null;
          id: string;
          journal_id: string;
          line_no: number;
        };
        Insert: {
          account_id: string;
          company_id: string;
          created_at?: string;
          credit_minor?: number;
          debit_minor?: number;
          description?: string | null;
          id?: string;
          journal_id: string;
          line_no: number;
        };
        Update: {
          account_id?: string;
          company_id?: string;
          created_at?: string;
          credit_minor?: number;
          debit_minor?: number;
          description?: string | null;
          id?: string;
          journal_id?: string;
          line_no?: number;
        };
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "journal_lines_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "journal_lines_journal_id_fkey";
            columns: ["journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
        ];
      };
      journals: {
        Row: {
          company_id: string;
          created_at: string;
          created_by: string;
          currency_code: string;
          fx_rate_to_base: number;
          id: string;
          idempotency_key: string | null;
          journal_date: string;
          journal_number: number;
          memo: string | null;
          period_id: string;
          posted_at: string | null;
          posted_by: string | null;
          reversed_by_journal_id: string | null;
          reverses_journal_id: string | null;
          source_id: string | null;
          source_type: Database["public"]["Enums"]["journal_source_type"];
          status: Database["public"]["Enums"]["journal_status"];
          updated_at: string;
          voided_at: string | null;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          created_by: string;
          currency_code: string;
          fx_rate_to_base?: number;
          id?: string;
          idempotency_key?: string | null;
          journal_date: string;
          journal_number: number;
          memo?: string | null;
          period_id: string;
          posted_at?: string | null;
          posted_by?: string | null;
          reversed_by_journal_id?: string | null;
          reverses_journal_id?: string | null;
          source_id?: string | null;
          source_type?: Database["public"]["Enums"]["journal_source_type"];
          status?: Database["public"]["Enums"]["journal_status"];
          updated_at?: string;
          voided_at?: string | null;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          created_by?: string;
          currency_code?: string;
          fx_rate_to_base?: number;
          id?: string;
          idempotency_key?: string | null;
          journal_date?: string;
          journal_number?: number;
          memo?: string | null;
          period_id?: string;
          posted_at?: string | null;
          posted_by?: string | null;
          reversed_by_journal_id?: string | null;
          reverses_journal_id?: string | null;
          source_id?: string | null;
          source_type?: Database["public"]["Enums"]["journal_source_type"];
          status?: Database["public"]["Enums"]["journal_status"];
          updated_at?: string;
          voided_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "journals_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "journals_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "accounting_periods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "journals_reversed_by_journal_id_fkey";
            columns: ["reversed_by_journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "journals_reverses_journal_id_fkey";
            columns: ["reverses_journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
        ];
      };
      line_tracking_assignments: {
        Row: {
          category_id: string;
          company_id: string;
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: string;
          line_id: string;
          option_id: string;
        };
        Insert: {
          category_id: string;
          company_id: string;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          id?: string;
          line_id: string;
          option_id: string;
        };
        Update: {
          category_id?: string;
          company_id?: string;
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          line_id?: string;
          option_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "line_tracking_assignments_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "tracking_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "line_tracking_assignments_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "line_tracking_assignments_option_id_fkey";
            columns: ["option_id"];
            isOneToOne: false;
            referencedRelation: "tracking_options";
            referencedColumns: ["id"];
          },
        ];
      };
      member_permission_adjustments: {
        Row: {
          company_id: string;
          created_at: string;
          created_by: string | null;
          effect: string;
          permission: string;
          user_id: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          effect: string;
          permission: string;
          user_id: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          effect?: string;
          permission?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "member_permission_adjustments_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      money_deposit_items: {
        Row: {
          amount_minor: number;
          company_id: string;
          deposit_id: string;
          id: string;
          source_document_id: string;
        };
        Insert: {
          amount_minor: number;
          company_id: string;
          deposit_id: string;
          id?: string;
          source_document_id: string;
        };
        Update: {
          amount_minor?: number;
          company_id?: string;
          deposit_id?: string;
          id?: string;
          source_document_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "money_deposit_items_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "money_deposit_items_deposit_id_fkey";
            columns: ["deposit_id"];
            isOneToOne: false;
            referencedRelation: "money_documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "money_deposit_items_source_document_id_fkey";
            columns: ["source_document_id"];
            isOneToOne: true;
            referencedRelation: "money_documents";
            referencedColumns: ["id"];
          },
        ];
      };
      money_document_credit_uses: {
        Row: {
          amount_minor: number;
          company_id: string;
          created_at: string;
          document_id: string;
          id: string;
          source_id: string;
          source_kind: string;
        };
        Insert: {
          amount_minor: number;
          company_id: string;
          created_at?: string;
          document_id: string;
          id?: string;
          source_id: string;
          source_kind: string;
        };
        Update: {
          amount_minor?: number;
          company_id?: string;
          created_at?: string;
          document_id?: string;
          id?: string;
          source_id?: string;
          source_kind?: string;
        };
        Relationships: [
          {
            foreignKeyName: "money_document_credit_uses_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "money_document_credit_uses_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "money_documents";
            referencedColumns: ["id"];
          },
        ];
      };
      money_document_lines: {
        Row: {
          account_id: string;
          company_id: string;
          description: string;
          document_id: string;
          id: string;
          line_no: number;
          net_minor: number;
          project_id: string | null;
          tax_minor: number;
        };
        Insert: {
          account_id: string;
          company_id: string;
          description: string;
          document_id: string;
          id?: string;
          line_no: number;
          net_minor: number;
          project_id?: string | null;
          tax_minor: number;
        };
        Update: {
          account_id?: string;
          company_id?: string;
          description?: string;
          document_id?: string;
          id?: string;
          line_no?: number;
          net_minor?: number;
          project_id?: string | null;
          tax_minor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "money_document_lines_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "money_document_lines_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "money_document_lines_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "money_documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "money_document_lines_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      money_documents: {
        Row: {
          adjustment_type: string | null;
          bank_account_id: string | null;
          company_id: string;
          contact_id: string | null;
          counter_account_id: string | null;
          created_at: string;
          created_by: string;
          currency_code: string;
          deposit_status: string | null;
          deposited_in_id: string | null;
          document_date: string;
          fx_rate_to_base: number;
          id: string;
          idempotency_key: string;
          kind: string;
          memo: string | null;
          posted_journal_id: string | null;
          project_id: string | null;
          reference: string | null;
          settlement: string;
          source_credit_note_id: string | null;
          status: string;
          tax_minor: number;
          total_minor: number;
          updated_at: string;
          void_journal_id: string | null;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          adjustment_type?: string | null;
          bank_account_id?: string | null;
          company_id: string;
          contact_id?: string | null;
          counter_account_id?: string | null;
          created_at?: string;
          created_by: string;
          currency_code: string;
          deposit_status?: string | null;
          deposited_in_id?: string | null;
          document_date: string;
          fx_rate_to_base?: number;
          id?: string;
          idempotency_key: string;
          kind: string;
          memo?: string | null;
          posted_journal_id?: string | null;
          project_id?: string | null;
          reference?: string | null;
          settlement?: string;
          source_credit_note_id?: string | null;
          status?: string;
          tax_minor?: number;
          total_minor: number;
          updated_at?: string;
          void_journal_id?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          adjustment_type?: string | null;
          bank_account_id?: string | null;
          company_id?: string;
          contact_id?: string | null;
          counter_account_id?: string | null;
          created_at?: string;
          created_by?: string;
          currency_code?: string;
          deposit_status?: string | null;
          deposited_in_id?: string | null;
          document_date?: string;
          fx_rate_to_base?: number;
          id?: string;
          idempotency_key?: string;
          kind?: string;
          memo?: string | null;
          posted_journal_id?: string | null;
          project_id?: string | null;
          reference?: string | null;
          settlement?: string;
          source_credit_note_id?: string | null;
          status?: string;
          tax_minor?: number;
          total_minor?: number;
          updated_at?: string;
          void_journal_id?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "money_documents_bank_account_id_fkey";
            columns: ["bank_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "money_documents_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "money_documents_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "money_documents_counter_account_id_fkey";
            columns: ["counter_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "money_documents_deposited_in_fk";
            columns: ["deposited_in_id"];
            isOneToOne: false;
            referencedRelation: "money_documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "money_documents_posted_journal_id_fkey";
            columns: ["posted_journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "money_documents_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "money_documents_void_journal_id_fkey";
            columns: ["void_journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
        ];
      };
      mrr_movements: {
        Row: {
          captured_at: string;
          captured_by: string | null;
          company_id: string;
          currency: string;
          current_mrr_minor: number;
          delta_minor: number;
          id: string;
          movement: string;
          previous_mrr_minor: number;
        };
        Insert: {
          captured_at?: string;
          captured_by?: string | null;
          company_id: string;
          currency: string;
          current_mrr_minor: number;
          delta_minor: number;
          id?: string;
          movement: string;
          previous_mrr_minor: number;
        };
        Update: {
          captured_at?: string;
          captured_by?: string | null;
          company_id?: string;
          currency?: string;
          current_mrr_minor?: number;
          delta_minor?: number;
          id?: string;
          movement?: string;
          previous_mrr_minor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "mrr_movements_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      organisation_config: {
        Row: {
          category: string;
          company_id: string;
          document: Json;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          category: string;
          company_id: string;
          document?: Json;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          category?: string;
          company_id?: string;
          document?: Json;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "organisation_config_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      organisation_features: {
        Row: {
          company_id: string;
          config: Json;
          enabled: boolean;
          feature_key: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          company_id: string;
          config?: Json;
          enabled?: boolean;
          feature_key: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          company_id?: string;
          config?: Json;
          enabled?: boolean;
          feature_key?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "organisation_features_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      organisation_lock_policy: {
        Row: {
          company_id: string;
          conversion_date: string | null;
          lock_date_everyone: string | null;
          lock_date_except_advisors: string | null;
          require_override_reason: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          company_id: string;
          conversion_date?: string | null;
          lock_date_everyone?: string | null;
          lock_date_except_advisors?: string | null;
          require_override_reason?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          company_id?: string;
          conversion_date?: string | null;
          lock_date_everyone?: string | null;
          lock_date_except_advisors?: string | null;
          require_override_reason?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "organisation_lock_policy_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: true;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      organisation_secrets: {
        Row: {
          ciphertext: string;
          company_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          last4: string | null;
          rotated_at: string | null;
          secret_key: string;
        };
        Insert: {
          ciphertext: string;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          last4?: string | null;
          rotated_at?: string | null;
          secret_key: string;
        };
        Update: {
          ciphertext?: string;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          last4?: string | null;
          rotated_at?: string | null;
          secret_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organisation_secrets_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_prices: {
        Row: {
          amount_minor: number;
          archived_at: string | null;
          billing_interval: string;
          currency: string;
          id: string;
          needs_review: boolean;
          stripe_price_id: string | null;
          version_id: string;
        };
        Insert: {
          amount_minor: number;
          archived_at?: string | null;
          billing_interval: string;
          currency: string;
          id?: string;
          needs_review?: boolean;
          stripe_price_id?: string | null;
          version_id: string;
        };
        Update: {
          amount_minor?: number;
          archived_at?: string | null;
          billing_interval?: string;
          currency?: string;
          id?: string;
          needs_review?: boolean;
          stripe_price_id?: string | null;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_prices_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "plan_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_version_limits: {
        Row: {
          enabled: boolean;
          feature_key: string;
          limit_value: number | null;
          version_id: string;
        };
        Insert: {
          enabled?: boolean;
          feature_key: string;
          limit_value?: number | null;
          version_id: string;
        };
        Update: {
          enabled?: boolean;
          feature_key?: string;
          limit_value?: number | null;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_version_limits_feature_key_fkey";
            columns: ["feature_key"];
            isOneToOne: false;
            referencedRelation: "billing_features";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "plan_version_limits_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "plan_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_versions: {
        Row: {
          audience: string;
          badge: string | null;
          created_at: string;
          created_by: string | null;
          effective_from: string | null;
          id: string;
          name: string;
          plan_code: string;
          published_at: string | null;
          reason: string | null;
          sort_order: number;
          status: string;
          summary: string;
          version_no: number;
          visibility: string;
        };
        Insert: {
          audience?: string;
          badge?: string | null;
          created_at?: string;
          created_by?: string | null;
          effective_from?: string | null;
          id?: string;
          name: string;
          plan_code: string;
          published_at?: string | null;
          reason?: string | null;
          sort_order?: number;
          status: string;
          summary?: string;
          version_no: number;
          visibility?: string;
        };
        Update: {
          audience?: string;
          badge?: string | null;
          created_at?: string;
          created_by?: string | null;
          effective_from?: string | null;
          id?: string;
          name?: string;
          plan_code?: string;
          published_at?: string | null;
          reason?: string | null;
          sort_order?: number;
          status?: string;
          summary?: string;
          version_no?: number;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_versions_plan_code_fkey";
            columns: ["plan_code"];
            isOneToOne: false;
            referencedRelation: "billing_plans";
            referencedColumns: ["code"];
          },
        ];
      };
      platform_alert_events: {
        Row: {
          acknowledged_at: string | null;
          acknowledged_by: string | null;
          first_seen_at: string;
          id: string;
          last_seen_at: string;
          metric: string;
          observations: number;
          observed: number;
          quiet_hours: boolean;
          resolution_reason: string | null;
          resolved_at: string | null;
          rule_id: string;
          severity: string;
          threshold: number;
        };
        Insert: {
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          first_seen_at?: string;
          id?: string;
          last_seen_at?: string;
          metric: string;
          observations?: number;
          observed: number;
          quiet_hours?: boolean;
          resolution_reason?: string | null;
          resolved_at?: string | null;
          rule_id: string;
          severity: string;
          threshold: number;
        };
        Update: {
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          first_seen_at?: string;
          id?: string;
          last_seen_at?: string;
          metric?: string;
          observations?: number;
          observed?: number;
          quiet_hours?: boolean;
          resolution_reason?: string | null;
          resolved_at?: string | null;
          rule_id?: string;
          severity?: string;
          threshold?: number;
        };
        Relationships: [
          {
            foreignKeyName: "platform_alert_events_rule_id_fkey";
            columns: ["rule_id"];
            isOneToOne: false;
            referencedRelation: "platform_alert_rules";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_alert_rules: {
        Row: {
          created_at: string;
          created_by: string;
          enabled: boolean;
          id: string;
          metric: string | null;
          name: string;
          observed: number | null;
          observed_at: string | null;
          quiet_end_utc: number | null;
          quiet_start_utc: number | null;
          row_version: number;
          severity: string;
          state: string;
          threshold: number;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          enabled?: boolean;
          id?: string;
          metric?: string | null;
          name: string;
          observed?: number | null;
          observed_at?: string | null;
          quiet_end_utc?: number | null;
          quiet_start_utc?: number | null;
          row_version?: number;
          severity?: string;
          state?: string;
          threshold: number;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          enabled?: boolean;
          id?: string;
          metric?: string | null;
          name?: string;
          observed?: number | null;
          observed_at?: string | null;
          quiet_end_utc?: number | null;
          quiet_start_utc?: number | null;
          row_version?: number;
          severity?: string;
          state?: string;
          threshold?: number;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      platform_api_keys: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          key_hash: string;
          label: string;
          retired_at: string | null;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          key_hash: string;
          label: string;
          retired_at?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          key_hash?: string;
          label?: string;
          retired_at?: string | null;
        };
        Relationships: [];
      };
      platform_audit: {
        Row: {
          action: string;
          actor_user_id: string | null;
          after_state: Json | null;
          before_state: Json | null;
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: number;
          prev_hash: string | null;
          reason: string;
          request_ip: string | null;
          row_hash: string | null;
          session_id: string | null;
        };
        Insert: {
          action: string;
          actor_user_id?: string | null;
          after_state?: Json | null;
          before_state?: Json | null;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          id?: never;
          prev_hash?: string | null;
          reason: string;
          request_ip?: string | null;
          row_hash?: string | null;
          session_id?: string | null;
        };
        Update: {
          action?: string;
          actor_user_id?: string | null;
          after_state?: Json | null;
          before_state?: Json | null;
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          id?: never;
          prev_hash?: string | null;
          reason?: string;
          request_ip?: string | null;
          row_hash?: string | null;
          session_id?: string | null;
        };
        Relationships: [];
      };
      platform_billing_audit: {
        Row: {
          action: string;
          actor_user_id: string | null;
          after_state: Json;
          before_state: Json;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          reason: string | null;
        };
        Insert: {
          action: string;
          actor_user_id?: string | null;
          after_state?: Json;
          before_state?: Json;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          reason?: string | null;
        };
        Update: {
          action?: string;
          actor_user_id?: string | null;
          after_state?: Json;
          before_state?: Json;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          reason?: string | null;
        };
        Relationships: [];
      };
      platform_custom_roles: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          permissions: string[];
          scope: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          permissions?: string[];
          scope: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          permissions?: string[];
          scope?: string;
        };
        Relationships: [];
      };
      platform_incidents: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          impact_started_at: string | null;
          opened_by: string;
          owner_id: string | null;
          phase: string;
          resolved_at: string | null;
          resolved_by: string | null;
          row_version: number;
          severity: string;
          status: string;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string;
          description?: string;
          id?: string;
          impact_started_at?: string | null;
          opened_by: string;
          owner_id?: string | null;
          phase?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          row_version?: number;
          severity?: string;
          status: string;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          impact_started_at?: string | null;
          opened_by?: string;
          owner_id?: string | null;
          phase?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          row_version?: number;
          severity?: string;
          status?: string;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      platform_job_runs: {
        Row: {
          attempt: number;
          error_code: string | null;
          finished_at: string | null;
          id: number;
          job_id: string;
          result: Json | null;
          started_at: string;
          status: string;
        };
        Insert: {
          attempt: number;
          error_code?: string | null;
          finished_at?: string | null;
          id?: never;
          job_id: string;
          result?: Json | null;
          started_at?: string;
          status: string;
        };
        Update: {
          attempt?: number;
          error_code?: string | null;
          finished_at?: string | null;
          id?: never;
          job_id?: string;
          result?: Json | null;
          started_at?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_job_runs_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "platform_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_jobs: {
        Row: {
          attempts: number;
          created_at: string;
          created_by: string | null;
          finished_at: string | null;
          id: string;
          kind: string | null;
          last_error: string | null;
          max_attempts: number;
          name: string;
          next_run_at: string;
          origin: string;
          result: Json | null;
          row_version: number;
          started_at: string | null;
          status: string;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          created_by?: string | null;
          finished_at?: string | null;
          id?: string;
          kind?: string | null;
          last_error?: string | null;
          max_attempts?: number;
          name: string;
          next_run_at?: string;
          origin?: string;
          result?: Json | null;
          row_version?: number;
          started_at?: string | null;
          status: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          created_by?: string | null;
          finished_at?: string | null;
          id?: string;
          kind?: string | null;
          last_error?: string | null;
          max_attempts?: number;
          name?: string;
          next_run_at?: string;
          origin?: string;
          result?: Json | null;
          row_version?: number;
          started_at?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      platform_partners: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          revenue_share_minor: number | null;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
          revenue_share_minor?: number | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          revenue_share_minor?: number | null;
        };
        Relationships: [];
      };
      platform_promotions: {
        Row: {
          approver_id: string | null;
          created_at: string;
          id: string;
          requester_id: string;
          source_id: string;
          status: string;
          target_id: string;
        };
        Insert: {
          approver_id?: string | null;
          created_at?: string;
          id?: string;
          requester_id: string;
          source_id: string;
          status: string;
          target_id: string;
        };
        Update: {
          approver_id?: string | null;
          created_at?: string;
          id?: string;
          requester_id?: string;
          source_id?: string;
          status?: string;
          target_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_promotions_source_fk";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "platform_promotions_target_fk";
            columns: ["target_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_records: {
        Row: {
          company_id: string | null;
          created_at: string;
          document: Json;
          id: string;
          kind: string;
          name: string;
          status: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          company_id?: string | null;
          created_at?: string;
          document?: Json;
          id?: string;
          kind: string;
          name: string;
          status?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          company_id?: string | null;
          created_at?: string;
          document?: Json;
          id?: string;
          kind?: string;
          name?: string;
          status?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "platform_records_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_releases: {
        Row: {
          change_reference: string | null;
          created_at: string;
          created_by: string;
          id: string;
          rollback_reference: string | null;
          row_version: number;
          stage: string;
          summary: string;
          title: string | null;
          updated_at: string | null;
          version: string;
        };
        Insert: {
          change_reference?: string | null;
          created_at?: string;
          created_by: string;
          id?: string;
          rollback_reference?: string | null;
          row_version?: number;
          stage?: string;
          summary?: string;
          title?: string | null;
          updated_at?: string | null;
          version: string;
        };
        Update: {
          change_reference?: string | null;
          created_at?: string;
          created_by?: string;
          id?: string;
          rollback_reference?: string | null;
          row_version?: number;
          stage?: string;
          summary?: string;
          title?: string | null;
          updated_at?: string | null;
          version?: string;
        };
        Relationships: [];
      };
      platform_role_assignments: {
        Row: {
          created_at: string;
          id: string;
          role_id: string;
          scope_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role_id: string;
          scope_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role_id?: string;
          scope_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_role_assignments_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "platform_custom_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_roles: {
        Row: {
          created_at: string;
          role: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          role: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      platform_sandbox_requests: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          requested_by: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          requested_by: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          requested_by?: string;
        };
        Relationships: [];
      };
      platform_segment_members: {
        Row: {
          active: boolean;
          added_at: string | null;
          company_id: string;
          removed_at: string | null;
          segment_id: string;
        };
        Insert: {
          active?: boolean;
          added_at?: string | null;
          company_id: string;
          removed_at?: string | null;
          segment_id: string;
        };
        Update: {
          active?: boolean;
          added_at?: string | null;
          company_id?: string;
          removed_at?: string | null;
          segment_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_segment_members_company_fk";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "platform_segment_members_segment_id_fkey";
            columns: ["segment_id"];
            isOneToOne: false;
            referencedRelation: "platform_segments";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_segments: {
        Row: {
          archived_at: string | null;
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          row_version: number;
          updated_at: string | null;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
          row_version?: number;
          updated_at?: string | null;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          row_version?: number;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      platform_service_cases: {
        Row: {
          closed_at: string | null;
          company_id: string;
          created_at: string;
          description: string;
          due_at: string | null;
          id: string;
          opened_by: string;
          owner_id: string | null;
          phase: string;
          priority: string;
          row_version: number;
          status: string;
          subject: string;
          updated_at: string | null;
        };
        Insert: {
          closed_at?: string | null;
          company_id: string;
          created_at?: string;
          description?: string;
          due_at?: string | null;
          id?: string;
          opened_by: string;
          owner_id?: string | null;
          phase?: string;
          priority?: string;
          row_version?: number;
          status: string;
          subject: string;
          updated_at?: string | null;
        };
        Update: {
          closed_at?: string | null;
          company_id?: string;
          created_at?: string;
          description?: string;
          due_at?: string | null;
          id?: string;
          opened_by?: string;
          owner_id?: string | null;
          phase?: string;
          priority?: string;
          row_version?: number;
          status?: string;
          subject?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "platform_service_cases_company_fk";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_support_grants: {
        Row: {
          approval_request_id: string | null;
          company_id: string;
          created_at: string;
          expires_at: string;
          id: string;
          reason: string;
          revoked_at: string | null;
          user_id: string;
        };
        Insert: {
          approval_request_id?: string | null;
          company_id: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          reason: string;
          revoked_at?: string | null;
          user_id: string;
        };
        Update: {
          approval_request_id?: string | null;
          company_id?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          reason?: string;
          revoked_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_support_grants_approval_request_id_fkey";
            columns: ["approval_request_id"];
            isOneToOne: false;
            referencedRelation: "approval_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "platform_support_grants_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_tenant_controls: {
        Row: {
          company_id: string;
          status: string;
          storage_quota_bytes: number | null;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          status?: string;
          storage_quota_bytes?: number | null;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          status?: string;
          storage_quota_bytes?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_tenant_controls_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: true;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_user_controls: {
        Row: {
          require_mfa: boolean;
          revoked_before: string | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          require_mfa?: boolean;
          revoked_before?: string | null;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          require_mfa?: boolean;
          revoked_before?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      platform_webhook_deliveries: {
        Row: {
          created_at: string;
          event_id: string;
          id: string;
          provider: string;
          status: string;
        };
        Insert: {
          created_at?: string;
          event_id: string;
          id?: string;
          provider: string;
          status: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          id?: string;
          provider?: string;
          status?: string;
        };
        Relationships: [];
      };
      portal_bank_change_requests: {
        Row: {
          account_name: string;
          account_number: string;
          bank_name: string;
          company_id: string;
          contact_id: string;
          country_code: string;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          decision_note: string | null;
          id: string;
          membership_id: string;
          requested_by: string | null;
          routing_code: string | null;
          status: string;
        };
        Insert: {
          account_name: string;
          account_number: string;
          bank_name: string;
          company_id: string;
          contact_id: string;
          country_code: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          id?: string;
          membership_id: string;
          requested_by?: string | null;
          routing_code?: string | null;
          status: string;
        };
        Update: {
          account_name?: string;
          account_number?: string;
          bank_name?: string;
          company_id?: string;
          contact_id?: string;
          country_code?: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          id?: string;
          membership_id?: string;
          requested_by?: string | null;
          routing_code?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "portal_bank_change_requests_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_bank_change_requests_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_bank_change_requests_membership_id_fkey";
            columns: ["membership_id"];
            isOneToOne: false;
            referencedRelation: "portal_memberships";
            referencedColumns: ["id"];
          },
        ];
      };
      portal_files: {
        Row: {
          byte_size: number;
          category: string;
          company_id: string;
          contact_id: string;
          content: string;
          created_at: string;
          file_name: string;
          id: string;
          mime_type: string;
          submission_id: string | null;
          uploaded_by: string | null;
          uploader_role: string;
        };
        Insert: {
          byte_size: number;
          category: string;
          company_id: string;
          contact_id: string;
          content: string;
          created_at?: string;
          file_name: string;
          id?: string;
          mime_type: string;
          submission_id?: string | null;
          uploaded_by?: string | null;
          uploader_role: string;
        };
        Update: {
          byte_size?: number;
          category?: string;
          company_id?: string;
          contact_id?: string;
          content?: string;
          created_at?: string;
          file_name?: string;
          id?: string;
          mime_type?: string;
          submission_id?: string | null;
          uploaded_by?: string | null;
          uploader_role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "portal_files_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_files_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_files_submission_fk";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "portal_supplier_submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      portal_memberships: {
        Row: {
          accepted_at: string | null;
          company_id: string;
          contact_id: string;
          created_at: string;
          email: string;
          id: string;
          invite_expires_at: string | null;
          invite_token_hash: string | null;
          invited_by: string | null;
          mfa_required: boolean;
          portal_role: string;
          revoked_at: string | null;
          revoked_by: string | null;
          status: string;
          user_id: string | null;
        };
        Insert: {
          accepted_at?: string | null;
          company_id: string;
          contact_id: string;
          created_at?: string;
          email: string;
          id?: string;
          invite_expires_at?: string | null;
          invite_token_hash?: string | null;
          invited_by?: string | null;
          mfa_required?: boolean;
          portal_role: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          status: string;
          user_id?: string | null;
        };
        Update: {
          accepted_at?: string | null;
          company_id?: string;
          contact_id?: string;
          created_at?: string;
          email?: string;
          id?: string;
          invite_expires_at?: string | null;
          invite_token_hash?: string | null;
          invited_by?: string | null;
          mfa_required?: boolean;
          portal_role?: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          status?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "portal_memberships_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_memberships_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      portal_messages: {
        Row: {
          author_role: string;
          author_user_id: string | null;
          body: string;
          company_id: string;
          contact_id: string;
          created_at: string;
          id: string;
          invoice_id: string | null;
          submission_id: string | null;
        };
        Insert: {
          author_role: string;
          author_user_id?: string | null;
          body: string;
          company_id: string;
          contact_id: string;
          created_at?: string;
          id?: string;
          invoice_id?: string | null;
          submission_id?: string | null;
        };
        Update: {
          author_role?: string;
          author_user_id?: string | null;
          body?: string;
          company_id?: string;
          contact_id?: string;
          created_at?: string;
          id?: string;
          invoice_id?: string | null;
          submission_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "portal_messages_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_messages_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_messages_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "sales_invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_messages_submission_fk";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "portal_supplier_submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      portal_notifications: {
        Row: {
          body: string;
          company_id: string;
          contact_id: string;
          created_at: string;
          id: string;
          read_at: string | null;
          title: string;
        };
        Insert: {
          body: string;
          company_id: string;
          contact_id: string;
          created_at?: string;
          id?: string;
          read_at?: string | null;
          title: string;
        };
        Update: {
          body?: string;
          company_id?: string;
          contact_id?: string;
          created_at?: string;
          id?: string;
          read_at?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "portal_notifications_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_notifications_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      portal_payment_events: {
        Row: {
          created_at: string;
          event_type: string;
          id: string;
          intent_id: string;
          provider: string;
          provider_event_id: string;
        };
        Insert: {
          created_at?: string;
          event_type: string;
          id?: string;
          intent_id: string;
          provider: string;
          provider_event_id: string;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          id?: string;
          intent_id?: string;
          provider?: string;
          provider_event_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "portal_payment_events_intent_id_fkey";
            columns: ["intent_id"];
            isOneToOne: false;
            referencedRelation: "portal_payment_intents";
            referencedColumns: ["id"];
          },
        ];
      };
      portal_payment_intents: {
        Row: {
          amount_minor: number;
          company_id: string;
          contact_id: string;
          created_at: string;
          currency_code: string;
          fee_journal_id: string | null;
          fee_minor: number;
          id: string;
          idempotency_key: string;
          invoice_id: string;
          last_error: string | null;
          membership_id: string;
          payer_user_id: string;
          provider: string | null;
          provider_payment_id: string | null;
          provider_session_id: string | null;
          receipt_id: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          amount_minor: number;
          company_id: string;
          contact_id: string;
          created_at?: string;
          currency_code: string;
          fee_journal_id?: string | null;
          fee_minor?: number;
          id?: string;
          idempotency_key: string;
          invoice_id: string;
          last_error?: string | null;
          membership_id: string;
          payer_user_id: string;
          provider?: string | null;
          provider_payment_id?: string | null;
          provider_session_id?: string | null;
          receipt_id?: string | null;
          status: string;
          updated_at?: string;
        };
        Update: {
          amount_minor?: number;
          company_id?: string;
          contact_id?: string;
          created_at?: string;
          currency_code?: string;
          fee_journal_id?: string | null;
          fee_minor?: number;
          id?: string;
          idempotency_key?: string;
          invoice_id?: string;
          last_error?: string | null;
          membership_id?: string;
          payer_user_id?: string;
          provider?: string | null;
          provider_payment_id?: string | null;
          provider_session_id?: string | null;
          receipt_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "portal_payment_intents_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_payment_intents_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_payment_intents_fee_journal_id_fkey";
            columns: ["fee_journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_payment_intents_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "sales_invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_payment_intents_membership_id_fkey";
            columns: ["membership_id"];
            isOneToOne: false;
            referencedRelation: "portal_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_payment_intents_receipt_id_fkey";
            columns: ["receipt_id"];
            isOneToOne: false;
            referencedRelation: "sales_receipts";
            referencedColumns: ["id"];
          },
        ];
      };
      portal_po_acknowledgements: {
        Row: {
          acknowledged_at: string;
          acknowledged_by: string | null;
          company_id: string;
          membership_id: string;
          note: string | null;
          order_id: string;
        };
        Insert: {
          acknowledged_at?: string;
          acknowledged_by?: string | null;
          company_id: string;
          membership_id: string;
          note?: string | null;
          order_id: string;
        };
        Update: {
          acknowledged_at?: string;
          acknowledged_by?: string | null;
          company_id?: string;
          membership_id?: string;
          note?: string | null;
          order_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "portal_po_acknowledgements_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_po_acknowledgements_membership_id_fkey";
            columns: ["membership_id"];
            isOneToOne: false;
            referencedRelation: "portal_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_po_acknowledgements_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      portal_rate_events: {
        Row: {
          bucket: string;
          created_at: string;
          id: number;
        };
        Insert: {
          bucket: string;
          created_at?: string;
          id?: never;
        };
        Update: {
          bucket?: string;
          created_at?: string;
          id?: never;
        };
        Relationships: [];
      };
      portal_reminder_log: {
        Row: {
          company_id: string;
          created_at: string;
          id: string;
          invoice_id: string;
          sent_on: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          id?: string;
          invoice_id: string;
          sent_on: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          id?: string;
          invoice_id?: string;
          sent_on?: string;
        };
        Relationships: [
          {
            foreignKeyName: "portal_reminder_log_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_reminder_log_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "sales_invoices";
            referencedColumns: ["id"];
          },
        ];
      };
      portal_settings: {
        Row: {
          allow_sandbox: boolean;
          company_id: string;
          default_purchase_account_id: string | null;
          fee_expense_account_id: string | null;
          invite_days: number;
          require_mfa: boolean;
          settlement_account_id: string | null;
          settlement_user_id: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          allow_sandbox?: boolean;
          company_id: string;
          default_purchase_account_id?: string | null;
          fee_expense_account_id?: string | null;
          invite_days?: number;
          require_mfa?: boolean;
          settlement_account_id?: string | null;
          settlement_user_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          allow_sandbox?: boolean;
          company_id?: string;
          default_purchase_account_id?: string | null;
          fee_expense_account_id?: string | null;
          invite_days?: number;
          require_mfa?: boolean;
          settlement_account_id?: string | null;
          settlement_user_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "portal_settings_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: true;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_settings_default_purchase_account_id_fkey";
            columns: ["default_purchase_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_settings_fee_expense_account_id_fkey";
            columns: ["fee_expense_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_settings_settlement_account_id_fkey";
            columns: ["settlement_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      portal_staff_alerts: {
        Row: {
          company_id: string;
          created_at: string;
          id: string;
          intent_id: string | null;
          message: string;
          resolved_at: string | null;
          resolved_by: string | null;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          id?: string;
          intent_id?: string | null;
          message: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          id?: string;
          intent_id?: string | null;
          message?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "portal_staff_alerts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_staff_alerts_intent_id_fkey";
            columns: ["intent_id"];
            isOneToOne: false;
            referencedRelation: "portal_payment_intents";
            referencedColumns: ["id"];
          },
        ];
      };
      portal_supplier_submissions: {
        Row: {
          bill_id: string | null;
          company_id: string;
          contact_id: string;
          created_at: string;
          credit_note_id: string | null;
          currency_code: string;
          decided_at: string | null;
          decided_by: string | null;
          document_date: string;
          due_date: string | null;
          id: string;
          kind: string;
          lines: Json;
          membership_id: string;
          memo: string | null;
          purchase_order_id: string | null;
          rejection_reason: string | null;
          status: string;
          submitted_by: string | null;
          subtotal_minor: number;
          supplier_reference: string;
          tax_minor: number;
          total_minor: number;
        };
        Insert: {
          bill_id?: string | null;
          company_id: string;
          contact_id: string;
          created_at?: string;
          credit_note_id?: string | null;
          currency_code: string;
          decided_at?: string | null;
          decided_by?: string | null;
          document_date: string;
          due_date?: string | null;
          id?: string;
          kind: string;
          lines: Json;
          membership_id: string;
          memo?: string | null;
          purchase_order_id?: string | null;
          rejection_reason?: string | null;
          status: string;
          submitted_by?: string | null;
          subtotal_minor: number;
          supplier_reference: string;
          tax_minor: number;
          total_minor: number;
        };
        Update: {
          bill_id?: string | null;
          company_id?: string;
          contact_id?: string;
          created_at?: string;
          credit_note_id?: string | null;
          currency_code?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          document_date?: string;
          due_date?: string | null;
          id?: string;
          kind?: string;
          lines?: Json;
          membership_id?: string;
          memo?: string | null;
          purchase_order_id?: string | null;
          rejection_reason?: string | null;
          status?: string;
          submitted_by?: string | null;
          subtotal_minor?: number;
          supplier_reference?: string;
          tax_minor?: number;
          total_minor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "portal_supplier_submissions_bill_id_fkey";
            columns: ["bill_id"];
            isOneToOne: false;
            referencedRelation: "purchase_bills";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_supplier_submissions_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_supplier_submissions_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_supplier_submissions_credit_note_id_fkey";
            columns: ["credit_note_id"];
            isOneToOne: false;
            referencedRelation: "purchase_credit_notes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_supplier_submissions_membership_id_fkey";
            columns: ["membership_id"];
            isOneToOne: false;
            referencedRelation: "portal_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_supplier_submissions_purchase_order_id_fkey";
            columns: ["purchase_order_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      practice_tasks: {
        Row: {
          assignee_id: string | null;
          company_id: string;
          completed_at: string | null;
          created_at: string;
          created_by: string;
          due_date: string;
          id: string;
          kind: string;
          note: string;
          period_end: string | null;
          prepared_by: string | null;
          reviewed_by: string | null;
          status: string;
          template_key: string | null;
          title: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          assignee_id?: string | null;
          company_id: string;
          completed_at?: string | null;
          created_at?: string;
          created_by: string;
          due_date: string;
          id?: string;
          kind: string;
          note?: string;
          period_end?: string | null;
          prepared_by?: string | null;
          reviewed_by?: string | null;
          status?: string;
          template_key?: string | null;
          title: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          assignee_id?: string | null;
          company_id?: string;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string;
          due_date?: string;
          id?: string;
          kind?: string;
          note?: string;
          period_end?: string | null;
          prepared_by?: string | null;
          reviewed_by?: string | null;
          status?: string;
          template_key?: string | null;
          title?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "practice_tasks_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      price_change_log: {
        Row: {
          action: string;
          actor_user_id: string | null;
          after_state: Json;
          before_state: Json;
          created_at: string;
          id: string;
          plan_code: string | null;
          reason: string | null;
        };
        Insert: {
          action: string;
          actor_user_id?: string | null;
          after_state?: Json;
          before_state?: Json;
          created_at?: string;
          id?: string;
          plan_code?: string | null;
          reason?: string | null;
        };
        Update: {
          action?: string;
          actor_user_id?: string | null;
          after_state?: Json;
          before_state?: Json;
          created_at?: string;
          id?: string;
          plan_code?: string | null;
          reason?: string | null;
        };
        Relationships: [];
      };
      products: {
        Row: {
          archived_at: string | null;
          code: string | null;
          company_id: string;
          created_at: string;
          description: string | null;
          expense_account_id: string | null;
          id: string;
          income_account_id: string | null;
          is_active: boolean;
          kind: Database["public"]["Enums"]["product_kind"];
          name: string;
          purchase_cost_minor: number;
          purchase_tax_rate_bps: number;
          sales_price_minor: number;
          sales_tax_rate_bps: number;
          unit: string;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          code?: string | null;
          company_id: string;
          created_at?: string;
          description?: string | null;
          expense_account_id?: string | null;
          id?: string;
          income_account_id?: string | null;
          is_active?: boolean;
          kind?: Database["public"]["Enums"]["product_kind"];
          name: string;
          purchase_cost_minor?: number;
          purchase_tax_rate_bps?: number;
          sales_price_minor?: number;
          sales_tax_rate_bps?: number;
          unit?: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          code?: string | null;
          company_id?: string;
          created_at?: string;
          description?: string | null;
          expense_account_id?: string | null;
          id?: string;
          income_account_id?: string | null;
          is_active?: boolean;
          kind?: Database["public"]["Enums"]["product_kind"];
          name?: string;
          purchase_cost_minor?: number;
          purchase_tax_rate_bps?: number;
          sales_price_minor?: number;
          sales_tax_rate_bps?: number;
          unit?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_expense_account_id_fkey";
            columns: ["expense_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_income_account_id_fkey";
            columns: ["income_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          job_title: string | null;
          last_company_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string;
          full_name?: string;
          id: string;
          job_title?: string | null;
          last_company_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          full_name?: string;
          id?: string;
          job_title?: string | null;
          last_company_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_last_company_id_fkey";
            columns: ["last_company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          budget_minor: number | null;
          code: string;
          company_id: string;
          contact_id: string | null;
          created_at: string;
          created_by: string;
          description: string | null;
          end_date: string | null;
          id: string;
          name: string;
          start_date: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          budget_minor?: number | null;
          code: string;
          company_id: string;
          contact_id?: string | null;
          created_at?: string;
          created_by: string;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          name: string;
          start_date?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          budget_minor?: number | null;
          code?: string;
          company_id?: string;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          name?: string;
          start_date?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "projects_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_bill_lines: {
        Row: {
          account_id: string;
          bill_id: string;
          class_option_id: string | null;
          company_id: string;
          customer_contact_id: string | null;
          description: string;
          discount_minor: number;
          id: string;
          is_billable: boolean;
          line_no: number;
          location_option_id: string | null;
          net_minor: number;
          product_id: string | null;
          project_id: string | null;
          project_option_id: string | null;
          quantity: number;
          tax_code_id: string | null;
          tax_minor: number;
          tax_rate_bps: number;
          unit_price_minor: number;
        };
        Insert: {
          account_id: string;
          bill_id: string;
          class_option_id?: string | null;
          company_id: string;
          customer_contact_id?: string | null;
          description: string;
          discount_minor?: number;
          id?: string;
          is_billable?: boolean;
          line_no: number;
          location_option_id?: string | null;
          net_minor?: number;
          product_id?: string | null;
          project_id?: string | null;
          project_option_id?: string | null;
          quantity?: number;
          tax_code_id?: string | null;
          tax_minor?: number;
          tax_rate_bps?: number;
          unit_price_minor?: number;
        };
        Update: {
          account_id?: string;
          bill_id?: string;
          class_option_id?: string | null;
          company_id?: string;
          customer_contact_id?: string | null;
          description?: string;
          discount_minor?: number;
          id?: string;
          is_billable?: boolean;
          line_no?: number;
          location_option_id?: string | null;
          net_minor?: number;
          product_id?: string | null;
          project_id?: string | null;
          project_option_id?: string | null;
          quantity?: number;
          tax_code_id?: string | null;
          tax_minor?: number;
          tax_rate_bps?: number;
          unit_price_minor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_bill_lines_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_bill_lines_bill_id_fkey";
            columns: ["bill_id"];
            isOneToOne: false;
            referencedRelation: "purchase_bills";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_bill_lines_class_option_id_fkey";
            columns: ["class_option_id"];
            isOneToOne: false;
            referencedRelation: "tracking_options";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_bill_lines_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_bill_lines_customer_contact_id_fkey";
            columns: ["customer_contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_bill_lines_location_option_id_fkey";
            columns: ["location_option_id"];
            isOneToOne: false;
            referencedRelation: "tracking_options";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_bill_lines_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_bill_lines_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_bill_lines_project_option_id_fkey";
            columns: ["project_option_id"];
            isOneToOne: false;
            referencedRelation: "tracking_options";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_bill_lines_tax_code_id_fkey";
            columns: ["tax_code_id"];
            isOneToOne: false;
            referencedRelation: "tax_codes";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_bills: {
        Row: {
          amount_credited_minor: number;
          amount_paid_minor: number;
          approval_comment: string | null;
          authorised_at: string | null;
          authorised_by: string | null;
          bill_date: string;
          bill_number: string | null;
          company_id: string;
          contact_id: string;
          conversion_batch_id: string | null;
          created_at: string;
          created_by: string;
          currency_code: string;
          due_date: string;
          due_date_manual_override: boolean;
          duplicate_override: boolean;
          duplicate_override_reason: string | null;
          fx_rate_to_base: number | null;
          id: string;
          is_opening_balance: boolean;
          memo: string | null;
          payment_term_id: string | null;
          payment_terms_days: number | null;
          posted_journal_id: string | null;
          purchase_order_id: string | null;
          rejected_at: string | null;
          rejected_by: string | null;
          rejection_reason: string | null;
          status: Database["public"]["Enums"]["purchase_doc_status"];
          submitted_for_approval_at: string | null;
          submitted_for_approval_by: string | null;
          subtotal_minor: number;
          supplier_address_city: string | null;
          supplier_address_country: string | null;
          supplier_address_line1: string | null;
          supplier_address_line2: string | null;
          supplier_address_postal: string | null;
          supplier_address_region: string | null;
          supplier_invoice_number: string | null;
          tax_calculation: string;
          tax_minor: number;
          total_minor: number;
          updated_at: string;
          void_date: string | null;
          void_journal_id: string | null;
          void_reason: string | null;
        };
        Insert: {
          amount_credited_minor?: number;
          amount_paid_minor?: number;
          approval_comment?: string | null;
          authorised_at?: string | null;
          authorised_by?: string | null;
          bill_date: string;
          bill_number?: string | null;
          company_id: string;
          contact_id: string;
          conversion_batch_id?: string | null;
          created_at?: string;
          created_by: string;
          currency_code: string;
          due_date: string;
          due_date_manual_override?: boolean;
          duplicate_override?: boolean;
          duplicate_override_reason?: string | null;
          fx_rate_to_base?: number | null;
          id?: string;
          is_opening_balance?: boolean;
          memo?: string | null;
          payment_term_id?: string | null;
          payment_terms_days?: number | null;
          posted_journal_id?: string | null;
          purchase_order_id?: string | null;
          rejected_at?: string | null;
          rejected_by?: string | null;
          rejection_reason?: string | null;
          status?: Database["public"]["Enums"]["purchase_doc_status"];
          submitted_for_approval_at?: string | null;
          submitted_for_approval_by?: string | null;
          subtotal_minor?: number;
          supplier_address_city?: string | null;
          supplier_address_country?: string | null;
          supplier_address_line1?: string | null;
          supplier_address_line2?: string | null;
          supplier_address_postal?: string | null;
          supplier_address_region?: string | null;
          supplier_invoice_number?: string | null;
          tax_calculation?: string;
          tax_minor?: number;
          total_minor?: number;
          updated_at?: string;
          void_date?: string | null;
          void_journal_id?: string | null;
          void_reason?: string | null;
        };
        Update: {
          amount_credited_minor?: number;
          amount_paid_minor?: number;
          approval_comment?: string | null;
          authorised_at?: string | null;
          authorised_by?: string | null;
          bill_date?: string;
          bill_number?: string | null;
          company_id?: string;
          contact_id?: string;
          conversion_batch_id?: string | null;
          created_at?: string;
          created_by?: string;
          currency_code?: string;
          due_date?: string;
          due_date_manual_override?: boolean;
          duplicate_override?: boolean;
          duplicate_override_reason?: string | null;
          fx_rate_to_base?: number | null;
          id?: string;
          is_opening_balance?: boolean;
          memo?: string | null;
          payment_term_id?: string | null;
          payment_terms_days?: number | null;
          posted_journal_id?: string | null;
          purchase_order_id?: string | null;
          rejected_at?: string | null;
          rejected_by?: string | null;
          rejection_reason?: string | null;
          status?: Database["public"]["Enums"]["purchase_doc_status"];
          submitted_for_approval_at?: string | null;
          submitted_for_approval_by?: string | null;
          subtotal_minor?: number;
          supplier_address_city?: string | null;
          supplier_address_country?: string | null;
          supplier_address_line1?: string | null;
          supplier_address_line2?: string | null;
          supplier_address_postal?: string | null;
          supplier_address_region?: string | null;
          supplier_invoice_number?: string | null;
          tax_calculation?: string;
          tax_minor?: number;
          total_minor?: number;
          updated_at?: string;
          void_date?: string | null;
          void_journal_id?: string | null;
          void_reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_bills_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_bills_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_bills_payment_term_fk";
            columns: ["payment_term_id"];
            isOneToOne: false;
            referencedRelation: "company_payment_terms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_bills_po_fk";
            columns: ["purchase_order_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_bills_posted_journal_id_fkey";
            columns: ["posted_journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_bills_void_journal_id_fkey";
            columns: ["void_journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_credit_allocations: {
        Row: {
          amount_minor: number;
          bill_id: string;
          company_id: string;
          credit_note_id: string;
          id: string;
        };
        Insert: {
          amount_minor: number;
          bill_id: string;
          company_id: string;
          credit_note_id: string;
          id?: string;
        };
        Update: {
          amount_minor?: number;
          bill_id?: string;
          company_id?: string;
          credit_note_id?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_credit_allocations_bill_id_fkey";
            columns: ["bill_id"];
            isOneToOne: false;
            referencedRelation: "purchase_bills";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_credit_allocations_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_credit_allocations_credit_note_id_fkey";
            columns: ["credit_note_id"];
            isOneToOne: false;
            referencedRelation: "purchase_credit_notes";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_credit_note_lines: {
        Row: {
          account_id: string;
          company_id: string;
          credit_note_id: string;
          description: string;
          id: string;
          line_no: number;
          net_minor: number;
          project_id: string | null;
          tax_minor: number;
        };
        Insert: {
          account_id: string;
          company_id: string;
          credit_note_id: string;
          description: string;
          id?: string;
          line_no: number;
          net_minor?: number;
          project_id?: string | null;
          tax_minor?: number;
        };
        Update: {
          account_id?: string;
          company_id?: string;
          credit_note_id?: string;
          description?: string;
          id?: string;
          line_no?: number;
          net_minor?: number;
          project_id?: string | null;
          tax_minor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_credit_note_lines_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_credit_note_lines_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_credit_note_lines_credit_note_id_fkey";
            columns: ["credit_note_id"];
            isOneToOne: false;
            referencedRelation: "purchase_credit_notes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_credit_note_lines_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_credit_notes: {
        Row: {
          amount_allocated_minor: number;
          company_id: string;
          contact_id: string;
          created_at: string;
          created_by: string;
          credit_date: string;
          credit_number: string | null;
          currency_code: string;
          fx_rate_to_base: number;
          id: string;
          memo: string | null;
          posted_journal_id: string | null;
          status: Database["public"]["Enums"]["purchase_doc_status"];
          subtotal_minor: number;
          tax_minor: number;
          total_minor: number;
          updated_at: string;
          void_date: string | null;
          void_reason: string | null;
        };
        Insert: {
          amount_allocated_minor?: number;
          company_id: string;
          contact_id: string;
          created_at?: string;
          created_by: string;
          credit_date: string;
          credit_number?: string | null;
          currency_code: string;
          fx_rate_to_base?: number;
          id?: string;
          memo?: string | null;
          posted_journal_id?: string | null;
          status?: Database["public"]["Enums"]["purchase_doc_status"];
          subtotal_minor?: number;
          tax_minor?: number;
          total_minor?: number;
          updated_at?: string;
          void_date?: string | null;
          void_reason?: string | null;
        };
        Update: {
          amount_allocated_minor?: number;
          company_id?: string;
          contact_id?: string;
          created_at?: string;
          created_by?: string;
          credit_date?: string;
          credit_number?: string | null;
          currency_code?: string;
          fx_rate_to_base?: number;
          id?: string;
          memo?: string | null;
          posted_journal_id?: string | null;
          status?: Database["public"]["Enums"]["purchase_doc_status"];
          subtotal_minor?: number;
          tax_minor?: number;
          total_minor?: number;
          updated_at?: string;
          void_date?: string | null;
          void_reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_credit_notes_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_credit_notes_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_credit_notes_posted_journal_id_fkey";
            columns: ["posted_journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_expenses: {
        Row: {
          company_id: string;
          contact_id: string | null;
          created_at: string;
          created_by: string;
          currency_code: string;
          expense_account_id: string;
          expense_date: string;
          id: string;
          memo: string | null;
          net_minor: number;
          payee_name: string;
          payment_account_id: string;
          posted_journal_id: string | null;
          reference: string | null;
          status: Database["public"]["Enums"]["purchase_doc_status"];
          tax_minor: number;
          total_minor: number;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          contact_id?: string | null;
          created_at?: string;
          created_by: string;
          currency_code: string;
          expense_account_id: string;
          expense_date: string;
          id?: string;
          memo?: string | null;
          net_minor?: number;
          payee_name: string;
          payment_account_id: string;
          posted_journal_id?: string | null;
          reference?: string | null;
          status?: Database["public"]["Enums"]["purchase_doc_status"];
          tax_minor?: number;
          total_minor?: number;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string;
          currency_code?: string;
          expense_account_id?: string;
          expense_date?: string;
          id?: string;
          memo?: string | null;
          net_minor?: number;
          payee_name?: string;
          payment_account_id?: string;
          posted_journal_id?: string | null;
          reference?: string | null;
          status?: Database["public"]["Enums"]["purchase_doc_status"];
          tax_minor?: number;
          total_minor?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_expenses_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_expenses_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_expenses_expense_account_id_fkey";
            columns: ["expense_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_expenses_payment_account_id_fkey";
            columns: ["payment_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_expenses_posted_journal_id_fkey";
            columns: ["posted_journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_order_lines: {
        Row: {
          account_id: string;
          company_id: string;
          description: string;
          id: string;
          line_no: number;
          net_minor: number;
          order_id: string;
          quantity: number;
          tax_minor: number;
          tax_rate_bps: number;
          unit_price_minor: number;
        };
        Insert: {
          account_id: string;
          company_id: string;
          description: string;
          id?: string;
          line_no: number;
          net_minor?: number;
          order_id: string;
          quantity?: number;
          tax_minor?: number;
          tax_rate_bps?: number;
          unit_price_minor?: number;
        };
        Update: {
          account_id?: string;
          company_id?: string;
          description?: string;
          id?: string;
          line_no?: number;
          net_minor?: number;
          order_id?: string;
          quantity?: number;
          tax_minor?: number;
          tax_rate_bps?: number;
          unit_price_minor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_order_lines_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_order_lines_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_orders: {
        Row: {
          billed_bill_id: string | null;
          company_id: string;
          contact_id: string;
          created_at: string;
          created_by: string;
          currency_code: string;
          id: string;
          memo: string | null;
          order_date: string;
          order_number: string | null;
          status: Database["public"]["Enums"]["po_status"];
          subtotal_minor: number;
          supplier_acknowledged_at: string | null;
          tax_minor: number;
          total_minor: number;
          updated_at: string;
        };
        Insert: {
          billed_bill_id?: string | null;
          company_id: string;
          contact_id: string;
          created_at?: string;
          created_by: string;
          currency_code: string;
          id?: string;
          memo?: string | null;
          order_date: string;
          order_number?: string | null;
          status?: Database["public"]["Enums"]["po_status"];
          subtotal_minor?: number;
          supplier_acknowledged_at?: string | null;
          tax_minor?: number;
          total_minor?: number;
          updated_at?: string;
        };
        Update: {
          billed_bill_id?: string | null;
          company_id?: string;
          contact_id?: string;
          created_at?: string;
          created_by?: string;
          currency_code?: string;
          id?: string;
          memo?: string | null;
          order_date?: string;
          order_number?: string | null;
          status?: Database["public"]["Enums"]["po_status"];
          subtotal_minor?: number;
          supplier_acknowledged_at?: string | null;
          tax_minor?: number;
          total_minor?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_orders_billed_bill_id_fkey";
            columns: ["billed_bill_id"];
            isOneToOne: false;
            referencedRelation: "purchase_bills";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_orders_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_orders_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      reconciliation_links: {
        Row: {
          bank_transaction_id: string;
          company_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          journal_line_id: string;
        };
        Insert: {
          bank_transaction_id: string;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          journal_line_id: string;
        };
        Update: {
          bank_transaction_id?: string;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          journal_line_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reconciliation_links_bank_transaction_id_fkey";
            columns: ["bank_transaction_id"];
            isOneToOne: false;
            referencedRelation: "bank_transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reconciliation_links_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reconciliation_links_journal_line_id_fkey";
            columns: ["journal_line_id"];
            isOneToOne: false;
            referencedRelation: "journal_lines";
            referencedColumns: ["id"];
          },
        ];
      };
      reconciliation_session_lines: {
        Row: {
          amount_minor: number;
          bank_transaction_id: string | null;
          company_id: string;
          created_at: string;
          id: string;
          journal_line_id: string | null;
          session_id: string;
        };
        Insert: {
          amount_minor: number;
          bank_transaction_id?: string | null;
          company_id: string;
          created_at?: string;
          id?: string;
          journal_line_id?: string | null;
          session_id: string;
        };
        Update: {
          amount_minor?: number;
          bank_transaction_id?: string | null;
          company_id?: string;
          created_at?: string;
          id?: string;
          journal_line_id?: string | null;
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reconciliation_session_lines_bank_transaction_id_fkey";
            columns: ["bank_transaction_id"];
            isOneToOne: false;
            referencedRelation: "bank_transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reconciliation_session_lines_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reconciliation_session_lines_journal_line_id_fkey";
            columns: ["journal_line_id"];
            isOneToOne: false;
            referencedRelation: "journal_lines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reconciliation_session_lines_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "reconciliation_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      reconciliation_sessions: {
        Row: {
          bank_account_id: string;
          cleared_total_minor: number | null;
          company_id: string;
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          created_by: string;
          id: string;
          notes: string | null;
          opening_balance_minor: number | null;
          reconciled_balance_minor: number | null;
          statement_balance_minor: number;
          statement_date: string;
          status: string;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          bank_account_id: string;
          cleared_total_minor?: number | null;
          company_id: string;
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          created_by: string;
          id?: string;
          notes?: string | null;
          opening_balance_minor?: number | null;
          reconciled_balance_minor?: number | null;
          statement_balance_minor: number;
          statement_date: string;
          status?: string;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          bank_account_id?: string;
          cleared_total_minor?: number | null;
          company_id?: string;
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          created_by?: string;
          id?: string;
          notes?: string | null;
          opening_balance_minor?: number | null;
          reconciled_balance_minor?: number | null;
          statement_balance_minor?: number;
          statement_date?: string;
          status?: string;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "reconciliation_sessions_bank_account_id_fkey";
            columns: ["bank_account_id"];
            isOneToOne: false;
            referencedRelation: "bank_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reconciliation_sessions_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_bills: {
        Row: {
          auto_authorise: boolean;
          company_id: string;
          contact_id: string;
          created_at: string;
          created_by: string;
          currency_code: string;
          day_of_month: number | null;
          frequency: Database["public"]["Enums"]["recurrence_frequency"];
          id: string;
          is_active: boolean;
          last_error: string | null;
          last_generated_on: string | null;
          name: string;
          next_due_date: string;
          template: Json;
          updated_at: string;
        };
        Insert: {
          auto_authorise?: boolean;
          company_id: string;
          contact_id: string;
          created_at?: string;
          created_by: string;
          currency_code: string;
          day_of_month?: number | null;
          frequency?: Database["public"]["Enums"]["recurrence_frequency"];
          id?: string;
          is_active?: boolean;
          last_error?: string | null;
          last_generated_on?: string | null;
          name: string;
          next_due_date: string;
          template?: Json;
          updated_at?: string;
        };
        Update: {
          auto_authorise?: boolean;
          company_id?: string;
          contact_id?: string;
          created_at?: string;
          created_by?: string;
          currency_code?: string;
          day_of_month?: number | null;
          frequency?: Database["public"]["Enums"]["recurrence_frequency"];
          id?: string;
          is_active?: boolean;
          last_error?: string | null;
          last_generated_on?: string | null;
          name?: string;
          next_due_date?: string;
          template?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_bills_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_bills_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_generation_runs: {
        Row: {
          company_id: string | null;
          finished_at: string | null;
          id: string;
          outcome: string | null;
          started_at: string;
          stats: Json;
          trigger_source: string;
        };
        Insert: {
          company_id?: string | null;
          finished_at?: string | null;
          id?: string;
          outcome?: string | null;
          started_at?: string;
          stats?: Json;
          trigger_source: string;
        };
        Update: {
          company_id?: string | null;
          finished_at?: string | null;
          id?: string;
          outcome?: string | null;
          started_at?: string;
          stats?: Json;
          trigger_source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_generation_runs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_journal_occurrences: {
        Row: {
          company_id: string;
          id: string;
          journal_id: string | null;
          occurrence_date: string;
          template_id: string;
        };
        Insert: {
          company_id: string;
          id?: string;
          journal_id?: string | null;
          occurrence_date: string;
          template_id: string;
        };
        Update: {
          company_id?: string;
          id?: string;
          journal_id?: string | null;
          occurrence_date?: string;
          template_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_journal_occurrences_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_journal_occurrences_journal_id_fkey";
            columns: ["journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_journal_occurrences_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "recurring_journal_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_journal_templates: {
        Row: {
          company_id: string;
          created_at: string;
          created_by: string;
          end_date: string | null;
          id: string;
          interval_months: number;
          is_active: boolean;
          last_error: string | null;
          last_run_at: string | null;
          lines: Json;
          max_occurrences: number | null;
          memo: string | null;
          name: string;
          next_date: string;
          start_date: string;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          created_by: string;
          end_date?: string | null;
          id?: string;
          interval_months?: number;
          is_active?: boolean;
          last_error?: string | null;
          last_run_at?: string | null;
          lines: Json;
          max_occurrences?: number | null;
          memo?: string | null;
          name: string;
          next_date: string;
          start_date: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          created_by?: string;
          end_date?: string | null;
          id?: string;
          interval_months?: number;
          is_active?: boolean;
          last_error?: string | null;
          last_run_at?: string | null;
          lines?: Json;
          max_occurrences?: number | null;
          memo?: string | null;
          name?: string;
          next_date?: string;
          start_date?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_journal_templates_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_occurrences: {
        Row: {
          claimed_at: string | null;
          company_id: string;
          completed_at: string | null;
          created_at: string;
          document_date: string;
          error_message: string | null;
          id: string;
          idempotency_key: string;
          occurrence_key: string;
          purchase_bill_id: string | null;
          sales_invoice_id: string | null;
          schedule_id: string;
          scheduled_date: string;
          status: Database["public"]["Enums"]["recurring_occurrence_status"];
          template_version_id: string | null;
          updated_at: string;
        };
        Insert: {
          claimed_at?: string | null;
          company_id: string;
          completed_at?: string | null;
          created_at?: string;
          document_date: string;
          error_message?: string | null;
          id?: string;
          idempotency_key: string;
          occurrence_key: string;
          purchase_bill_id?: string | null;
          sales_invoice_id?: string | null;
          schedule_id: string;
          scheduled_date: string;
          status?: Database["public"]["Enums"]["recurring_occurrence_status"];
          template_version_id?: string | null;
          updated_at?: string;
        };
        Update: {
          claimed_at?: string | null;
          company_id?: string;
          completed_at?: string | null;
          created_at?: string;
          document_date?: string;
          error_message?: string | null;
          id?: string;
          idempotency_key?: string;
          occurrence_key?: string;
          purchase_bill_id?: string | null;
          sales_invoice_id?: string | null;
          schedule_id?: string;
          scheduled_date?: string;
          status?: Database["public"]["Enums"]["recurring_occurrence_status"];
          template_version_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_occurrences_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_occurrences_purchase_bill_id_fkey";
            columns: ["purchase_bill_id"];
            isOneToOne: false;
            referencedRelation: "purchase_bills";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_occurrences_sales_invoice_id_fkey";
            columns: ["sales_invoice_id"];
            isOneToOne: false;
            referencedRelation: "sales_invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_occurrences_schedule_id_fkey";
            columns: ["schedule_id"];
            isOneToOne: false;
            referencedRelation: "recurring_schedules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_occurrences_template_version_id_fkey";
            columns: ["template_version_id"];
            isOneToOne: false;
            referencedRelation: "recurring_template_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_schedule_exceptions: {
        Row: {
          company_id: string;
          created_at: string;
          created_by: string | null;
          exception_date: string;
          exception_type: string;
          id: string;
          note: string | null;
          schedule_id: string;
          shifted_to_date: string | null;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          exception_date: string;
          exception_type: string;
          id?: string;
          note?: string | null;
          schedule_id: string;
          shifted_to_date?: string | null;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          exception_date?: string;
          exception_type?: string;
          id?: string;
          note?: string | null;
          schedule_id?: string;
          shifted_to_date?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_schedule_exceptions_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_schedule_exceptions_schedule_id_fkey";
            columns: ["schedule_id"];
            isOneToOne: false;
            referencedRelation: "recurring_schedules";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_schedules: {
        Row: {
          auto_authorise: boolean;
          catch_up_policy: Database["public"]["Enums"]["recurring_catch_up_policy"];
          company_id: string;
          created_at: string;
          dtstart: string;
          end_date: string | null;
          frequency_legacy: Database["public"]["Enums"]["recurrence_frequency"] | null;
          generate_days_in_advance: number;
          id: string;
          is_paused: boolean;
          last_error: string | null;
          last_generated_on: string | null;
          max_occurrences: number | null;
          mode: Database["public"]["Enums"]["recurring_template_mode"];
          next_occurrence_date: string;
          occurrence_count: number;
          rrule: string;
          template_id: string;
          time_zone: string;
          updated_at: string;
        };
        Insert: {
          auto_authorise?: boolean;
          catch_up_policy?: Database["public"]["Enums"]["recurring_catch_up_policy"];
          company_id: string;
          created_at?: string;
          dtstart: string;
          end_date?: string | null;
          frequency_legacy?: Database["public"]["Enums"]["recurrence_frequency"] | null;
          generate_days_in_advance?: number;
          id?: string;
          is_paused?: boolean;
          last_error?: string | null;
          last_generated_on?: string | null;
          max_occurrences?: number | null;
          mode?: Database["public"]["Enums"]["recurring_template_mode"];
          next_occurrence_date: string;
          occurrence_count?: number;
          rrule: string;
          template_id: string;
          time_zone?: string;
          updated_at?: string;
        };
        Update: {
          auto_authorise?: boolean;
          catch_up_policy?: Database["public"]["Enums"]["recurring_catch_up_policy"];
          company_id?: string;
          created_at?: string;
          dtstart?: string;
          end_date?: string | null;
          frequency_legacy?: Database["public"]["Enums"]["recurrence_frequency"] | null;
          generate_days_in_advance?: number;
          id?: string;
          is_paused?: boolean;
          last_error?: string | null;
          last_generated_on?: string | null;
          max_occurrences?: number | null;
          mode?: Database["public"]["Enums"]["recurring_template_mode"];
          next_occurrence_date?: string;
          occurrence_count?: number;
          rrule?: string;
          template_id?: string;
          time_zone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_schedules_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_schedules_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: true;
            referencedRelation: "recurring_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_template_versions: {
        Row: {
          company_id: string;
          created_at: string;
          created_by: string;
          id: string;
          payload: Json;
          template_id: string;
          version_no: number;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          created_by: string;
          id?: string;
          payload?: Json;
          template_id: string;
          version_no: number;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          payload?: Json;
          template_id?: string;
          version_no?: number;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_template_versions_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_template_versions_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "recurring_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_templates: {
        Row: {
          archived_at: string | null;
          company_id: string;
          contact_id: string | null;
          created_at: string;
          currency_code: string;
          current_version_id: string | null;
          document_type: Database["public"]["Enums"]["recurring_document_type"];
          id: string;
          is_active: boolean;
          legacy_recurring_bill_id: string | null;
          legacy_sales_recurring_invoice_id: string | null;
          name: string;
          owner_user_id: string;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          company_id: string;
          contact_id?: string | null;
          created_at?: string;
          currency_code: string;
          current_version_id?: string | null;
          document_type: Database["public"]["Enums"]["recurring_document_type"];
          id?: string;
          is_active?: boolean;
          legacy_recurring_bill_id?: string | null;
          legacy_sales_recurring_invoice_id?: string | null;
          name: string;
          owner_user_id: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          company_id?: string;
          contact_id?: string | null;
          created_at?: string;
          currency_code?: string;
          current_version_id?: string | null;
          document_type?: Database["public"]["Enums"]["recurring_document_type"];
          id?: string;
          is_active?: boolean;
          legacy_recurring_bill_id?: string | null;
          legacy_sales_recurring_invoice_id?: string | null;
          name?: string;
          owner_user_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_templates_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_templates_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_templates_current_version_fk";
            columns: ["current_version_id"];
            isOneToOne: false;
            referencedRelation: "recurring_template_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_templates_legacy_recurring_bill_id_fkey";
            columns: ["legacy_recurring_bill_id"];
            isOneToOne: true;
            referencedRelation: "recurring_bills";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_templates_legacy_sales_recurring_invoice_id_fkey";
            columns: ["legacy_sales_recurring_invoice_id"];
            isOneToOne: true;
            referencedRelation: "sales_recurring_invoices";
            referencedColumns: ["id"];
          },
        ];
      };
      report_comments: {
        Row: {
          author_id: string;
          body: string;
          company_id: string;
          created_at: string;
          id: string;
          pack_id: string;
        };
        Insert: {
          author_id?: string;
          body: string;
          company_id: string;
          created_at?: string;
          id?: string;
          pack_id: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          company_id?: string;
          created_at?: string;
          id?: string;
          pack_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "report_comments_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_comments_pack_id_fkey";
            columns: ["pack_id"];
            isOneToOne: false;
            referencedRelation: "report_packs";
            referencedColumns: ["id"];
          },
        ];
      };
      report_deliveries: {
        Row: {
          attempts: number;
          authorized_at: string;
          company_id: string;
          created_at: string;
          definition: Json;
          facts: Json;
          id: string;
          last_error: string | null;
          lease_until: string | null;
          message: string;
          next_attempt_at: string;
          next_status_check_at: string;
          owner_id: string;
          pack_id: string | null;
          provider_id: string | null;
          recipients: Json;
          schedule_id: string | null;
          scheduled_for: string | null;
          status: string;
          subject: string;
          updated_at: string;
          view_id: string | null;
        };
        Insert: {
          attempts?: number;
          authorized_at?: string;
          company_id: string;
          created_at?: string;
          definition: Json;
          facts: Json;
          id?: string;
          last_error?: string | null;
          lease_until?: string | null;
          message?: string;
          next_attempt_at?: string;
          next_status_check_at?: string;
          owner_id: string;
          pack_id?: string | null;
          provider_id?: string | null;
          recipients: Json;
          schedule_id?: string | null;
          scheduled_for?: string | null;
          status?: string;
          subject: string;
          updated_at?: string;
          view_id?: string | null;
        };
        Update: {
          attempts?: number;
          authorized_at?: string;
          company_id?: string;
          created_at?: string;
          definition?: Json;
          facts?: Json;
          id?: string;
          last_error?: string | null;
          lease_until?: string | null;
          message?: string;
          next_attempt_at?: string;
          next_status_check_at?: string;
          owner_id?: string;
          pack_id?: string | null;
          provider_id?: string | null;
          recipients?: Json;
          schedule_id?: string | null;
          scheduled_for?: string | null;
          status?: string;
          subject?: string;
          updated_at?: string;
          view_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "report_deliveries_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_deliveries_pack_id_fkey";
            columns: ["pack_id"];
            isOneToOne: false;
            referencedRelation: "report_packs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_deliveries_schedule_id_fkey";
            columns: ["schedule_id"];
            isOneToOne: false;
            referencedRelation: "report_schedules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_deliveries_view_id_fkey";
            columns: ["view_id"];
            isOneToOne: false;
            referencedRelation: "report_saved_views";
            referencedColumns: ["id"];
          },
        ];
      };
      report_grants: {
        Row: {
          access: string;
          created_at: string;
          granted_by: string;
          user_id: string;
          view_id: string;
        };
        Insert: {
          access: string;
          created_at?: string;
          granted_by: string;
          user_id: string;
          view_id: string;
        };
        Update: {
          access?: string;
          created_at?: string;
          granted_by?: string;
          user_id?: string;
          view_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "report_grants_view_id_fkey";
            columns: ["view_id"];
            isOneToOne: false;
            referencedRelation: "report_saved_views";
            referencedColumns: ["id"];
          },
        ];
      };
      report_model_versions: {
        Row: {
          config: Json;
          created_at: string;
          created_by: string;
          model_id: string;
          name: string;
          version: number;
        };
        Insert: {
          config: Json;
          created_at?: string;
          created_by: string;
          model_id: string;
          name: string;
          version: number;
        };
        Update: {
          config?: Json;
          created_at?: string;
          created_by?: string;
          model_id?: string;
          name?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "report_model_versions_model_id_fkey";
            columns: ["model_id"];
            isOneToOne: false;
            referencedRelation: "report_models";
            referencedColumns: ["id"];
          },
        ];
      };
      report_models: {
        Row: {
          company_id: string;
          config: Json;
          created_at: string;
          id: string;
          kind: string;
          name: string;
          owner_id: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          company_id: string;
          config: Json;
          created_at?: string;
          id?: string;
          kind: string;
          name: string;
          owner_id?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          company_id?: string;
          config?: Json;
          created_at?: string;
          id?: string;
          kind?: string;
          name?: string;
          owner_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "report_models_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      report_open_events: {
        Row: {
          company_id: string;
          from_date: string;
          id: string;
          opened_at: string;
          report_id: string;
          search_config: Json;
          to_date: string;
          user_id: string;
          view_id: string | null;
        };
        Insert: {
          company_id: string;
          from_date: string;
          id: string;
          opened_at?: string;
          report_id: string;
          search_config?: Json;
          to_date: string;
          user_id: string;
          view_id?: string | null;
        };
        Update: {
          company_id?: string;
          from_date?: string;
          id?: string;
          opened_at?: string;
          report_id?: string;
          search_config?: Json;
          to_date?: string;
          user_id?: string;
          view_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "report_open_events_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_open_events_view_id_fkey";
            columns: ["view_id"];
            isOneToOne: false;
            referencedRelation: "report_saved_views";
            referencedColumns: ["id"];
          },
        ];
      };
      report_packs: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          company_id: string;
          config: Json;
          created_at: string;
          from_date: string;
          id: string;
          modified_by: string | null;
          name: string;
          owner_id: string;
          prepared_by: string | null;
          preparer_id: string | null;
          previous_status: string | null;
          published_at: string | null;
          reviewer_id: string | null;
          snapshot: Json | null;
          snapshot_hash: string | null;
          status: string;
          to_date: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          company_id: string;
          config?: Json;
          created_at?: string;
          from_date: string;
          id?: string;
          modified_by?: string | null;
          name: string;
          owner_id: string;
          prepared_by?: string | null;
          preparer_id?: string | null;
          previous_status?: string | null;
          published_at?: string | null;
          reviewer_id?: string | null;
          snapshot?: Json | null;
          snapshot_hash?: string | null;
          status?: string;
          to_date: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          company_id?: string;
          config?: Json;
          created_at?: string;
          from_date?: string;
          id?: string;
          modified_by?: string | null;
          name?: string;
          owner_id?: string;
          prepared_by?: string | null;
          preparer_id?: string | null;
          previous_status?: string | null;
          published_at?: string | null;
          reviewer_id?: string | null;
          snapshot?: Json | null;
          snapshot_hash?: string | null;
          status?: string;
          to_date?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "report_packs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      report_saved_views: {
        Row: {
          access_level: string;
          company_id: string;
          config: Json;
          created_at: string;
          firm_id: string | null;
          id: string;
          is_favourite: boolean;
          modified_by: string | null;
          name: string;
          report_id: string;
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          access_level?: string;
          company_id: string;
          config?: Json;
          created_at?: string;
          firm_id?: string | null;
          id?: string;
          is_favourite?: boolean;
          modified_by?: string | null;
          name: string;
          report_id: string;
          updated_at?: string;
          user_id: string;
          version?: number;
        };
        Update: {
          access_level?: string;
          company_id?: string;
          config?: Json;
          created_at?: string;
          firm_id?: string | null;
          id?: string;
          is_favourite?: boolean;
          modified_by?: string | null;
          name?: string;
          report_id?: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "report_saved_views_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_saved_views_firm_id_fkey";
            columns: ["firm_id"];
            isOneToOne: false;
            referencedRelation: "firms";
            referencedColumns: ["id"];
          },
        ];
      };
      report_schedules: {
        Row: {
          anchor_at: string;
          authorized_at: string;
          company_id: string;
          created_at: string;
          enabled: boolean;
          end_at: string | null;
          id: string;
          message: string;
          next_run_at: string;
          owner_id: string;
          pack_id: string | null;
          period: string;
          recipients: Json;
          recurrence: string;
          subject: string;
          timezone: string;
          updated_at: string;
          version: number;
          view_id: string | null;
        };
        Insert: {
          anchor_at: string;
          authorized_at?: string;
          company_id: string;
          created_at?: string;
          enabled?: boolean;
          end_at?: string | null;
          id?: string;
          message?: string;
          next_run_at: string;
          owner_id: string;
          pack_id?: string | null;
          period?: string;
          recipients: Json;
          recurrence: string;
          subject: string;
          timezone?: string;
          updated_at?: string;
          version?: number;
          view_id?: string | null;
        };
        Update: {
          anchor_at?: string;
          authorized_at?: string;
          company_id?: string;
          created_at?: string;
          enabled?: boolean;
          end_at?: string | null;
          id?: string;
          message?: string;
          next_run_at?: string;
          owner_id?: string;
          pack_id?: string | null;
          period?: string;
          recipients?: Json;
          recurrence?: string;
          subject?: string;
          timezone?: string;
          updated_at?: string;
          version?: number;
          view_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "report_schedules_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_schedules_pack_id_fkey";
            columns: ["pack_id"];
            isOneToOne: false;
            referencedRelation: "report_packs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_schedules_view_id_fkey";
            columns: ["view_id"];
            isOneToOne: false;
            referencedRelation: "report_saved_views";
            referencedColumns: ["id"];
          },
        ];
      };
      role_permissions: {
        Row: {
          permission: string;
          role: Database["public"]["Enums"]["company_role"];
        };
        Insert: {
          permission: string;
          role: Database["public"]["Enums"]["company_role"];
        };
        Update: {
          permission?: string;
          role?: Database["public"]["Enums"]["company_role"];
        };
        Relationships: [];
      };
      sales_credit_allocations: {
        Row: {
          allocated_on: string | null;
          amount_minor: number;
          company_id: string;
          created_at: string;
          created_by: string | null;
          credit_note_id: string;
          id: string;
          invoice_id: string;
          reverse_reason: string | null;
          reversed_at: string | null;
          reversed_by: string | null;
          reversed_on: string | null;
        };
        Insert: {
          allocated_on?: string | null;
          amount_minor: number;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          credit_note_id: string;
          id?: string;
          invoice_id: string;
          reverse_reason?: string | null;
          reversed_at?: string | null;
          reversed_by?: string | null;
          reversed_on?: string | null;
        };
        Update: {
          allocated_on?: string | null;
          amount_minor?: number;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          credit_note_id?: string;
          id?: string;
          invoice_id?: string;
          reverse_reason?: string | null;
          reversed_at?: string | null;
          reversed_by?: string | null;
          reversed_on?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sales_credit_allocations_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_credit_allocations_credit_note_id_fkey";
            columns: ["credit_note_id"];
            isOneToOne: false;
            referencedRelation: "sales_credit_notes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_credit_allocations_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "sales_invoices";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_credit_note_lines: {
        Row: {
          account_id: string;
          company_id: string;
          created_at: string;
          credit_note_id: string;
          description: string;
          discount_minor: number;
          gross_minor: number;
          id: string;
          line_order: number;
          net_minor: number;
          product_id: string | null;
          project_id: string | null;
          quantity: number;
          tax_code_id: string | null;
          tax_minor: number;
          tax_rate_bps: number;
          unit_price_minor: number;
        };
        Insert: {
          account_id: string;
          company_id: string;
          created_at?: string;
          credit_note_id: string;
          description: string;
          discount_minor?: number;
          gross_minor: number;
          id?: string;
          line_order?: number;
          net_minor: number;
          product_id?: string | null;
          project_id?: string | null;
          quantity: number;
          tax_code_id?: string | null;
          tax_minor: number;
          tax_rate_bps?: number;
          unit_price_minor: number;
        };
        Update: {
          account_id?: string;
          company_id?: string;
          created_at?: string;
          credit_note_id?: string;
          description?: string;
          discount_minor?: number;
          gross_minor?: number;
          id?: string;
          line_order?: number;
          net_minor?: number;
          product_id?: string | null;
          project_id?: string | null;
          quantity?: number;
          tax_code_id?: string | null;
          tax_minor?: number;
          tax_rate_bps?: number;
          unit_price_minor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sales_credit_note_lines_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_credit_note_lines_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_credit_note_lines_credit_note_id_fkey";
            columns: ["credit_note_id"];
            isOneToOne: false;
            referencedRelation: "sales_credit_notes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_credit_note_lines_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_credit_note_lines_tax_code_id_fkey";
            columns: ["tax_code_id"];
            isOneToOne: false;
            referencedRelation: "tax_codes";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_credit_notes: {
        Row: {
          amount_allocated_minor: number;
          authorised_at: string | null;
          authorised_by: string | null;
          company_id: string;
          contact_id: string;
          created_at: string;
          created_by: string;
          credit_date: string;
          credit_number: string | null;
          currency_code: string;
          fx_rate_to_base: number;
          id: string;
          invoice_id: string | null;
          memo: string | null;
          posted_journal_id: string | null;
          status: Database["public"]["Enums"]["sales_doc_status"];
          subtotal_minor: number;
          tax_minor: number;
          total_minor: number;
          updated_at: string;
          void_date: string | null;
          void_journal_id: string | null;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          amount_allocated_minor?: number;
          authorised_at?: string | null;
          authorised_by?: string | null;
          company_id: string;
          contact_id: string;
          created_at?: string;
          created_by: string;
          credit_date: string;
          credit_number?: string | null;
          currency_code: string;
          fx_rate_to_base?: number;
          id?: string;
          invoice_id?: string | null;
          memo?: string | null;
          posted_journal_id?: string | null;
          status?: Database["public"]["Enums"]["sales_doc_status"];
          subtotal_minor?: number;
          tax_minor?: number;
          total_minor?: number;
          updated_at?: string;
          void_date?: string | null;
          void_journal_id?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          amount_allocated_minor?: number;
          authorised_at?: string | null;
          authorised_by?: string | null;
          company_id?: string;
          contact_id?: string;
          created_at?: string;
          created_by?: string;
          credit_date?: string;
          credit_number?: string | null;
          currency_code?: string;
          fx_rate_to_base?: number;
          id?: string;
          invoice_id?: string | null;
          memo?: string | null;
          posted_journal_id?: string | null;
          status?: Database["public"]["Enums"]["sales_doc_status"];
          subtotal_minor?: number;
          tax_minor?: number;
          total_minor?: number;
          updated_at?: string;
          void_date?: string | null;
          void_journal_id?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sales_credit_notes_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_credit_notes_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_credit_notes_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "sales_invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_credit_notes_posted_journal_id_fkey";
            columns: ["posted_journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_credit_notes_void_journal_id_fkey";
            columns: ["void_journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_invoice_lines: {
        Row: {
          account_id: string;
          company_id: string;
          created_at: string;
          description: string;
          discount_minor: number;
          gross_minor: number;
          id: string;
          invoice_id: string;
          line_order: number;
          net_minor: number;
          product_id: string | null;
          project_id: string | null;
          quantity: number;
          tax_code_id: string | null;
          tax_minor: number;
          tax_rate_bps: number;
          unit_price_minor: number;
        };
        Insert: {
          account_id: string;
          company_id: string;
          created_at?: string;
          description: string;
          discount_minor?: number;
          gross_minor: number;
          id?: string;
          invoice_id: string;
          line_order?: number;
          net_minor: number;
          product_id?: string | null;
          project_id?: string | null;
          quantity: number;
          tax_code_id?: string | null;
          tax_minor: number;
          tax_rate_bps?: number;
          unit_price_minor: number;
        };
        Update: {
          account_id?: string;
          company_id?: string;
          created_at?: string;
          description?: string;
          discount_minor?: number;
          gross_minor?: number;
          id?: string;
          invoice_id?: string;
          line_order?: number;
          net_minor?: number;
          product_id?: string | null;
          project_id?: string | null;
          quantity?: number;
          tax_code_id?: string | null;
          tax_minor?: number;
          tax_rate_bps?: number;
          unit_price_minor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sales_invoice_lines_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_invoice_lines_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_invoice_lines_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "sales_invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_invoice_lines_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_invoice_lines_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_invoice_lines_tax_code_id_fkey";
            columns: ["tax_code_id"];
            isOneToOne: false;
            referencedRelation: "tax_codes";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_invoices: {
        Row: {
          amount_credited_minor: number;
          amount_paid_minor: number;
          authorised_at: string | null;
          authorised_by: string | null;
          company_id: string;
          contact_id: string;
          conversion_batch_id: string | null;
          created_at: string;
          created_by: string;
          currency_code: string;
          due_date: string;
          fx_rate_to_base: number;
          id: string;
          invoice_date: string;
          invoice_number: string | null;
          is_opening_balance: boolean;
          memo: string | null;
          posted_journal_id: string | null;
          quote_id: string | null;
          sent_at: string | null;
          status: Database["public"]["Enums"]["sales_doc_status"];
          subtotal_minor: number;
          tax_minor: number;
          total_minor: number;
          updated_at: string;
          void_date: string | null;
          void_journal_id: string | null;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          amount_credited_minor?: number;
          amount_paid_minor?: number;
          authorised_at?: string | null;
          authorised_by?: string | null;
          company_id: string;
          contact_id: string;
          conversion_batch_id?: string | null;
          created_at?: string;
          created_by: string;
          currency_code: string;
          due_date: string;
          fx_rate_to_base?: number;
          id?: string;
          invoice_date: string;
          invoice_number?: string | null;
          is_opening_balance?: boolean;
          memo?: string | null;
          posted_journal_id?: string | null;
          quote_id?: string | null;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["sales_doc_status"];
          subtotal_minor?: number;
          tax_minor?: number;
          total_minor?: number;
          updated_at?: string;
          void_date?: string | null;
          void_journal_id?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          amount_credited_minor?: number;
          amount_paid_minor?: number;
          authorised_at?: string | null;
          authorised_by?: string | null;
          company_id?: string;
          contact_id?: string;
          conversion_batch_id?: string | null;
          created_at?: string;
          created_by?: string;
          currency_code?: string;
          due_date?: string;
          fx_rate_to_base?: number;
          id?: string;
          invoice_date?: string;
          invoice_number?: string | null;
          is_opening_balance?: boolean;
          memo?: string | null;
          posted_journal_id?: string | null;
          quote_id?: string | null;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["sales_doc_status"];
          subtotal_minor?: number;
          tax_minor?: number;
          total_minor?: number;
          updated_at?: string;
          void_date?: string | null;
          void_journal_id?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sales_invoices_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_invoices_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_invoices_posted_journal_id_fkey";
            columns: ["posted_journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_invoices_quote_id_fkey";
            columns: ["quote_id"];
            isOneToOne: false;
            referencedRelation: "sales_quotes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_invoices_void_journal_id_fkey";
            columns: ["void_journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_quote_lines: {
        Row: {
          account_id: string;
          company_id: string;
          created_at: string;
          description: string;
          discount_minor: number;
          gross_minor: number;
          id: string;
          line_order: number;
          net_minor: number;
          product_id: string | null;
          quantity: number;
          quote_id: string;
          tax_code_id: string | null;
          tax_minor: number;
          tax_rate_bps: number;
          unit_price_minor: number;
        };
        Insert: {
          account_id: string;
          company_id: string;
          created_at?: string;
          description: string;
          discount_minor?: number;
          gross_minor: number;
          id?: string;
          line_order?: number;
          net_minor: number;
          product_id?: string | null;
          quantity: number;
          quote_id: string;
          tax_code_id?: string | null;
          tax_minor: number;
          tax_rate_bps?: number;
          unit_price_minor: number;
        };
        Update: {
          account_id?: string;
          company_id?: string;
          created_at?: string;
          description?: string;
          discount_minor?: number;
          gross_minor?: number;
          id?: string;
          line_order?: number;
          net_minor?: number;
          product_id?: string | null;
          quantity?: number;
          quote_id?: string;
          tax_code_id?: string | null;
          tax_minor?: number;
          tax_rate_bps?: number;
          unit_price_minor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sales_quote_lines_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_quote_lines_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_quote_lines_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_quote_lines_quote_id_fkey";
            columns: ["quote_id"];
            isOneToOne: false;
            referencedRelation: "sales_quotes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_quote_lines_tax_code_id_fkey";
            columns: ["tax_code_id"];
            isOneToOne: false;
            referencedRelation: "tax_codes";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_quotes: {
        Row: {
          accepted_at: string | null;
          company_id: string;
          contact_id: string;
          converted_invoice_id: string | null;
          created_at: string;
          created_by: string;
          currency_code: string;
          declined_at: string | null;
          expiry_date: string | null;
          fx_rate_to_base: number;
          id: string;
          memo: string | null;
          quote_date: string;
          quote_number: string | null;
          sent_at: string | null;
          status: Database["public"]["Enums"]["quote_status"];
          subtotal_minor: number;
          tax_minor: number;
          total_minor: number;
          updated_at: string;
        };
        Insert: {
          accepted_at?: string | null;
          company_id: string;
          contact_id: string;
          converted_invoice_id?: string | null;
          created_at?: string;
          created_by: string;
          currency_code: string;
          declined_at?: string | null;
          expiry_date?: string | null;
          fx_rate_to_base?: number;
          id?: string;
          memo?: string | null;
          quote_date: string;
          quote_number?: string | null;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["quote_status"];
          subtotal_minor?: number;
          tax_minor?: number;
          total_minor?: number;
          updated_at?: string;
        };
        Update: {
          accepted_at?: string | null;
          company_id?: string;
          contact_id?: string;
          converted_invoice_id?: string | null;
          created_at?: string;
          created_by?: string;
          currency_code?: string;
          declined_at?: string | null;
          expiry_date?: string | null;
          fx_rate_to_base?: number;
          id?: string;
          memo?: string | null;
          quote_date?: string;
          quote_number?: string | null;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["quote_status"];
          subtotal_minor?: number;
          tax_minor?: number;
          total_minor?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sales_quotes_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_quotes_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_quotes_converted_invoice_fkey";
            columns: ["converted_invoice_id"];
            isOneToOne: false;
            referencedRelation: "sales_invoices";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_receipt_allocations: {
        Row: {
          allocated_on: string | null;
          amount_minor: number;
          company_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          invoice_id: string;
          receipt_id: string;
          reverse_reason: string | null;
          reversed_at: string | null;
          reversed_by: string | null;
          reversed_on: string | null;
        };
        Insert: {
          allocated_on?: string | null;
          amount_minor: number;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          invoice_id: string;
          receipt_id: string;
          reverse_reason?: string | null;
          reversed_at?: string | null;
          reversed_by?: string | null;
          reversed_on?: string | null;
        };
        Update: {
          allocated_on?: string | null;
          amount_minor?: number;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          invoice_id?: string;
          receipt_id?: string;
          reverse_reason?: string | null;
          reversed_at?: string | null;
          reversed_by?: string | null;
          reversed_on?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sales_receipt_allocations_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_receipt_allocations_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "sales_invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_receipt_allocations_receipt_id_fkey";
            columns: ["receipt_id"];
            isOneToOne: false;
            referencedRelation: "sales_receipts";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_receipts: {
        Row: {
          amount_minor: number;
          bank_account_id: string;
          company_id: string;
          contact_id: string;
          created_at: string;
          created_by: string;
          currency_code: string;
          fx_rate_to_base: number;
          id: string;
          memo: string | null;
          posted_journal_id: string | null;
          receipt_date: string;
          reference: string | null;
          status: string;
          unallocated_minor: number;
          updated_at: string;
          void_date: string | null;
          void_journal_id: string | null;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          amount_minor: number;
          bank_account_id: string;
          company_id: string;
          contact_id: string;
          created_at?: string;
          created_by: string;
          currency_code: string;
          fx_rate_to_base?: number;
          id?: string;
          memo?: string | null;
          posted_journal_id?: string | null;
          receipt_date: string;
          reference?: string | null;
          status?: string;
          unallocated_minor: number;
          updated_at?: string;
          void_date?: string | null;
          void_journal_id?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          amount_minor?: number;
          bank_account_id?: string;
          company_id?: string;
          contact_id?: string;
          created_at?: string;
          created_by?: string;
          currency_code?: string;
          fx_rate_to_base?: number;
          id?: string;
          memo?: string | null;
          posted_journal_id?: string | null;
          receipt_date?: string;
          reference?: string | null;
          status?: string;
          unallocated_minor?: number;
          updated_at?: string;
          void_date?: string | null;
          void_journal_id?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sales_receipts_bank_account_id_fkey";
            columns: ["bank_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_receipts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_receipts_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_receipts_posted_journal_id_fkey";
            columns: ["posted_journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_receipts_void_journal_id_fkey";
            columns: ["void_journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_recurring_invoice_lines: {
        Row: {
          account_id: string;
          company_id: string;
          description: string;
          discount_minor: number;
          id: string;
          line_order: number;
          product_id: string | null;
          quantity: number;
          recurring_id: string;
          tax_code_id: string | null;
          tax_rate_bps: number;
          unit_price_minor: number;
        };
        Insert: {
          account_id: string;
          company_id: string;
          description: string;
          discount_minor?: number;
          id?: string;
          line_order?: number;
          product_id?: string | null;
          quantity: number;
          recurring_id: string;
          tax_code_id?: string | null;
          tax_rate_bps?: number;
          unit_price_minor: number;
        };
        Update: {
          account_id?: string;
          company_id?: string;
          description?: string;
          discount_minor?: number;
          id?: string;
          line_order?: number;
          product_id?: string | null;
          quantity?: number;
          recurring_id?: string;
          tax_code_id?: string | null;
          tax_rate_bps?: number;
          unit_price_minor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sales_recurring_invoice_lines_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_recurring_invoice_lines_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_recurring_invoice_lines_recurring_id_fkey";
            columns: ["recurring_id"];
            isOneToOne: false;
            referencedRelation: "sales_recurring_invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_recurring_invoice_lines_tax_code_id_fkey";
            columns: ["tax_code_id"];
            isOneToOne: false;
            referencedRelation: "tax_codes";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_recurring_invoices: {
        Row: {
          auto_authorise: boolean;
          company_id: string;
          contact_id: string;
          created_at: string;
          created_by: string;
          currency_code: string;
          end_date: string | null;
          frequency: Database["public"]["Enums"]["recurrence_frequency"];
          id: string;
          is_active: boolean;
          last_error: string | null;
          last_generated_on: string | null;
          last_invoice_id: string | null;
          max_occurrences: number | null;
          memo: string | null;
          name: string;
          next_due_date: string;
          occurrences_generated: number;
          payment_terms_days: number | null;
          updated_at: string;
        };
        Insert: {
          auto_authorise?: boolean;
          company_id: string;
          contact_id: string;
          created_at?: string;
          created_by: string;
          currency_code: string;
          end_date?: string | null;
          frequency?: Database["public"]["Enums"]["recurrence_frequency"];
          id?: string;
          is_active?: boolean;
          last_error?: string | null;
          last_generated_on?: string | null;
          last_invoice_id?: string | null;
          max_occurrences?: number | null;
          memo?: string | null;
          name: string;
          next_due_date: string;
          occurrences_generated?: number;
          payment_terms_days?: number | null;
          updated_at?: string;
        };
        Update: {
          auto_authorise?: boolean;
          company_id?: string;
          contact_id?: string;
          created_at?: string;
          created_by?: string;
          currency_code?: string;
          end_date?: string | null;
          frequency?: Database["public"]["Enums"]["recurrence_frequency"];
          id?: string;
          is_active?: boolean;
          last_error?: string | null;
          last_generated_on?: string | null;
          last_invoice_id?: string | null;
          max_occurrences?: number | null;
          memo?: string | null;
          name?: string;
          next_due_date?: string;
          occurrences_generated?: number;
          payment_terms_days?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sales_recurring_invoices_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_recurring_invoices_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_recurring_invoices_last_invoice_id_fkey";
            columns: ["last_invoice_id"];
            isOneToOne: false;
            referencedRelation: "sales_invoices";
            referencedColumns: ["id"];
          },
        ];
      };
      settings_change_log: {
        Row: {
          actor_user_id: string | null;
          category: string;
          company_id: string;
          created_at: string;
          id: string;
          new_value: Json | null;
          old_value: Json | null;
          reason: string | null;
          request_id: string | null;
          setting_key: string;
          source: string;
        };
        Insert: {
          actor_user_id?: string | null;
          category: string;
          company_id: string;
          created_at?: string;
          id?: string;
          new_value?: Json | null;
          old_value?: Json | null;
          reason?: string | null;
          request_id?: string | null;
          setting_key: string;
          source?: string;
        };
        Update: {
          actor_user_id?: string | null;
          category?: string;
          company_id?: string;
          created_at?: string;
          id?: string;
          new_value?: Json | null;
          old_value?: Json | null;
          reason?: string | null;
          request_id?: string | null;
          setting_key?: string;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "settings_change_log_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      supplier_payment_allocations: {
        Row: {
          amount_minor: number;
          bill_id: string;
          company_id: string;
          id: string;
          payment_id: string;
        };
        Insert: {
          amount_minor: number;
          bill_id: string;
          company_id: string;
          id?: string;
          payment_id: string;
        };
        Update: {
          amount_minor?: number;
          bill_id?: string;
          company_id?: string;
          id?: string;
          payment_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "supplier_payment_allocations_bill_id_fkey";
            columns: ["bill_id"];
            isOneToOne: false;
            referencedRelation: "purchase_bills";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_payment_allocations_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_payment_allocations_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "supplier_payments";
            referencedColumns: ["id"];
          },
        ];
      };
      supplier_payments: {
        Row: {
          amount_minor: number;
          bank_account_id: string;
          batch_key: string | null;
          company_id: string;
          contact_id: string;
          created_at: string;
          created_by: string;
          currency_code: string;
          fx_rate_to_base: number;
          id: string;
          idempotency_key: string | null;
          memo: string | null;
          payment_date: string;
          posted_journal_id: string | null;
          realised_fx_minor: number;
          reference: string | null;
          status: Database["public"]["Enums"]["purchase_doc_status"];
          unallocated_minor: number;
          updated_at: string;
          void_date: string | null;
          void_journal_id: string | null;
          void_reason: string | null;
          voided_at: string | null;
        };
        Insert: {
          amount_minor: number;
          bank_account_id: string;
          batch_key?: string | null;
          company_id: string;
          contact_id: string;
          created_at?: string;
          created_by: string;
          currency_code: string;
          fx_rate_to_base?: number;
          id?: string;
          idempotency_key?: string | null;
          memo?: string | null;
          payment_date: string;
          posted_journal_id?: string | null;
          realised_fx_minor?: number;
          reference?: string | null;
          status?: Database["public"]["Enums"]["purchase_doc_status"];
          unallocated_minor?: number;
          updated_at?: string;
          void_date?: string | null;
          void_journal_id?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
        };
        Update: {
          amount_minor?: number;
          bank_account_id?: string;
          batch_key?: string | null;
          company_id?: string;
          contact_id?: string;
          created_at?: string;
          created_by?: string;
          currency_code?: string;
          fx_rate_to_base?: number;
          id?: string;
          idempotency_key?: string | null;
          memo?: string | null;
          payment_date?: string;
          posted_journal_id?: string | null;
          realised_fx_minor?: number;
          reference?: string | null;
          status?: Database["public"]["Enums"]["purchase_doc_status"];
          unallocated_minor?: number;
          updated_at?: string;
          void_date?: string | null;
          void_journal_id?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "supplier_payments_bank_account_id_fkey";
            columns: ["bank_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_payments_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_payments_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_payments_posted_journal_id_fkey";
            columns: ["posted_journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_payments_void_journal_id_fkey";
            columns: ["void_journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
        ];
      };
      tax_codes: {
        Row: {
          applies_to: string;
          code: string;
          company_id: string;
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          is_recoverable: boolean;
          name: string;
          reporting_class: string | null;
          tax_account_id: string | null;
          tax_rate_id: string;
          treatment: string;
          updated_at: string;
        };
        Insert: {
          applies_to?: string;
          code: string;
          company_id: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_recoverable?: boolean;
          name: string;
          reporting_class?: string | null;
          tax_account_id?: string | null;
          tax_rate_id: string;
          treatment?: string;
          updated_at?: string;
        };
        Update: {
          applies_to?: string;
          code?: string;
          company_id?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_recoverable?: boolean;
          name?: string;
          reporting_class?: string | null;
          tax_account_id?: string | null;
          tax_rate_id?: string;
          treatment?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tax_codes_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tax_codes_tax_account_id_fkey";
            columns: ["tax_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tax_codes_tax_rate_id_fkey";
            columns: ["tax_rate_id"];
            isOneToOne: false;
            referencedRelation: "tax_rates";
            referencedColumns: ["id"];
          },
        ];
      };
      tax_rates: {
        Row: {
          applies_to: string;
          code: string | null;
          company_id: string;
          created_at: string;
          effective_from: string;
          effective_to: string | null;
          id: string;
          is_active: boolean;
          jurisdiction_code: string | null;
          name: string;
          rate_bps: number;
          source_note: string | null;
          treatment: string;
          updated_at: string;
        };
        Insert: {
          applies_to?: string;
          code?: string | null;
          company_id: string;
          created_at?: string;
          effective_from: string;
          effective_to?: string | null;
          id?: string;
          is_active?: boolean;
          jurisdiction_code?: string | null;
          name: string;
          rate_bps: number;
          source_note?: string | null;
          treatment?: string;
          updated_at?: string;
        };
        Update: {
          applies_to?: string;
          code?: string | null;
          company_id?: string;
          created_at?: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          is_active?: boolean;
          jurisdiction_code?: string | null;
          name?: string;
          rate_bps?: number;
          source_note?: string | null;
          treatment?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tax_rates_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      tax_return_lines: {
        Row: {
          amount_minor: number;
          box_key: string;
          company_id: string;
          id: string;
          label: string;
          return_id: string;
          sort_order: number;
        };
        Insert: {
          amount_minor: number;
          box_key: string;
          company_id: string;
          id?: string;
          label: string;
          return_id: string;
          sort_order?: number;
        };
        Update: {
          amount_minor?: number;
          box_key?: string;
          company_id?: string;
          id?: string;
          label?: string;
          return_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tax_return_lines_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tax_return_lines_return_id_fkey";
            columns: ["return_id"];
            isOneToOne: false;
            referencedRelation: "tax_returns";
            referencedColumns: ["id"];
          },
        ];
      };
      tax_returns: {
        Row: {
          basis: string;
          company_id: string;
          created_at: string;
          created_by: string | null;
          currency_code: string | null;
          filed_at: string | null;
          filed_by: string | null;
          id: string;
          jurisdiction_code: string | null;
          net_tax_minor: number;
          period_end: string;
          period_start: string;
          settlement_journal_id: string | null;
          status: string;
          summary: Json;
          updated_at: string;
        };
        Insert: {
          basis?: string;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          currency_code?: string | null;
          filed_at?: string | null;
          filed_by?: string | null;
          id?: string;
          jurisdiction_code?: string | null;
          net_tax_minor?: number;
          period_end: string;
          period_start: string;
          settlement_journal_id?: string | null;
          status?: string;
          summary?: Json;
          updated_at?: string;
        };
        Update: {
          basis?: string;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          currency_code?: string | null;
          filed_at?: string | null;
          filed_by?: string | null;
          id?: string;
          jurisdiction_code?: string | null;
          net_tax_minor?: number;
          period_end?: string;
          period_start?: string;
          settlement_journal_id?: string | null;
          status?: string;
          summary?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tax_returns_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tax_returns_settlement_journal_id_fkey";
            columns: ["settlement_journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
        ];
      };
      tracking_categories: {
        Row: {
          applies_to: string[];
          company_id: string;
          created_at: string;
          description: string | null;
          dimension_kind: string;
          id: string;
          is_active: boolean;
          is_required: boolean;
          name: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          applies_to?: string[];
          company_id: string;
          created_at?: string;
          description?: string | null;
          dimension_kind?: string;
          id?: string;
          is_active?: boolean;
          is_required?: boolean;
          name: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          applies_to?: string[];
          company_id?: string;
          created_at?: string;
          description?: string | null;
          dimension_kind?: string;
          id?: string;
          is_active?: boolean;
          is_required?: boolean;
          name?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tracking_categories_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      tracking_options: {
        Row: {
          category_id: string;
          code: string | null;
          company_id: string;
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          name: string;
          parent_option_id: string | null;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          category_id: string;
          code?: string | null;
          company_id: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          parent_option_id?: string | null;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          category_id?: string;
          code?: string | null;
          company_id?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          parent_option_id?: string | null;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tracking_options_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "tracking_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tracking_options_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tracking_options_parent_option_id_fkey";
            columns: ["parent_option_id"];
            isOneToOne: false;
            referencedRelation: "tracking_options";
            referencedColumns: ["id"];
          },
        ];
      };
      transaction_correction_batches: {
        Row: {
          adjustment_date: string | null;
          company_id: string;
          created_at: string;
          created_by: string;
          date_mode: string;
          id: string;
          journal_ids: string[];
          plan: Json;
          preview_hash: string;
          reason: string;
          request_hash: string;
          request_key: string;
          status: string;
          target_account_id: string;
          undo_date: string | null;
          undo_journal_ids: string[] | null;
          undo_reason: string | null;
          undone_at: string | null;
          undone_by: string | null;
        };
        Insert: {
          adjustment_date?: string | null;
          company_id: string;
          created_at?: string;
          created_by: string;
          date_mode: string;
          id?: string;
          journal_ids?: string[];
          plan: Json;
          preview_hash: string;
          reason: string;
          request_hash: string;
          request_key: string;
          status?: string;
          target_account_id: string;
          undo_date?: string | null;
          undo_journal_ids?: string[] | null;
          undo_reason?: string | null;
          undone_at?: string | null;
          undone_by?: string | null;
        };
        Update: {
          adjustment_date?: string | null;
          company_id?: string;
          created_at?: string;
          created_by?: string;
          date_mode?: string;
          id?: string;
          journal_ids?: string[];
          plan?: Json;
          preview_hash?: string;
          reason?: string;
          request_hash?: string;
          request_key?: string;
          status?: string;
          target_account_id?: string;
          undo_date?: string | null;
          undo_journal_ids?: string[] | null;
          undo_reason?: string | null;
          undone_at?: string | null;
          undone_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "transaction_correction_batches_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transaction_correction_batches_target_account_id_fkey";
            columns: ["target_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      transaction_correction_items: {
        Row: {
          active: boolean;
          batch_id: string;
          company_id: string;
          source_journal_id: string;
          source_line_id: string;
        };
        Insert: {
          active?: boolean;
          batch_id: string;
          company_id: string;
          source_journal_id: string;
          source_line_id: string;
        };
        Update: {
          active?: boolean;
          batch_id?: string;
          company_id?: string;
          source_journal_id?: string;
          source_line_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transaction_correction_items_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "transaction_correction_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transaction_correction_items_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transaction_correction_items_source_journal_id_fkey";
            columns: ["source_journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transaction_correction_items_source_line_id_fkey";
            columns: ["source_line_id"];
            isOneToOne: false;
            referencedRelation: "journal_lines";
            referencedColumns: ["id"];
          },
        ];
      };
      usage_counters: {
        Row: {
          company_id: string;
          metric: string;
          period_start: string;
          quantity: number;
        };
        Insert: {
          company_id: string;
          metric: string;
          period_start: string;
          quantity?: number;
        };
        Update: {
          company_id?: string;
          metric?: string;
          period_start?: string;
          quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: "usage_counters_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      user_ui_preferences: {
        Row: {
          company_id: string;
          id: string;
          preference_key: string;
          preference_value: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          company_id: string;
          id?: string;
          preference_key: string;
          preference_value?: Json;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          company_id?: string;
          id?: string;
          preference_key?: string;
          preference_value?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_ui_preferences_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_company_invitation: { Args: { _token: string }; Returns: Json };
      accept_portal_invite: { Args: { payload: Json }; Returns: Json };
      account_balance_as_of: {
        Args: { _account_id: string; _as_of: string; _company_id: string };
        Returns: number;
      };
      account_merge_plan: {
        Args: { _company: string; _source: string; _target: string };
        Returns: Json;
      };
      account_transactions: {
        Args: {
          _account_id: string;
          _company_id: string;
          _from: string;
          _limit?: number;
          _offset?: number;
          _to: string;
        };
        Returns: {
          credit_minor: number;
          debit_minor: number;
          description: string;
          journal_date: string;
          journal_id: string;
          journal_number: number;
          line_id: string;
          line_no: number;
          memo: string;
          opening_balance_minor: number;
          running_balance_minor: number;
          source_id: string;
          source_type: string;
          total_count: number;
        }[];
      };
      allocate_document_number: {
        Args: { _company_id: string; _document_type: string };
        Returns: string;
      };
      allocate_sales_credit_note: { Args: { payload: Json }; Returns: Json };
      apply_transaction_correction: {
        Args: {
          _company_id: string;
          _date: string;
          _items: Json;
          _mode: string;
          _preview_hash: string;
          _reason: string;
          _request_key: string;
          _target_id: string;
        };
        Returns: Json;
      };
      assert_billing_allowance: {
        Args: { _adding?: number; _company_id: string; _metric: string };
        Returns: undefined;
      };
      assert_can_manage_tax_returns: {
        Args: { _company_id: string };
        Returns: undefined;
      };
      assert_journal_date_unlocked: {
        Args: { _company_id: string; _journal_date: string };
        Returns: undefined;
      };
      bank_integrity_check: {
        Args: { _company_id: string };
        Returns: {
          code: string;
          finding_count: number;
          message: string;
          sample_ids: string[];
          severity: string;
        }[];
      };
      bulk_practice_tasks: {
        Args: { _items: Json; _note: string; _status: string };
        Returns: number;
      };
      bump_bank_coding_history: {
        Args: {
          _company_id: string;
          _description_sample: string;
          _direction: string;
          _offset_account_id: string;
          _payee_normalized: string;
        };
        Returns: undefined;
      };
      can_access_attachment: {
        Args: { _action: string; _company_id: string; _entity_type: string };
        Returns: boolean;
      };
      can_access_storage_document: {
        Args: { _action: string; _name: string };
        Returns: boolean;
      };
      can_read_action_notification: {
        Args: { _category: string; _company_id: string };
        Returns: boolean;
      };
      cancel_action_document_request: {
        Args: { _request_id: string };
        Returns: boolean;
      };
      cancel_auto_reversal: { Args: { payload: Json }; Returns: Json };
      capture_custom_report_facts: {
        Args: {
          _company_id: string;
          _definition: Json;
          _from: string;
          _to: string;
        };
        Returns: Json;
      };
      capture_reporting_facts: {
        Args: { _company_id: string; _from: string; _to: string };
        Returns: Json;
      };
      capture_standard_report_facts: {
        Args: {
          _company_id: string;
          _from: string;
          _report_id: string;
          _settings: Json;
          _to: string;
        };
        Returns: Json;
      };
      cash_movements_by_month: {
        Args: { _company_id: string; _from: string; _to: string };
        Returns: {
          cash_in_minor: number;
          cash_out_minor: number;
          month_start: string;
        }[];
      };
      claim_communication_send: {
        Args: { _company_id: string; _kind: string };
        Returns: boolean;
      };
      claim_report_deliveries: {
        Args: { _limit?: number };
        Returns: {
          attempts: number;
          authorized_at: string;
          company_id: string;
          created_at: string;
          definition: Json;
          facts: Json;
          id: string;
          last_error: string | null;
          lease_until: string | null;
          message: string;
          next_attempt_at: string;
          next_status_check_at: string;
          owner_id: string;
          pack_id: string | null;
          provider_id: string | null;
          recipients: Json;
          schedule_id: string | null;
          scheduled_for: string | null;
          status: string;
          subject: string;
          updated_at: string;
          view_id: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "report_deliveries";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      claim_report_delivery_confirmations: {
        Args: { _limit?: number };
        Returns: {
          id: string;
          provider_id: string;
        }[];
      };
      company_break_glass_log: { Args: { _company_id: string }; Returns: Json };
      complete_action_document_request: {
        Args: { _attachment_id: string; _request_id: string };
        Returns: boolean;
      };
      complete_reconciliation_session: {
        Args: {
          _bank_account_id: string;
          _bank_transaction_ids?: string[];
          _company_id: string;
          _journal_line_ids?: string[];
          _notes?: string;
          _opening_balance_minor: number;
          _statement_balance_minor: number;
          _statement_date: string;
        };
        Returns: Json;
      };
      confirm_report_delivery: {
        Args: { _delivered: boolean; _provider_id: string; _reason?: string };
        Returns: undefined;
      };
      copy_chart_accounts: {
        Args: { _source: string; _target: string };
        Returns: Json;
      };
      count_ai_usage_last_hour: {
        Args: { _company_id: string };
        Returns: number;
      };
      create_action_document_request: {
        Args: {
          _company_id: string;
          _instructions?: string;
          _requested_from: string;
          _subject: string;
        };
        Returns: string;
      };
      create_bank_transfer: {
        Args: {
          _amount_minor: number;
          _company_id: string;
          _currency_code: string;
          _from_bank_account_id: string;
          _memo?: string;
          _to_bank_account_id: string;
          _transfer_date: string;
        };
        Returns: Json;
      };
      create_bank_transfer_fx: { Args: { payload: Json }; Returns: Json };
      create_company: {
        Args: {
          _base_currency: string;
          _country_code: string;
          _fy_end_day: number;
          _fy_end_month: number;
          _legal_name?: string;
          _name: string;
          _timezone: string;
        };
        Returns: string;
      };
      create_demo_company: { Args: never; Returns: string };
      create_invoice_share_link: {
        Args: {
          _company_id: string;
          _expires_in_days?: number;
          _invoice_id: string;
        };
        Returns: Json;
      };
      create_month_end_work: {
        Args: { _company_id: string; _due_date: string; _period_end: string };
        Returns: number;
      };
      create_practice_firm: { Args: { _name: string }; Returns: string };
      delete_budget: { Args: { _budget_id: string }; Returns: undefined };
      delete_document_theme: {
        Args: { _company_id: string; _id: string; _revision: number };
        Returns: undefined;
      };
      delete_draft_sales_document: { Args: { payload: Json }; Returns: Json };
      delete_draft_tax_return: {
        Args: { _return_id: string };
        Returns: undefined;
      };
      delete_fixed_asset: { Args: { _asset_id: string }; Returns: undefined };
      delete_report_schedule: { Args: { _id: string }; Returns: undefined };
      delete_sales_recurring_invoice: { Args: { payload: Json }; Returns: Json };
      deliver_invoice_to_portal: { Args: { payload: Json }; Returns: Json };
      dispose_fixed_asset: {
        Args: {
          _asset_id: string;
          _disposal_date: string;
          _gain_loss_account_id?: string;
          _notes?: string;
          _proceeds_account_id?: string;
          _proceeds_minor?: number;
        };
        Returns: string;
      };
      enqueue_due_report_schedules: { Args: { _now?: string }; Returns: number };
      ensure_accounting_period_coverage: {
        Args: {
          _company_id: string;
          _from: string;
          _name?: string;
          _to: string;
        };
        Returns: string;
      };
      ensure_fiscal_period_for_date: {
        Args: { _company_id: string; _date: string };
        Returns: string;
      };
      ensure_fx_account: {
        Args: { _company_id: string; _kind: string };
        Returns: string;
      };
      fa_assert_account: {
        Args: {
          _account_id: string;
          _company_id: string;
          _label: string;
          _types: Database["public"]["Enums"]["account_type"][];
        };
        Returns: undefined;
      };
      fa_month_amount: {
        Args: {
          _cost: number;
          _k: number;
          _life: number;
          _method: string;
          _opening: number;
          _posted: number;
          _rate_bps: number;
          _residual: number;
        };
        Returns: number;
      };
      fa_month_end: { Args: { _d: string }; Returns: string };
      file_tax_return: { Args: { _return_id: string }; Returns: undefined };
      find_correction_lines: {
        Args: { _company_id: string; _filters: Json };
        Returns: Json;
      };
      find_duplicate_contacts: {
        Args: { _company_id: string; _limit?: number };
        Returns: {
          a_account_number: string;
          a_email: string;
          a_id: string;
          a_name: string;
          a_phone: string;
          a_tax_number: string;
          b_account_number: string;
          b_email: string;
          b_id: string;
          b_name: string;
          b_phone: string;
          b_tax_number: string;
          reasons: string[];
          score: number;
        }[];
      };
      finish_report_delivery: {
        Args: {
          _attempt: number;
          _error?: string;
          _id: string;
          _provider_id?: string;
        };
        Returns: undefined;
      };
      fiscal_year_end_in_year: {
        Args: { _day: number; _month: number; _y: number };
        Returns: string;
      };
      fiscal_year_for_date: {
        Args: { _company_id: string; _date: string };
        Returns: Record<string, unknown>;
      };
      fx_realise_allocation: {
        Args: { _alloc_id: string; _kind: string };
        Returns: string;
      };
      fx_revaluation_compute: {
        Args: { _as_of: string; _company: string; _rates: Json };
        Returns: Json;
      };
      fx_reverse_realised: {
        Args: { _alloc_id: string; _kind: string; _on: string };
        Returns: string;
      };
      fx_to_base_minor: {
        Args: {
          _base_currency: string;
          _minor: number;
          _rate: number;
          _txn_currency: string;
        };
        Returns: number;
      };
      get_document_appearance: {
        Args: { _company_id: string; _document_id: string; _kind: string };
        Returns: Json;
      };
      get_document_theme_context: {
        Args: { _company_id: string; _kind: string };
        Returns: Json;
      };
      get_entitlements: { Args: { _company_id: string }; Returns: Json };
      get_portal_settings: { Args: { payload: Json }; Returns: Json };
      get_report_activity: { Args: { _company_id: string }; Returns: Json };
      get_reporting_delivery_status: {
        Args: { _company_id: string };
        Returns: Json;
      };
      get_reporting_feature_access: {
        Args: { _company_id: string };
        Returns: Json;
      };
      get_reporting_filter_options: {
        Args: { _company_id: string };
        Returns: Json;
      };
      get_scheduled_digest_items: {
        Args: { _company: string; _user: string };
        Returns: {
          body: string;
          priority: string;
          title: string;
        }[];
      };
      get_shared_invoice: { Args: { _token: string }; Returns: Json };
      has_company_permission: {
        Args: { _company_id: string; _permission: string };
        Returns: boolean;
      };
      has_company_role: {
        Args: {
          _company_id: string;
          _roles: Database["public"]["Enums"]["company_role"][];
        };
        Returns: boolean;
      };
      import_chart_accounts: {
        Args: { _company_id: string; _rows: Json };
        Returns: Json;
      };
      import_fixed_asset_register: {
        Args: { _company_id: string; _rows: Json };
        Returns: Json;
      };
      invite_portal_user: { Args: { payload: Json }; Returns: Json };
      is_billing_operator: { Args: never; Returns: boolean };
      is_company_advisor: { Args: { _company_id: string }; Returns: boolean };
      is_company_member: { Args: { _company_id: string }; Returns: boolean };
      is_firm_admin: { Args: { _firm_id: string }; Returns: boolean };
      is_firm_member: { Args: { _firm_id: string }; Returns: boolean };
      is_valid_iban: { Args: { _iban: string }; Returns: boolean };
      issue_company_invitation: {
        Args: {
          _adjustments: Json;
          _company_id: string;
          _email: string;
          _expires_at: string;
          _role: Database["public"]["Enums"]["company_role"];
          _token_hash: string;
        };
        Returns: string;
      };
      ledger_balances: {
        Args: {
          _company_id: string;
          _exclude_year_end_close?: boolean;
          _from?: string;
          _to?: string;
        };
        Returns: {
          account_id: string;
          credit_minor: number;
          debit_minor: number;
          line_count: number;
        }[];
      };
      ledger_control_account: {
        Args: { _company_id: string; _role: string };
        Returns: string;
      };
      ledger_health_check: { Args: { payload: Json }; Returns: Json };
      ledger_monthly_activity: {
        Args: {
          _company_id: string;
          _exclude_year_end_close?: boolean;
          _from: string;
          _to: string;
        };
        Returns: {
          account_id: string;
          credit_minor: number;
          debit_minor: number;
          month: string;
        }[];
      };
      list_action_document_recipients: {
        Args: { _company_id: string };
        Returns: {
          display_name: string;
          user_id: string;
        }[];
      };
      list_bank_account_details: {
        Args: { _company_id: string };
        Returns: {
          account_number_masked: string;
          bank_account_id: string;
          bic: string;
          has_account_number: boolean;
          has_iban: boolean;
          has_sort_code: boolean;
          iban_masked: string;
          opening_statement_balance_date: string;
          opening_statement_balance_minor: number;
          sort_code_masked: string;
        }[];
      };
      list_contact_portal_access: { Args: { payload: Json }; Returns: Json };
      list_live_feature_prices: { Args: never; Returns: Json };
      list_organisation_secret_meta: {
        Args: { _company_id: string };
        Returns: {
          created_at: string;
          last4: string;
          rotated_at: string;
          secret_key: string;
        }[];
      };
      list_public_billing_plans: { Args: never; Returns: Json };
      lock_accounting_period: {
        Args: { _period_id: string };
        Returns: undefined;
      };
      lookup_billing_offer: {
        Args: { _code: string };
        Returns: {
          amount_currency: string;
          amount_minor: number;
          code: string;
          ends_on: string;
          extra_free_months: number;
          extra_trial_days: number;
          intervals: string;
          is_active: boolean;
          kind: string;
          max_redemptions: number;
          percent_bps: number;
          plan_codes: string[];
          redemption_count: number;
          starts_on: string;
        }[];
      };
      lookup_fx_rate_to_base: {
        Args: { _as_of: string; _company_id: string; _from_currency: string };
        Returns: number;
      };
      manage_practice_client: {
        Args: {
          _access: string;
          _company_id: string;
          _firm_id: string;
          _revoke?: boolean;
        };
        Returns: Json;
      };
      match_bank_transaction: {
        Args: {
          _bank_transaction_id: string;
          _company_id: string;
          _journal_line_ids: string[];
        };
        Returns: Json;
      };
      match_bank_transactions_to_journal_line: {
        Args: {
          _bank_transaction_ids: string[];
          _company_id: string;
          _journal_line_id: string;
        };
        Returns: Json;
      };
      merge_accounts_dated: { Args: { payload: Json }; Returns: Json };
      merge_contacts: {
        Args: { _company_id: string; _merge_id: string; _survivor_id: string };
        Returns: Json;
      };
      next_journal_number: { Args: { _company_id: string }; Returns: number };
      ops_ap_control_account: { Args: { _company_id: string }; Returns: string };
      ops_doc_rate: {
        Args: { _ccy: string; _company: string; _on: string; _rate: number };
        Returns: number;
      };
      ops_fx_account: {
        Args: { _company_id: string; _kind: string };
        Returns: string;
      };
      ops_input_tax_account: { Args: { _company_id: string }; Returns: string };
      ops_mask_identifier: {
        Args: { _keep?: number; _value: string };
        Returns: string;
      };
      ops_minor_to_base: {
        Args: {
          _amount: number;
          _company_id: string;
          _currency: string;
          _rate: number;
        };
        Returns: number;
      };
      ops_output_tax_account: { Args: { _company_id: string }; Returns: string };
      ops_record_supplier_payment: {
        Args: {
          _bank: string;
          _batch_key: string;
          _company: string;
          _date: string;
          _p: Json;
          _uid: string;
        };
        Returns: Json;
      };
      ops_run_recurring_journal: {
        Args: {
          _as_of: string;
          _ignore_date?: boolean;
          _max: number;
          _template_id: string;
        };
        Returns: Json;
      };
      ops_usable_account: {
        Args: { _account_id: string; _company_id: string };
        Returns: boolean;
      };
      platform_ai_governance: { Args: { _company_id: string }; Returns: Json };
      platform_announcements: { Args: { _company_id?: string }; Returns: Json };
      platform_automation_action: {
        Args: {
          _command: string;
          _payload: Json;
          _reason: string;
          _request_id: string;
        };
        Returns: Json;
      };
      platform_automation_read: {
        Args: {
          _id?: string;
          _module: string;
          _page?: number;
          _search?: string;
          _status?: string;
        };
        Returns: Json;
      };
      platform_bulk_business: {
        Args: { _ids: string[]; _reason: string; _status: string };
        Returns: Json;
      };
      platform_capture_mrr_movements: {
        Args: { _reason: string };
        Returns: Json;
      };
      platform_close_service_case: {
        Args: { _case_id: string; _reason: string };
        Returns: undefined;
      };
      platform_company_context: { Args: never; Returns: Json };
      platform_context: { Args: never; Returns: Json };
      platform_create_alert_rule: {
        Args: { _name: string; _reason: string; _threshold: number };
        Returns: string;
      };
      platform_create_segment: {
        Args: { _name: string; _reason: string };
        Returns: string;
      };
      platform_customer_360: { Args: { _company_id: string }; Returns: Json };
      platform_decide_approval: {
        Args: { _decision: string; _id: string; _reason: string };
        Returns: Json;
      };
      platform_decide_break_glass: {
        Args: { _decision: string; _grant_id: string; _reason: string };
        Returns: undefined;
      };
      platform_decide_closure: {
        Args: { _decision: string; _reason: string; _request_id: string };
        Returns: undefined;
      };
      platform_decide_promotion: {
        Args: { _decision: string; _id: string; _reason: string };
        Returns: undefined;
      };
      platform_details: {
        Args: { _id: string; _resource: string };
        Returns: Json;
      };
      platform_enqueue_job: {
        Args: { _name: string; _reason: string };
        Returns: string;
      };
      platform_expire_break_glass: {
        Args: { _grant_id: string };
        Returns: undefined;
      };
      platform_export: {
        Args: { _page?: number; _resource: string; _search?: string };
        Returns: Json;
      };
      platform_global_search: { Args: { _query: string }; Returns: Json };
      platform_health: { Args: never; Returns: Json };
      platform_lifetime_value: { Args: { _company_id: string }; Returns: Json };
      platform_list: {
        Args: {
          _page?: number;
          _resource: string;
          _search?: string;
          _sort?: string;
        };
        Returns: Json;
      };
      platform_list_approvals: { Args: never; Returns: Json };
      platform_list_webhook_deliveries: {
        Args: never;
        Returns: {
          created_at: string;
          event_id: string;
          id: string;
          provider: string;
          status: string;
        }[];
      };
      platform_mutate: {
        Args: {
          _action: string;
          _id?: string;
          _payload?: Json;
          _reason?: string;
        };
        Returns: Json;
      };
      platform_open_incident: {
        Args: { _reason: string; _title: string };
        Returns: string;
      };
      platform_open_service_case: {
        Args: { _company_id: string; _reason: string; _subject: string };
        Returns: string;
      };
      platform_ops_apply: {
        Args: {
          _command: string;
          _payload: Json;
          _reason: string;
          _request_id: string;
        };
        Returns: Json;
      };
      platform_ops_context: { Args: never; Returns: Json };
      platform_ops_detail: {
        Args: { _id: string; _module: string };
        Returns: Json;
      };
      platform_ops_list: {
        Args: {
          _company?: string;
          _module: string;
          _page?: number;
          _search?: string;
          _status?: string;
        };
        Returns: Json;
      };
      platform_ops_lookup: {
        Args: { _kind: string; _page?: number; _search?: string };
        Returns: Json;
      };
      platform_ops_member_preview: {
        Args: { _company_ids: string[]; _id: string; _mode: string };
        Returns: Json;
      };
      platform_ops_members: {
        Args: { _id: string; _page?: number; _search?: string };
        Returns: Json;
      };
      platform_overview: { Args: { _from: string; _to: string }; Returns: Json };
      platform_price_action: {
        Args: { _action: string; _payload: Json; _reason: string };
        Returns: Json;
      };
      platform_reconcile_mrr: { Args: never; Returns: Json };
      platform_record: {
        Args: { _id: string; _resource: string };
        Returns: Json;
      };
      platform_record_lifetime_payment: {
        Args: {
          _amount_minor: number;
          _company_id: string;
          _currency: string;
          _reason: string;
          _source_id: string;
        };
        Returns: string;
      };
      platform_record_proration: {
        Args: { _company_id: string; _proration_minor: number; _reason: string };
        Returns: string;
      };
      platform_record_provider_fee: {
        Args: {
          _company_id: string;
          _currency: string;
          _fee_minor: number;
          _gross_minor: number;
          _provider: string;
          _provider_charge_id: string;
          _reason: string;
        };
        Returns: string;
      };
      platform_record_provider_reconciliation: {
        Args: {
          _company_id: string;
          _difference_minor: number;
          _reason: string;
          _state: string;
        };
        Returns: string;
      };
      platform_record_release: {
        Args: { _reason: string; _version: string };
        Returns: string;
      };
      platform_record_webhook_delivery: {
        Args: {
          _event_id: string;
          _provider: string;
          _reason: string;
          _status: string;
        };
        Returns: string;
      };
      platform_register_partner: {
        Args: { _name: string; _reason: string; _revenue_share_minor: number };
        Returns: string;
      };
      platform_request_break_glass: {
        Args: {
          _company_id: string;
          _expires_at: string;
          _reason: string;
          _request_id: string;
        };
        Returns: string;
      };
      platform_request_closure: {
        Args: { _company_id: string; _reason: string };
        Returns: string;
      };
      platform_request_promotion: {
        Args: { _reason: string; _source: string; _target: string };
        Returns: string;
      };
      platform_request_sandbox: {
        Args: { _name: string; _reason: string };
        Returns: string;
      };
      platform_resolve_incident: {
        Args: { _id: string; _reason: string };
        Returns: undefined;
      };
      platform_revoke_break_glass: {
        Args: { _grant_id: string; _reason: string };
        Returns: undefined;
      };
      platform_role: { Args: never; Returns: string };
      platform_rotate_api_key: {
        Args: { _key_id: string; _label: string; _reason: string };
        Returns: string;
      };
      platform_save_usage_draft: {
        Args: {
          _company_id: string;
          _currency: string;
          _net_minor: number;
          _quantity: number;
          _reason: string;
          _status: string;
        };
        Returns: string;
      };
      platform_set_entitlement: {
        Args: {
          _effect: string;
          _expires: string;
          _feature: string;
          _notes: string;
          _plan_code: string;
          _reason: string;
          _scope: string;
          _scope_id: string;
          _source: string;
          _starts: string;
        };
        Returns: Json;
      };
      platform_set_plan_visibility: {
        Args: { _is_public: boolean; _plan_code: string; _reason: string };
        Returns: undefined;
      };
      platform_set_staff_role: {
        Args: { _reason: string; _role: string; _user_id: string };
        Returns: undefined;
      };
      platform_subscription_cohorts: { Args: never; Returns: Json };
      platform_supervised_support_list: { Args: never; Returns: Json };
      platform_support_read: { Args: { _company_id: string }; Returns: Json };
      platform_tag_company: {
        Args: { _company_id: string; _reason: string; _segment_id: string };
        Returns: undefined;
      };
      portal_acknowledge_order: { Args: { payload: Json }; Returns: Json };
      portal_assert_writable: {
        Args: { _company_id: string };
        Returns: undefined;
      };
      portal_attach_provider: { Args: { payload: Json }; Returns: Json };
      portal_audit: {
        Args: {
          _action: string;
          _actor: string;
          _company_id: string;
          _details: Json;
          _entity_id: string;
          _entity_type: string;
        };
        Returns: undefined;
      };
      portal_claim_sandbox: { Args: { payload: Json }; Returns: Json };
      portal_company_today: { Args: { _company_id: string }; Returns: string };
      portal_create_payment_intent: { Args: { payload: Json }; Returns: Json };
      portal_download_file: { Args: { payload: Json }; Returns: Json };
      portal_enabled: { Args: { _company_id: string }; Returns: boolean };
      portal_file_is_valid: {
        Args: { _bytes: string; _mime: string };
        Returns: boolean;
      };
      portal_get_invoice: { Args: { payload: Json }; Returns: Json };
      portal_home: { Args: { payload: Json }; Returns: Json };
      portal_invoice_hold: {
        Args: { _except: string; _invoice_id: string };
        Returns: number;
      };
      portal_jwt_email: { Args: never; Returns: string };
      portal_line_amounts: {
        Args: { _bps: number; _quantity: number; _unit: number };
        Returns: {
          net_minor: number;
          tax_minor: number;
        }[];
      };
      portal_list_alerts: { Args: { payload: Json }; Returns: Json };
      portal_list_credits: { Args: { payload: Json }; Returns: Json };
      portal_list_files: { Args: { payload: Json }; Returns: Json };
      portal_list_invoices: { Args: { payload: Json }; Returns: Json };
      portal_list_messages: { Args: { payload: Json }; Returns: Json };
      portal_list_notifications: { Args: { payload: Json }; Returns: Json };
      portal_list_receipts: { Args: { payload: Json }; Returns: Json };
      portal_mask_account: { Args: { _number: string }; Returns: string };
      portal_my_access: { Args: { payload: Json }; Returns: Json };
      portal_notify: {
        Args: {
          _body: string;
          _company_id: string;
          _contact_id: string;
          _title: string;
        };
        Returns: undefined;
      };
      portal_post_captured_intent: {
        Args: { _intent_id: string };
        Returns: Json;
      };
      portal_post_message: { Args: { payload: Json }; Returns: Json };
      portal_rate_limit: {
        Args: { _bucket: string; _max: number; _window: string };
        Returns: undefined;
      };
      portal_request_bank_change: { Args: { payload: Json }; Returns: Json };
      portal_require_member: {
        Args: { _membership_id: string };
        Returns: {
          accepted_at: string | null;
          company_id: string;
          contact_id: string;
          created_at: string;
          email: string;
          id: string;
          invite_expires_at: string | null;
          invite_token_hash: string | null;
          invited_by: string | null;
          mfa_required: boolean;
          portal_role: string;
          revoked_at: string | null;
          revoked_by: string | null;
          status: string;
          user_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "portal_memberships";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      portal_resolve_alert: { Args: { payload: Json }; Returns: Json };
      portal_restore_jwt: {
        Args: { _claims: string; _sub: string };
        Returns: undefined;
      };
      portal_session_aal: { Args: never; Returns: string };
      portal_statement: { Args: { payload: Json }; Returns: Json };
      portal_submit_supplier_document: {
        Args: { payload: Json };
        Returns: Json;
      };
      portal_supplier_workspace: { Args: { payload: Json }; Returns: Json };
      portal_upload_file: { Args: { payload: Json }; Returns: Json };
      post_auto_reversing_journal: { Args: { payload: Json }; Returns: Json };
      post_conversion_balances: { Args: { payload: Json }; Returns: Json };
      post_fx_revaluation: { Args: { payload: Json }; Returns: Json };
      post_journal: { Args: { payload: Json }; Returns: string };
      post_money_document: { Args: { payload: Json }; Returns: Json };
      post_recurring_journal_now: { Args: { payload: Json }; Returns: Json };
      practice_assignees: {
        Args: { _company_id: string };
        Returns: {
          name: string;
          user_id: string;
        }[];
      };
      preview_account_merge: { Args: { payload: Json }; Returns: Json };
      preview_company_invitation: { Args: { _token: string }; Returns: Json };
      preview_fx_revaluation: { Args: { payload: Json }; Returns: Json };
      preview_transaction_correction: {
        Args: {
          _company_id: string;
          _date: string;
          _items: Json;
          _mode: string;
          _reason: string;
          _target_id: string;
        };
        Returns: Json;
      };
      process_all_due_recurring_journals: {
        Args: { _as_of?: string };
        Returns: Json;
      };
      process_auto_reversals_worker: {
        Args: { _company: string; _up_to: string };
        Returns: Json;
      };
      process_due_auto_reversals: { Args: { payload: Json }; Returns: Json };
      process_due_auto_reversals_system: {
        Args: { _up_to?: string };
        Returns: Json;
      };
      project_profitability: {
        Args: { _company_id: string; _from?: string; _to?: string };
        Returns: {
          budget_minor: number;
          code: string;
          cost_minor: number;
          name: string;
          profit_minor: number;
          project_id: string;
          revenue_minor: number;
          status: string;
          unconverted_documents: number;
        }[];
      };
      publish_action_notification: {
        Args: {
          _body: string;
          _category: string;
          _company_id: string;
          _entity_id?: string;
          _entity_type?: string;
          _event_key: string;
          _priority: string;
          _recipient_user_id: string;
          _target_path?: string;
          _title: string;
        };
        Returns: string;
      };
      queue_report_delivery: {
        Args: { _company_id: string; _payload: Json };
        Returns: string;
      };
      record_ai_usage: {
        Args: {
          _company_id: string;
          _error_code?: string;
          _estimated_tokens?: number;
          _intent: string;
          _latency_ms?: number;
          _model?: string;
          _prompt_chars?: number;
          _provider?: string;
          _status: string;
        };
        Returns: string;
      };
      record_app_audit_event: {
        Args: {
          _action: string;
          _company_id: string;
          _details?: Json;
          _entity_id?: string | null;
          _entity_type: string;
        };
        Returns: string;
      };
      record_audit_event: {
        Args: {
          _action: string;
          _company_id: string;
          _details?: Json;
          _entity_id?: string;
          _entity_type: string;
        };
        Returns: string;
      };
      record_billing_usage: {
        Args: { _adding: number; _company_id: string; _metric: string };
        Returns: undefined;
      };
      record_customer_receipt: { Args: { payload: Json }; Returns: Json };
      record_email_outbox: { Args: { payload: Json }; Returns: string };
      record_report_open:
        | {
            Args: {
              _company_id: string;
              _event_id: string;
              _from: string;
              _report_id: string;
              _to: string;
              _view_id: string;
            };
            Returns: boolean;
          }
        | {
            Args: {
              _company_id: string;
              _event_id: string;
              _from: string;
              _report_id: string;
              _search: Json;
              _to: string;
              _view_id: string;
            };
            Returns: boolean;
          };
      record_supplier_payment: { Args: { payload: Json }; Returns: Json };
      record_supplier_payment_batch: { Args: { payload: Json }; Returns: Json };
      recurring_claim_occurrence: {
        Args: {
          _company_id: string;
          _document_date: string;
          _idempotency_key: string;
          _schedule_id: string;
          _scheduled_date: string;
          _template_version_id: string;
        };
        Returns: Json;
      };
      recurring_complete_occurrence: {
        Args: {
          _failed_message?: string;
          _occurrence_id: string;
          _purchase_bill_id?: string;
          _sales_invoice_id?: string;
        };
        Returns: undefined;
      };
      redeem_billing_offer: { Args: { _code: string }; Returns: undefined };
      refresh_action_notifications: {
        Args: { _company_id: string };
        Returns: number;
      };
      remove_sales_credit_allocation: { Args: { payload: Json }; Returns: Json };
      replace_purchase_bill_lines: {
        Args: { _bill_id: string; _company_id: string; _lines: Json };
        Returns: number;
      };
      report_bank_reconciliation_summary: {
        Args: { _as_of: string; _company_id: string };
        Returns: {
          bank_account_id: string;
          bank_account_name: string;
          book_balance_minor: number;
          currency_code: string;
          difference_minor: number;
          gl_account_id: string;
          last_reconciled_date: string;
          last_statement_balance_minor: number;
          uncleared_line_count: number;
          uncleared_net_minor: number;
          uncoded_statement_count: number;
          uncoded_statement_minor: number;
        }[];
      };
      report_cash_summary: {
        Args: { _company_id: string; _from: string; _to: string };
        Returns: {
          bank_account_id: string;
          bank_account_name: string;
          closing_minor: number;
          gl_account_code: string;
          gl_account_id: string;
          opening_minor: number;
          received_minor: number;
          spent_minor: number;
          transfers_in_minor: number;
          transfers_out_minor: number;
        }[];
      };
      report_depreciation_schedule: {
        Args: { _company_id: string; _from: string; _to: string };
        Returns: {
          asset_id: string;
          asset_name: string;
          asset_number: string;
          charge_minor: number;
          closing_accumulated_minor: number;
          cost_minor: number;
          disposal_date: string;
          opening_accumulated_minor: number;
        }[];
      };
      report_filtered_balances: {
        Args: {
          _company_id: string;
          _filters: Json;
          _from: string;
          _to: string;
        };
        Returns: {
          account_id: string;
          credit_minor: number;
          debit_minor: number;
          line_count: number;
        }[];
      };
      report_fixed_asset_register: {
        Args: { _as_of: string; _company_id: string };
        Returns: {
          accumulated_minor: number;
          annual_rate_bps: number;
          asset_account_id: string;
          asset_id: string;
          asset_name: string;
          asset_number: string;
          asset_type_name: string;
          cost_minor: number;
          depreciation_method: string;
          disposal_date: string;
          disposal_proceeds_minor: number;
          purchase_date: string;
          residual_minor: number;
          source_bill_id: string;
          useful_life_months: number;
        }[];
      };
      report_gl_summary: {
        Args: { _company_id: string; _from: string; _to: string };
        Returns: {
          account_code: string;
          account_id: string;
          account_name: string;
          account_type: string;
          closing_minor: number;
          credit_minor: number;
          debit_minor: number;
          line_count: number;
          opening_minor: number;
        }[];
      };
      report_pack_counts: { Args: { _company_id: string }; Returns: Json };
      report_pack_integrity: { Args: { _id: string }; Returns: boolean };
      report_purchases_by_supplier: {
        Args: { _company_id: string; _from: string; _to: string };
        Returns: {
          bill_count: number;
          contact_id: string;
          contact_name: string;
          credit_note_count: number;
          gross_minor: number;
          net_minor: number;
          tax_minor: number;
        }[];
      };
      report_sales_by_contact: {
        Args: { _company_id: string; _from: string; _to: string };
        Returns: {
          contact_id: string;
          contact_name: string;
          credit_note_count: number;
          gross_minor: number;
          invoice_count: number;
          net_minor: number;
          tax_minor: number;
        }[];
      };
      report_sales_by_item: {
        Args: { _company_id: string; _from: string; _to: string };
        Returns: {
          item_code: string;
          item_name: string;
          line_count: number;
          net_minor: number;
          product_id: string;
          quantity: number;
          tax_minor: number;
        }[];
      };
      report_to_base_minor: {
        Args: {
          _base_currency: string;
          _minor: number;
          _rate: number;
          _txn_currency: string;
        };
        Returns: number;
      };
      reporting_worker_heartbeat: {
        Args: { _configured: boolean; _from?: string };
        Returns: undefined;
      };
      reporting_worker_token_valid: {
        Args: { _token: string };
        Returns: boolean;
      };
      reset_demo_company: { Args: { _company_id: string }; Returns: undefined };
      retry_portal_payment_post: { Args: { payload: Json }; Returns: Json };
      reverse_conversion_balances: { Args: { payload: Json }; Returns: Json };
      reverse_journal: {
        Args: { _idempotency_key?: string; _journal_id: string };
        Returns: string;
      };
      reverse_journal_on: {
        Args: {
          _idempotency_key?: string;
          _journal_id: string;
          _reversal_date: string;
        };
        Returns: string;
      };
      reverse_supplier_payment: { Args: { payload: Json }; Returns: Json };
      revoke_company_invitation: {
        Args: { _company_id: string; _invitation_id: string };
        Returns: undefined;
      };
      revoke_invoice_share_links: {
        Args: { _company_id: string; _invoice_id: string };
        Returns: number;
      };
      revoke_portal_access: { Args: { payload: Json }; Returns: Json };
      rollout_bucket: {
        Args: { _feature: string; _organisation: string };
        Returns: number;
      };
      rollout_decision: {
        Args: {
          _allowlist: string[];
          _company_id: string;
          _ends: string;
          _feature: string;
          _mode: string;
          _now: string;
          _organisation: string;
          _percent: number;
          _region: string;
          _starts: string;
          _target_region: string;
          _trialing: boolean;
        };
        Returns: Json;
      };
      run_depreciation: {
        Args: { _company_id: string; _period_end: string; _preview?: boolean };
        Returns: {
          accumulated_after_minor: number;
          amount_minor: number;
          asset_id: string;
          asset_name: string;
          asset_number: string;
          journal_id: string;
          status: string;
        }[];
      };
      run_due_recurring_journals: { Args: { payload: Json }; Returns: Json };
      run_portal_reminders: { Args: { payload: Json }; Returns: Json };
      sales_ar_control_account: {
        Args: { _company_id: string };
        Returns: string;
      };
      sales_derive_invoice_status: {
        Args: { _credited: number; _paid: number; _total: number };
        Returns: Database["public"]["Enums"]["sales_doc_status"];
      };
      sales_is_deposit_account: {
        Args: { _account_id: string; _company_id: string };
        Returns: boolean;
      };
      save_asset_type: {
        Args: { _company_id: string; _payload: Json; _type_id: string };
        Returns: string;
      };
      save_bank_account_details: { Args: { payload: Json }; Returns: Json };
      save_budget: {
        Args: {
          _budget_id: string;
          _company_id: string;
          _fiscal_year_start: string;
          _name: string;
          _notes?: string;
        };
        Returns: string;
      };
      save_budget_lines: {
        Args: { _budget_id: string; _lines: Json; _mode?: string };
        Returns: number;
      };
      save_document_branding: {
        Args: { _company_id: string; _values: Json };
        Returns: undefined;
      };
      save_document_theme: {
        Args: {
          _company_id: string;
          _config: Json;
          _id: string;
          _name: string;
          _revision: number;
        };
        Returns: Json;
      };
      save_fixed_asset: {
        Args: { _asset_id: string; _company_id: string; _payload: Json };
        Returns: string;
      };
      save_member_adjustments: {
        Args: { _adjustments: Json; _company_id: string; _user_id: string };
        Returns: undefined;
      };
      save_portal_settings: { Args: { payload: Json }; Returns: Json };
      save_practice_task: {
        Args: { _company_id: string; _payload: Json };
        Returns: Json;
      };
      save_report_pack: {
        Args: { _company_id: string; _payload: Json };
        Returns: string;
      };
      save_report_schedule: {
        Args: { _company_id: string; _payload: Json };
        Returns: string;
      };
      save_sales_document_draft: { Args: { payload: Json }; Returns: Json };
      save_tax_return_draft: {
        Args: {
          _basis: string;
          _company_id: string;
          _currency: string;
          _jurisdiction: string;
          _lines: Json;
          _net_tax_minor: number;
          _period_end: string;
          _period_start: string;
          _summary: Json;
        };
        Returns: string;
      };
      seed_country_tax_pack: {
        Args: { _company_id: string; _pack_id?: string };
        Returns: Json;
      };
      seed_default_accounting_periods: {
        Args: { _company_id: string };
        Returns: undefined;
      };
      seed_default_chart_of_accounts: {
        Args: { _company_id: string };
        Returns: undefined;
      };
      seed_default_tax_pack: {
        Args: { _company_id: string };
        Returns: undefined;
      };
      seed_fx_accounts: { Args: { _company_id: string }; Returns: undefined };
      set_action_notification_state: {
        Args: {
          _archive?: boolean;
          _mark_read?: boolean;
          _notification_id: string;
        };
        Returns: boolean;
      };
      set_document_project: { Args: { payload: Json }; Returns: Json };
      set_document_theme_default: {
        Args: { _company_id: string; _kind: string; _theme_id: string };
        Returns: undefined;
      };
      set_organisation_feature: {
        Args: {
          _company_id: string;
          _config?: Json;
          _enabled: boolean;
          _feature_key: string;
          _reason?: string;
          _source?: string;
        };
        Returns: Json;
      };
      set_organisation_lock_policy: {
        Args: {
          _company_id: string;
          _conversion_date?: string;
          _lock_date_everyone?: string;
          _lock_date_except_advisors?: string;
          _reason?: string;
          _require_override_reason?: boolean;
        };
        Returns: Json;
      };
      set_report_access: {
        Args: {
          _firm_id?: string;
          _grants?: Json;
          _level: string;
          _view_id: string;
        };
        Returns: undefined;
      };
      set_tax_return_settlement: {
        Args: { _journal_id: string; _return_id: string };
        Returns: undefined;
      };
      settle_portal_payment: { Args: { payload: Json }; Returns: Json };
      shares_company_with: { Args: { _other: string }; Returns: boolean };
      staff_decide_bank_request: { Args: { payload: Json }; Returns: Json };
      staff_decide_portal_submission: { Args: { payload: Json }; Returns: Json };
      staff_list_bank_requests: { Args: { payload: Json }; Returns: Json };
      staff_list_portal_submissions: { Args: { payload: Json }; Returns: Json };
      start_company_trial: {
        Args: { _company_id: string; _plan_code: string };
        Returns: string;
      };
      subscription_allows_posting: {
        Args: { _company_id: string };
        Returns: boolean;
      };
      transaction_correction_setup: {
        Args: { _company_id: string };
        Returns: Json;
      };
      transition_report_pack: {
        Args: { _action: string; _id: string; _note?: string; _version: number };
        Returns: undefined;
      };
      trg_fx_alloc_delete: {
        Args: { _id: string; _kind: string };
        Returns: undefined;
      };
      unallocate_customer_receipt: { Args: { payload: Json }; Returns: Json };
      undo_transaction_correction: {
        Args: {
          _batch_id: string;
          _company_id: string;
          _date: string;
          _reason: string;
        };
        Returns: Json;
      };
      unlock_accounting_period: {
        Args: { _period_id: string };
        Returns: undefined;
      };
      unmatch_bank_transaction: {
        Args: {
          _bank_transaction_id: string;
          _company_id: string;
          _reason?: string;
        };
        Returns: Json;
      };
      upsert_organisation_config: {
        Args: {
          _category: string;
          _company_id: string;
          _document: Json;
          _expected_version?: number;
          _reason?: string;
          _request_id?: string;
          _source?: string;
        };
        Returns: Json;
      };
      void_customer_receipt: { Args: { payload: Json }; Returns: Json };
      void_exchange_rate: { Args: { _rate_id: string }; Returns: undefined };
      void_money_document: { Args: { payload: Json }; Returns: Json };
      void_reconciliation_session: {
        Args: { _company_id: string; _reason?: string; _session_id: string };
        Returns: Json;
      };
      void_sales_credit_note: { Args: { payload: Json }; Returns: Json };
      void_sales_invoice: { Args: { payload: Json }; Returns: Json };
      winning_entitlements: {
        Args: { _company_id: string; _user_id: string };
        Returns: Json;
      };
      write_off_bad_debt: { Args: { payload: Json }; Returns: Json };
      write_organisation_secret: {
        Args: { _company_id: string; _plaintext: string; _secret_key: string };
        Returns: Json;
      };
    };
    Enums: {
      account_type: "asset" | "liability" | "equity" | "income" | "expense";
      bank_txn_status: "uncategorised" | "matched" | "reconciled" | "excluded";
      company_role: "owner" | "admin" | "accountant" | "bookkeeper" | "staff" | "read_only";
      contact_kind: "supplier" | "customer" | "both" | "employee";
      expense_claim_status: "draft" | "submitted" | "approved" | "rejected" | "reimbursed" | "void";
      firm_access_level: "view" | "bookkeep" | "full";
      firm_member_role: "owner" | "admin" | "member";
      journal_source_type:
        | "manual"
        | "opening_balance"
        | "sales_invoice"
        | "sales_credit_note"
        | "customer_payment"
        | "purchase_bill"
        | "purchase_credit_note"
        | "supplier_payment"
        | "expense"
        | "bank_transaction"
        | "bank_transfer"
        | "tax_adjustment"
        | "reversal"
        | "other"
        | "fx_revaluation"
        | "depreciation"
        | "asset_disposal"
        | "fx_realised"
        | "payroll";
      journal_status: "draft" | "approved" | "posted" | "voided";
      membership_status: "active" | "invited" | "suspended";
      normal_balance: "debit" | "credit";
      period_status: "open" | "locked" | "closed";
      po_status: "draft" | "sent" | "partially_received" | "billed" | "cancelled";
      product_kind: "service" | "product" | "non_inventory";
      purchase_doc_status:
        "draft" | "authorised" | "partly_paid" | "paid" | "void" | "awaiting_approval";
      quote_status: "draft" | "sent" | "accepted" | "declined" | "expired" | "converted" | "void";
      recurrence_frequency: "weekly" | "monthly" | "quarterly" | "yearly";
      recurring_catch_up_policy: "all_missed" | "latest_only" | "review_each";
      recurring_document_type:
        | "purchase_bill"
        | "sales_invoice"
        | "purchase_credit_note"
        | "sales_credit_note"
        | "purchase_expense"
        | "sales_receipt"
        | "manual_journal"
        | "bank_transfer";
      recurring_occurrence_status:
        "pending" | "processing" | "completed" | "failed" | "skipped" | "needs_input";
      recurring_template_mode: "scheduled" | "reminder" | "on_demand";
      sales_doc_status: "draft" | "authorised" | "partly_paid" | "paid" | "void";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      account_type: ["asset", "liability", "equity", "income", "expense"],
      bank_txn_status: ["uncategorised", "matched", "reconciled", "excluded"],
      company_role: ["owner", "admin", "accountant", "bookkeeper", "staff", "read_only"],
      contact_kind: ["supplier", "customer", "both", "employee"],
      expense_claim_status: ["draft", "submitted", "approved", "rejected", "reimbursed", "void"],
      firm_access_level: ["view", "bookkeep", "full"],
      firm_member_role: ["owner", "admin", "member"],
      journal_source_type: [
        "manual",
        "opening_balance",
        "sales_invoice",
        "sales_credit_note",
        "customer_payment",
        "purchase_bill",
        "purchase_credit_note",
        "supplier_payment",
        "expense",
        "bank_transaction",
        "bank_transfer",
        "tax_adjustment",
        "reversal",
        "other",
        "fx_revaluation",
        "depreciation",
        "asset_disposal",
        "fx_realised",
        "payroll",
      ],
      journal_status: ["draft", "approved", "posted", "voided"],
      membership_status: ["active", "invited", "suspended"],
      normal_balance: ["debit", "credit"],
      period_status: ["open", "locked", "closed"],
      po_status: ["draft", "sent", "partially_received", "billed", "cancelled"],
      product_kind: ["service", "product", "non_inventory"],
      purchase_doc_status: [
        "draft",
        "authorised",
        "partly_paid",
        "paid",
        "void",
        "awaiting_approval",
      ],
      quote_status: ["draft", "sent", "accepted", "declined", "expired", "converted", "void"],
      recurrence_frequency: ["weekly", "monthly", "quarterly", "yearly"],
      recurring_catch_up_policy: ["all_missed", "latest_only", "review_each"],
      recurring_document_type: [
        "purchase_bill",
        "sales_invoice",
        "purchase_credit_note",
        "sales_credit_note",
        "purchase_expense",
        "sales_receipt",
        "manual_journal",
        "bank_transfer",
      ],
      recurring_occurrence_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "skipped",
        "needs_input",
      ],
      recurring_template_mode: ["scheduled", "reminder", "on_demand"],
      sales_doc_status: ["draft", "authorised", "partly_paid", "paid", "void"],
    },
  },
} as const;
