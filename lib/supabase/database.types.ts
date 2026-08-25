export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      center_location_events: {
        Row: {
          accuracy_m: number | null
          actor_profile_id: string | null
          captured_at: string
          created_at: string
          id: string
          installation_center_id: string
          latitude: number
          longitude: number
          source: string
        }
        Insert: {
          accuracy_m?: number | null
          actor_profile_id?: string | null
          captured_at: string
          created_at?: string
          id?: string
          installation_center_id: string
          latitude: number
          longitude: number
          source: string
        }
        Update: {
          accuracy_m?: number | null
          actor_profile_id?: string | null
          captured_at?: string
          created_at?: string
          id?: string
          installation_center_id?: string
          latitude?: number
          longitude?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "center_location_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "center_location_events_installation_center_id_fkey"
            columns: ["installation_center_id"]
            isOneToOne: false
            referencedRelation: "installation_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      center_network_approval_events: {
        Row: {
          action: string
          actor_profile_id: string | null
          created_at: string
          id: string
          installation_center_id: string
          occurred_at: string
        }
        Insert: {
          action: string
          actor_profile_id?: string | null
          created_at?: string
          id?: string
          installation_center_id: string
          occurred_at: string
        }
        Update: {
          action?: string
          actor_profile_id?: string | null
          created_at?: string
          id?: string
          installation_center_id?: string
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "center_network_approval_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "center_network_approval_events_installation_center_id_fkey"
            columns: ["installation_center_id"]
            isOneToOne: false
            referencedRelation: "installation_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      center_onboarding_invitations: {
        Row: {
          accepted_at: string | null
          auth_user_id: string | null
          cancelled_at: string | null
          created_at: string
          failure_code: string | null
          id: string
          installation_center_id: string
          invited_by_profile_id: string
          invited_email: string
          review_required_at: string | null
          status: string
          superseded_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          auth_user_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          failure_code?: string | null
          id?: string
          installation_center_id: string
          invited_by_profile_id: string
          invited_email: string
          review_required_at?: string | null
          status?: string
          superseded_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          auth_user_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          failure_code?: string | null
          id?: string
          installation_center_id?: string
          invited_by_profile_id?: string
          invited_email?: string
          review_required_at?: string | null
          status?: string
          superseded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "center_onboarding_invitations_installation_center_id_fkey"
            columns: ["installation_center_id"]
            isOneToOne: false
            referencedRelation: "installation_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "center_onboarding_invitations_invited_by_profile_id_fkey"
            columns: ["invited_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      country_agents: {
        Row: {
          code: string
          country_code: string
          created_at: string
          id: string
          name: string
          opened_roll_recovery_enabled: boolean
          status: string
        }
        Insert: {
          code: string
          country_code: string
          created_at?: string
          id?: string
          name: string
          opened_roll_recovery_enabled?: boolean
          status?: string
        }
        Update: {
          code?: string
          country_code?: string
          created_at?: string
          id?: string
          name?: string
          opened_roll_recovery_enabled?: boolean
          status?: string
        }
        Relationships: []
      }
      dealers: {
        Row: {
          code: string
          country_agent_id: string
          country_code: string
          created_at: string
          id: string
          name: string
          status: string
        }
        Insert: {
          code: string
          country_agent_id: string
          country_code: string
          created_at?: string
          id?: string
          name: string
          status?: string
        }
        Update: {
          code?: string
          country_agent_id?: string
          country_code?: string
          created_at?: string
          id?: string
          name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealers_country_agent_country_fkey"
            columns: ["country_agent_id", "country_code"]
            isOneToOne: false
            referencedRelation: "country_agents"
            referencedColumns: ["id", "country_code"]
          },
        ]
      }
      installation_centers: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by_profile_id: string | null
          city: string
          code: string
          country_agent_id: string | null
          country_code: string
          created_at: string
          dealer_id: string | null
          id: string
          latitude: number | null
          location_accuracy_m: number | null
          location_captured_at: string | null
          location_source: string | null
          location_updated_by_profile_id: string | null
          longitude: number | null
          name: string
          status: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by_profile_id?: string | null
          city: string
          code: string
          country_agent_id?: string | null
          country_code: string
          created_at?: string
          dealer_id?: string | null
          id?: string
          latitude?: number | null
          location_accuracy_m?: number | null
          location_captured_at?: string | null
          location_source?: string | null
          location_updated_by_profile_id?: string | null
          longitude?: number | null
          name: string
          status?: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by_profile_id?: string | null
          city?: string
          code?: string
          country_agent_id?: string | null
          country_code?: string
          created_at?: string
          dealer_id?: string | null
          id?: string
          latitude?: number | null
          location_accuracy_m?: number | null
          location_captured_at?: string | null
          location_source?: string | null
          location_updated_by_profile_id?: string | null
          longitude?: number | null
          name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "installation_centers_agent_country_fkey"
            columns: ["country_agent_id", "country_code"]
            isOneToOne: false
            referencedRelation: "country_agents"
            referencedColumns: ["id", "country_code"]
          },
          {
            foreignKeyName: "installation_centers_approved_by_profile_id_fkey"
            columns: ["approved_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_centers_dealer_country_fkey"
            columns: ["dealer_id", "country_code"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id", "country_code"]
          },
          {
            foreignKeyName: "installation_centers_location_updated_by_profile_id_fkey"
            columns: ["location_updated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_push_deliveries: {
        Row: {
          attempt_count: number
          claim_expires_at: string | null
          claim_token: string | null
          created_at: string
          id: string
          last_attempt_at: string | null
          last_completed_claim_token: string | null
          last_error_code: string | null
          last_http_status: number | null
          next_attempt_at: string
          notification_id: string
          sent_at: string | null
          status: string
          subscription_id: string
        }
        Insert: {
          attempt_count?: number
          claim_expires_at?: string | null
          claim_token?: string | null
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_completed_claim_token?: string | null
          last_error_code?: string | null
          last_http_status?: number | null
          next_attempt_at?: string
          notification_id: string
          sent_at?: string | null
          status?: string
          subscription_id: string
        }
        Update: {
          attempt_count?: number
          claim_expires_at?: string | null
          claim_token?: string | null
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_completed_claim_token?: string | null
          last_error_code?: string | null
          last_http_status?: number | null
          next_attempt_at?: string
          notification_id?: string
          sent_at?: string | null
          status?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_push_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_push_deliveries_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_path: string | null
          attention_level: string
          body: string
          created_at: string
          event_type: string
          id: string
          push_eligible: boolean
          read_at: string | null
          recipient_profile_id: string
          source_domain: string
          source_event_key: string
          title: string
        }
        Insert: {
          action_path?: string | null
          attention_level: string
          body: string
          created_at?: string
          event_type: string
          id?: string
          push_eligible?: boolean
          read_at?: string | null
          recipient_profile_id: string
          source_domain: string
          source_event_key: string
          title: string
        }
        Update: {
          action_path?: string | null
          attention_level?: string
          body?: string
          created_at?: string
          event_type?: string
          id?: string
          push_eligible?: boolean
          read_at?: string | null
          recipient_profile_id?: string
          source_domain?: string
          source_event_key?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_parties: {
        Row: {
          country_agent_id: string | null
          created_at: string
          dealer_id: string | null
          id: string
          installation_center_id: string | null
          party_type: string
          transfer_code: string
        }
        Insert: {
          country_agent_id?: string | null
          created_at?: string
          dealer_id?: string | null
          id?: string
          installation_center_id?: string | null
          party_type: string
          transfer_code: string
        }
        Update: {
          country_agent_id?: string | null
          created_at?: string
          dealer_id?: string | null
          id?: string
          installation_center_id?: string | null
          party_type?: string
          transfer_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_parties_country_agent_id_fkey"
            columns: ["country_agent_id"]
            isOneToOne: true
            referencedRelation: "country_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_parties_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: true
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_parties_installation_center_id_fkey"
            columns: ["installation_center_id"]
            isOneToOne: true
            referencedRelation: "installation_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_assets: {
        Row: {
          created_at: string
          id: string
          kind: string
          label: string | null
          mime_type: string
          original_name: string
          product_id: string
          size_bytes: number
          sort_order: number
          storage_path: string
          visibility: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          label?: string | null
          mime_type: string
          original_name: string
          product_id: string
          size_bytes: number
          sort_order?: number
          storage_path: string
          visibility?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          label?: string | null
          mime_type?: string
          original_name?: string
          product_id?: string
          size_bytes?: number
          sort_order?: number
          storage_path?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_assets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      production_lots: {
        Row: {
          created_at: string
          id: string
          lot_number: string
          lot_sequence: number
          product_id: string
          production_order_id: string
          roll_count: number
          source_lot_reference: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          lot_number: string
          lot_sequence: number
          product_id: string
          production_order_id: string
          roll_count: number
          source_lot_reference?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          lot_number?: string
          lot_sequence?: number
          product_id?: string
          production_order_id?: string
          roll_count?: number
          source_lot_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_lots_order_product_consistency_fkey"
            columns: ["production_order_id", "product_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id", "product_id"]
          },
          {
            foreignKeyName: "production_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_lots_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      production_orders: {
        Row: {
          created_at: string
          created_by: string
          id: string
          length_m_snapshot: number
          notes: string | null
          order_number: string
          origin_country_snapshot: string
          product_code_snapshot: string
          product_id: string
          product_name_snapshot: string
          product_version_snapshot: string | null
          production_date: string
          request_id: string
          source_reference: string | null
          status: string
          thickness_mil_snapshot: number
          total_rolls: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          weight_kg_snapshot: number
          width_mm_snapshot: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          length_m_snapshot: number
          notes?: string | null
          order_number: string
          origin_country_snapshot: string
          product_code_snapshot: string
          product_id: string
          product_name_snapshot: string
          product_version_snapshot?: string | null
          production_date: string
          request_id: string
          source_reference?: string | null
          status?: string
          thickness_mil_snapshot: number
          total_rolls: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          weight_kg_snapshot: number
          width_mm_snapshot: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          length_m_snapshot?: number
          notes?: string | null
          order_number?: string
          origin_country_snapshot?: string
          product_code_snapshot?: string
          product_id?: string
          product_name_snapshot?: string
          product_version_snapshot?: string | null
          production_date?: string
          request_id?: string
          source_reference?: string | null
          status?: string
          thickness_mil_snapshot?: number
          total_rolls?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          weight_kg_snapshot?: number
          width_mm_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          care_instructions: string | null
          category: string | null
          code: string
          created_at: string
          currency_code: string | null
          default_warranty_months: number
          features: string[]
          gtin: string | null
          id: string
          length_m: number | null
          marketing_description: string | null
          name: string
          origin_country: string | null
          product_type: string
          publication_status: string
          reference_price: number | null
          slug: string
          status: string
          technical_description: string | null
          thickness_mil: number | null
          version_name: string | null
          warranty_coverage: string | null
          weight_kg: number | null
          width_mm: number | null
        }
        Insert: {
          care_instructions?: string | null
          category?: string | null
          code: string
          created_at?: string
          currency_code?: string | null
          default_warranty_months: number
          features?: string[]
          gtin?: string | null
          id?: string
          length_m?: number | null
          marketing_description?: string | null
          name: string
          origin_country?: string | null
          product_type?: string
          publication_status?: string
          reference_price?: number | null
          slug: string
          status?: string
          technical_description?: string | null
          thickness_mil?: number | null
          version_name?: string | null
          warranty_coverage?: string | null
          weight_kg?: number | null
          width_mm?: number | null
        }
        Update: {
          care_instructions?: string | null
          category?: string | null
          code?: string
          created_at?: string
          currency_code?: string | null
          default_warranty_months?: number
          features?: string[]
          gtin?: string | null
          id?: string
          length_m?: number | null
          marketing_description?: string | null
          name?: string
          origin_country?: string | null
          product_type?: string
          publication_status?: string
          reference_price?: number | null
          slug?: string
          status?: string
          technical_description?: string | null
          thickness_mil?: number | null
          version_name?: string | null
          warranty_coverage?: string | null
          weight_kg?: number | null
          width_mm?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          country_agent_id: string | null
          created_at: string
          dealer_id: string | null
          display_name: string
          id: string
          installation_center_id: string | null
          phone: string | null
          role: string
          status: string
        }
        Insert: {
          country_agent_id?: string | null
          created_at?: string
          dealer_id?: string | null
          display_name: string
          id: string
          installation_center_id?: string | null
          phone?: string | null
          role: string
          status?: string
        }
        Update: {
          country_agent_id?: string | null
          created_at?: string
          dealer_id?: string | null
          display_name?: string
          id?: string
          installation_center_id?: string | null
          phone?: string | null
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_country_agent_id_fkey"
            columns: ["country_agent_id"]
            isOneToOne: false
            referencedRelation: "country_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_installation_center_id_fkey"
            columns: ["installation_center_id"]
            isOneToOne: false
            referencedRelation: "installation_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth_secret: string
          created_at: string
          disabled_at: string | null
          endpoint: string
          id: string
          last_failure_at: string | null
          last_success_at: string | null
          p256dh: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          auth_secret: string
          created_at?: string
          disabled_at?: string | null
          endpoint: string
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          p256dh: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          auth_secret?: string
          created_at?: string
          disabled_at?: string | null
          endpoint?: string
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          p256dh?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      roll_custody_current: {
        Row: {
          confirmed_at: string
          created_at: string
          custodian_party_id: string
          roll_id: string
        }
        Insert: {
          confirmed_at: string
          created_at?: string
          custodian_party_id: string
          roll_id: string
        }
        Update: {
          confirmed_at?: string
          created_at?: string
          custodian_party_id?: string
          roll_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roll_custody_current_custodian_party_id_fkey"
            columns: ["custodian_party_id"]
            isOneToOne: false
            referencedRelation: "operational_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roll_custody_current_roll_id_fkey"
            columns: ["roll_id"]
            isOneToOne: true
            referencedRelation: "rolls"
            referencedColumns: ["id"]
          },
        ]
      }
      roll_custody_events: {
        Row: {
          confirmed_at: string
          custodian_party_id: string
          custody_sequence: number
          id: string
          recorded_at: string
          roll_id: string
          transfer_id: string | null
        }
        Insert: {
          confirmed_at: string
          custodian_party_id: string
          custody_sequence: number
          id?: string
          recorded_at?: string
          roll_id: string
          transfer_id?: string | null
        }
        Update: {
          confirmed_at?: string
          custodian_party_id?: string
          custody_sequence?: number
          id?: string
          recorded_at?: string
          roll_id?: string
          transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roll_custody_events_custodian_party_id_fkey"
            columns: ["custodian_party_id"]
            isOneToOne: false
            referencedRelation: "operational_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roll_custody_events_roll_id_fkey"
            columns: ["roll_id"]
            isOneToOne: false
            referencedRelation: "rolls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roll_custody_events_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "roll_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      roll_openings: {
        Row: {
          created_at: string
          opened_at: string
          opened_by_center_party_id: string
          opened_by_profile_id: string
          request_id: string
          roll_id: string
        }
        Insert: {
          created_at?: string
          opened_at: string
          opened_by_center_party_id: string
          opened_by_profile_id: string
          request_id: string
          roll_id: string
        }
        Update: {
          created_at?: string
          opened_at?: string
          opened_by_center_party_id?: string
          opened_by_profile_id?: string
          request_id?: string
          roll_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roll_openings_opened_by_center_party_id_fkey"
            columns: ["opened_by_center_party_id"]
            isOneToOne: false
            referencedRelation: "operational_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roll_openings_opened_by_profile_id_fkey"
            columns: ["opened_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roll_openings_roll_id_fkey"
            columns: ["roll_id"]
            isOneToOne: true
            referencedRelation: "rolls"
            referencedColumns: ["id"]
          },
        ]
      }
      roll_preinstall_issue_events: {
        Row: {
          action_request_id: string
          actor_profile_id: string
          created_at: string
          event_kind: string
          id: string
          issue_id: string
          reason: string | null
        }
        Insert: {
          action_request_id: string
          actor_profile_id: string
          created_at?: string
          event_kind: string
          id?: string
          issue_id: string
          reason?: string | null
        }
        Update: {
          action_request_id?: string
          actor_profile_id?: string
          created_at?: string
          event_kind?: string
          id?: string
          issue_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roll_preinstall_issue_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roll_preinstall_issue_events_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "roll_preinstall_issues"
            referencedColumns: ["id"]
          },
        ]
      }
      roll_preinstall_issue_evidence: {
        Row: {
          created_at: string
          id: string
          issue_id: string
          mime_type: string
          size_bytes: number
          storage_path: string
          uploaded_by_profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          issue_id: string
          mime_type: string
          size_bytes: number
          storage_path: string
          uploaded_by_profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          issue_id?: string
          mime_type?: string
          size_bytes?: number
          storage_path?: string
          uploaded_by_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roll_preinstall_issue_evidence_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "roll_preinstall_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roll_preinstall_issue_evidence_uploaded_by_profile_id_fkey"
            columns: ["uploaded_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      roll_preinstall_issues: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          reported_by_profile_id: string
          reporting_center_party_id: string
          request_id: string
          resolution_reason: string | null
          resolved_at: string | null
          resolved_by_profile_id: string | null
          roll_id: string
          status: string
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          id: string
          reported_by_profile_id: string
          reporting_center_party_id: string
          request_id: string
          resolution_reason?: string | null
          resolved_at?: string | null
          resolved_by_profile_id?: string | null
          roll_id: string
          status?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          reported_by_profile_id?: string
          reporting_center_party_id?: string
          request_id?: string
          resolution_reason?: string | null
          resolved_at?: string | null
          resolved_by_profile_id?: string | null
          roll_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "roll_preinstall_issues_reported_by_profile_id_fkey"
            columns: ["reported_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roll_preinstall_issues_reporting_center_party_id_fkey"
            columns: ["reporting_center_party_id"]
            isOneToOne: false
            referencedRelation: "operational_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roll_preinstall_issues_resolved_by_profile_id_fkey"
            columns: ["resolved_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roll_preinstall_issues_roll_id_fkey"
            columns: ["roll_id"]
            isOneToOne: false
            referencedRelation: "rolls"
            referencedColumns: ["id"]
          },
        ]
      }
      roll_transfer_events: {
        Row: {
          action_request_id: string | null
          actor_party_id: string | null
          actor_profile_id: string
          affected_roll_count: number | null
          event_sequence: number
          event_type: string
          id: string
          occurred_at: string
          reason: string | null
          transfer_id: string
        }
        Insert: {
          action_request_id?: string | null
          actor_party_id?: string | null
          actor_profile_id: string
          affected_roll_count?: number | null
          event_sequence: number
          event_type: string
          id?: string
          occurred_at?: string
          reason?: string | null
          transfer_id: string
        }
        Update: {
          action_request_id?: string | null
          actor_party_id?: string | null
          actor_profile_id?: string
          affected_roll_count?: number | null
          event_sequence?: number
          event_type?: string
          id?: string
          occurred_at?: string
          reason?: string | null
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roll_transfer_events_actor_party_id_fkey"
            columns: ["actor_party_id"]
            isOneToOne: false
            referencedRelation: "operational_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roll_transfer_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roll_transfer_events_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "roll_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      roll_transfer_item_states: {
        Row: {
          acted_at: string | null
          acted_by_party_id: string | null
          acted_by_profile_id: string | null
          action_request_id: string | null
          created_at: string
          resolution_reason: string | null
          roll_id: string
          status: string
          transfer_id: string
        }
        Insert: {
          acted_at?: string | null
          acted_by_party_id?: string | null
          acted_by_profile_id?: string | null
          action_request_id?: string | null
          created_at?: string
          resolution_reason?: string | null
          roll_id: string
          status: string
          transfer_id: string
        }
        Update: {
          acted_at?: string | null
          acted_by_party_id?: string | null
          acted_by_profile_id?: string | null
          action_request_id?: string | null
          created_at?: string
          resolution_reason?: string | null
          roll_id?: string
          status?: string
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roll_transfer_item_states_acted_by_party_id_fkey"
            columns: ["acted_by_party_id"]
            isOneToOne: false
            referencedRelation: "operational_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roll_transfer_item_states_acted_by_profile_id_fkey"
            columns: ["acted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roll_transfer_item_states_membership_fkey"
            columns: ["transfer_id", "roll_id"]
            isOneToOne: true
            referencedRelation: "roll_transfer_items"
            referencedColumns: ["transfer_id", "roll_id"]
          },
        ]
      }
      roll_transfer_items: {
        Row: {
          created_at: string
          roll_id: string
          transfer_id: string
        }
        Insert: {
          created_at?: string
          roll_id: string
          transfer_id: string
        }
        Update: {
          created_at?: string
          roll_id?: string
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roll_transfer_items_roll_id_fkey"
            columns: ["roll_id"]
            isOneToOne: false
            referencedRelation: "rolls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roll_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "roll_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      roll_transfer_reservations: {
        Row: {
          reserved_at: string
          roll_id: string
          transfer_id: string
        }
        Insert: {
          reserved_at?: string
          roll_id: string
          transfer_id: string
        }
        Update: {
          reserved_at?: string
          roll_id?: string
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roll_transfer_reservations_item_fkey"
            columns: ["transfer_id", "roll_id"]
            isOneToOne: false
            referencedRelation: "roll_transfer_items"
            referencedColumns: ["transfer_id", "roll_id"]
          },
          {
            foreignKeyName: "roll_transfer_reservations_roll_id_fkey"
            columns: ["roll_id"]
            isOneToOne: true
            referencedRelation: "rolls"
            referencedColumns: ["id"]
          },
        ]
      }
      roll_transfers: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by_profile_id: string
          id: string
          recipient_party_id: string
          request_id: string
          roll_count: number
          sender_party_id: string
          status: string
          transfer_kind: string
          transfer_number: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by_profile_id: string
          id?: string
          recipient_party_id: string
          request_id: string
          roll_count: number
          sender_party_id: string
          status: string
          transfer_kind?: string
          transfer_number: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by_profile_id?: string
          id?: string
          recipient_party_id?: string
          request_id?: string
          roll_count?: number
          sender_party_id?: string
          status?: string
          transfer_kind?: string
          transfer_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "roll_transfers_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roll_transfers_recipient_party_id_fkey"
            columns: ["recipient_party_id"]
            isOneToOne: false
            referencedRelation: "operational_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roll_transfers_sender_party_id_fkey"
            columns: ["sender_party_id"]
            isOneToOne: false
            referencedRelation: "operational_parties"
            referencedColumns: ["id"]
          },
        ]
      }
      rolls: {
        Row: {
          created_at: string
          erp_serial: string
          id: string
          product_id: string
          production_lot_id: string
          production_order_id: string
          roll_index: number
          serial_number: string
        }
        Insert: {
          created_at?: string
          erp_serial: string
          id?: string
          product_id: string
          production_lot_id: string
          production_order_id: string
          roll_index: number
          serial_number: string
        }
        Update: {
          created_at?: string
          erp_serial?: string
          id?: string
          product_id?: string
          production_lot_id?: string
          production_order_id?: string
          roll_index?: number
          serial_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolls_lot_order_product_consistency_fkey"
            columns: ["production_lot_id", "production_order_id", "product_id"]
            isOneToOne: false
            referencedRelation: "production_lots"
            referencedColumns: ["id", "production_order_id", "product_id"]
          },
          {
            foreignKeyName: "rolls_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolls_production_lot_id_fkey"
            columns: ["production_lot_id"]
            isOneToOne: false
            referencedRelation: "production_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolls_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      warranties: {
        Row: {
          activated_at: string
          activated_by_profile_id: string
          activating_center_name_snapshot: string
          activating_center_party_id: string
          care_instructions_snapshot: string
          coverage_expires_at: string
          created_at: string
          customer_email: string | null
          customer_name: string
          customer_phone: string
          id: string
          product_code_snapshot: string
          product_id: string
          product_name_snapshot: string
          product_version_snapshot: string | null
          record_state: string
          request_id: string
          roll_id: string
          updated_at: string
          vehicle_color: string | null
          vehicle_make: string
          vehicle_model: string
          vehicle_plate: string | null
          vehicle_vin: string
          vehicle_year: number | null
          void_reason: string | null
          voided_at: string | null
          voided_by_profile_id: string | null
          warranty_coverage_snapshot: string
          warranty_months_snapshot: number
          warranty_number: string
        }
        Insert: {
          activated_at: string
          activated_by_profile_id: string
          activating_center_name_snapshot: string
          activating_center_party_id: string
          care_instructions_snapshot: string
          coverage_expires_at: string
          created_at?: string
          customer_email?: string | null
          customer_name: string
          customer_phone: string
          id?: string
          product_code_snapshot: string
          product_id: string
          product_name_snapshot: string
          product_version_snapshot?: string | null
          record_state?: string
          request_id: string
          roll_id: string
          updated_at?: string
          vehicle_color?: string | null
          vehicle_make: string
          vehicle_model: string
          vehicle_plate?: string | null
          vehicle_vin: string
          vehicle_year?: number | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by_profile_id?: string | null
          warranty_coverage_snapshot: string
          warranty_months_snapshot: number
          warranty_number: string
        }
        Update: {
          activated_at?: string
          activated_by_profile_id?: string
          activating_center_name_snapshot?: string
          activating_center_party_id?: string
          care_instructions_snapshot?: string
          coverage_expires_at?: string
          created_at?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          id?: string
          product_code_snapshot?: string
          product_id?: string
          product_name_snapshot?: string
          product_version_snapshot?: string | null
          record_state?: string
          request_id?: string
          roll_id?: string
          updated_at?: string
          vehicle_color?: string | null
          vehicle_make?: string
          vehicle_model?: string
          vehicle_plate?: string | null
          vehicle_vin?: string
          vehicle_year?: number | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by_profile_id?: string | null
          warranty_coverage_snapshot?: string
          warranty_months_snapshot?: number
          warranty_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "warranties_activated_by_profile_id_fkey"
            columns: ["activated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_activating_center_party_id_fkey"
            columns: ["activating_center_party_id"]
            isOneToOne: false
            referencedRelation: "operational_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_roll_id_fkey"
            columns: ["roll_id"]
            isOneToOne: false
            referencedRelation: "rolls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_voided_by_profile_id_fkey"
            columns: ["voided_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_claim_events: {
        Row: {
          action_request_id: string
          actor_kind: string
          actor_profile_id: string | null
          claim_id: string
          created_at: string
          event_data: Json | null
          event_kind: string
          id: string
          reason: string | null
        }
        Insert: {
          action_request_id: string
          actor_kind: string
          actor_profile_id?: string | null
          claim_id: string
          created_at?: string
          event_data?: Json | null
          event_kind: string
          id?: string
          reason?: string | null
        }
        Update: {
          action_request_id?: string
          actor_kind?: string
          actor_profile_id?: string | null
          claim_id?: string
          created_at?: string
          event_data?: Json | null
          event_kind?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warranty_claim_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_claim_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "warranty_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_claim_evidence: {
        Row: {
          claim_id: string
          created_at: string
          evidence_kind: string
          id: string
          mime_type: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          claim_id: string
          created_at?: string
          evidence_kind?: string
          id?: string
          mime_type: string
          size_bytes: number
          storage_path: string
        }
        Update: {
          claim_id?: string
          created_at?: string
          evidence_kind?: string
          id?: string
          mime_type?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "warranty_claim_evidence_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "warranty_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_claims: {
        Row: {
          affected_area: string
          category: string
          claim_number: string
          closed_at: string | null
          created_at: string
          description: string
          id: string
          request_id: string
          status: string
          submitted_at: string
          updated_at: string
          warranty_id: string
        }
        Insert: {
          affected_area: string
          category: string
          claim_number: string
          closed_at?: string | null
          created_at?: string
          description: string
          id?: string
          request_id: string
          status?: string
          submitted_at: string
          updated_at?: string
          warranty_id: string
        }
        Update: {
          affected_area?: string
          category?: string
          claim_number?: string
          closed_at?: string | null
          created_at?: string
          description?: string
          id?: string
          request_id?: string
          status?: string
          submitted_at?: string
          updated_at?: string
          warranty_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warranty_claims_warranty_id_fkey"
            columns: ["warranty_id"]
            isOneToOne: false
            referencedRelation: "warranties"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_events: {
        Row: {
          action_request_id: string
          actor_profile_id: string
          change_snapshot: Json | null
          created_at: string
          event_kind: string
          id: string
          reason: string | null
          warranty_id: string
        }
        Insert: {
          action_request_id: string
          actor_profile_id: string
          change_snapshot?: Json | null
          created_at?: string
          event_kind: string
          id?: string
          reason?: string | null
          warranty_id: string
        }
        Update: {
          action_request_id?: string
          actor_profile_id?: string
          change_snapshot?: Json | null
          created_at?: string
          event_kind?: string
          id?: string
          reason?: string | null
          warranty_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warranty_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_events_warranty_id_fkey"
            columns: ["warranty_id"]
            isOneToOne: false
            referencedRelation: "warranties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_center_directory: {
        Row: {
          center_name: string | null
          city: string | null
          classification: string | null
          country_code: string | null
          latitude: number | null
          longitude: number | null
        }
        Insert: {
          center_name?: string | null
          city?: string | null
          classification?: never
          country_code?: string | null
          latitude?: number | null
          longitude?: number | null
        }
        Update: {
          center_name?: string | null
          city?: string | null
          classification?: never
          country_code?: string | null
          latitude?: number | null
          longitude?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      activate_roll_warranty: {
        Args: {
          p_customer_email: string
          p_customer_name: string
          p_customer_phone: string
          p_request_id: string
          p_roll_serial: string
          p_vehicle_color: string
          p_vehicle_make: string
          p_vehicle_model: string
          p_vehicle_plate: string
          p_vehicle_vin: string
          p_vehicle_year: number
        }
        Returns: {
          activated_at: string
          activating_center_name: string
          coverage_expires_at: string
          customer_email: string
          customer_name: string
          customer_phone: string
          product_code: string
          product_name: string
          product_version: string
          record_state: string
          vehicle_color: string
          vehicle_make: string
          vehicle_model: string
          vehicle_plate: string
          vehicle_vin: string
          vehicle_year: number
          warranty_id: string
          warranty_number: string
        }[]
      }
      admin_cancel_pending_roll_transfer: {
        Args: { p_reason: string; p_transfer_id: string }
        Returns: string
      }
      admin_release_unreceived_roll_transfer_items: {
        Args: {
          p_reason: string
          p_request_id: string
          p_roll_ids: string[]
          p_transfer_id: string
        }
        Returns: string
      }
      admin_update_center_location: {
        Args: { p_center_id: string; p_latitude: number; p_longitude: number }
        Returns: {
          accuracy_m: number
          captured_at: string
          installation_center_id: string
          latitude: number
          longitude: number
          source: string
        }[]
      }
      approve_center_network: {
        Args: { p_center_id: string; p_expected_location_captured_at: string }
        Returns: {
          approval_status: string
          approved_at: string
          approved_by_profile_id: string
          changed: boolean
          installation_center_id: string
        }[]
      }
      cancel_roll_transfer: { Args: { p_transfer_id: string }; Returns: string }
      claim_notification_push_deliveries: {
        Args: { p_limit?: number }
        Returns: {
          action_path: string
          attempt_number: number
          attention_level: string
          auth_secret: string
          body: string
          claim_expires_at: string
          claim_token: string
          delivery_id: string
          endpoint: string
          notification_id: string
          p256dh: string
          title: string
        }[]
      }
      correct_warranty_details: {
        Args: {
          p_action_request_id: string
          p_customer_email: string
          p_customer_name: string
          p_customer_phone: string
          p_reason: string
          p_vehicle_color: string
          p_vehicle_make: string
          p_vehicle_model: string
          p_vehicle_plate: string
          p_vehicle_vin: string
          p_vehicle_year: number
          p_warranty_id: string
        }
        Returns: string
      }
      create_customer_warranty_claim: {
        Args: {
          p_affected_area: string
          p_category: string
          p_description: string
          p_draft_id: string
          p_evidence: Json
          p_public_code: string
          p_request_id: string
          p_verified_phone_normalized: string
          p_warranty_id: string
        }
        Returns: {
          claim_id: string
          claim_number: string
        }[]
      }
      create_production_order: {
        Args: {
          p_lots: Json
          p_notes?: string
          p_product_id: string
          p_production_date: string
          p_request_id: string
          p_source_reference?: string
        }
        Returns: string
      }
      create_roll_preinstall_issue: {
        Args: {
          p_category: string
          p_description: string
          p_evidence_paths?: string[]
          p_issue_id: string
          p_request_id: string
          p_roll_serial: string
        }
        Returns: string
      }
      create_roll_transfer: {
        Args: {
          p_recipient_transfer_code: string
          p_request_id: string
          p_roll_ids: string[]
        }
        Returns: string
      }
      current_push_subscription_state: {
        Args: { p_endpoint: string }
        Returns: string
      }
      disable_push_subscription: {
        Args: { p_endpoint: string }
        Returns: boolean
      }
      ensure_operational_party: {
        Args: { p_entity_id?: string; p_party_type: string }
        Returns: string
      }
      expand_roll_transfer_receipt_lot: {
        Args: { p_lot_id: string; p_transfer_id: string }
        Returns: {
          lot_id: string
          lot_number: string
          pending_count: number
          pending_roll_ids: string[]
          product_code: string
          product_name: string
          production_lot_total: number
          received_count: number
          released_to_sender_count: number
          transfer_contains_full_lot: boolean
          transfer_count: number
        }[]
      }
      expand_roll_transfer_unresolved_lot: {
        Args: { p_lot_id: string; p_transfer_id: string }
        Returns: {
          lot_id: string
          lot_number: string
          pending_count: number
          pending_roll_ids: string[]
          product_code: string
          product_name: string
          received_count: number
          released_to_sender_count: number
          transfer_count: number
        }[]
      }
      expand_transfer_send_lot: {
        Args: { p_lot_id: string }
        Returns: {
          available_count: number
          available_roll_ids: string[]
          elsewhere_count: number
          held_count: number
          lot_id: string
          lot_number: string
          opened_count: number
          product_code: string
          product_name: string
          reserved_count: number
          total_count: number
        }[]
      }
      generate_operational_transfer_code: {
        Args: { p_party_type: string }
        Returns: string
      }
      get_customer_warranty_claim_by_request: {
        Args: { p_request_id: string; p_warranty_id: string }
        Returns: {
          claim_id: string
          claim_number: string
        }[]
      }
      get_customer_warranty_claim_context: {
        Args: { p_public_code: string; p_warranty_id: string }
        Returns: {
          activated_at: string
          activating_center_name: string
          can_submit_new_claim: boolean
          coverage_expires_at: string
          current_open_claim: Json
          current_phone_normalized: string
          product_name: string
          public_state: string
          recent_closed_claims: Json
          vehicle_make: string
          vehicle_model: string
          vehicle_year: number
          warranty_id: string
          warranty_number: string
        }[]
      }
      get_internal_warranty_audit: {
        Args: { p_warranty_id: string }
        Returns: {
          actor_profile_id: string
          change_snapshot: Json
          created_at: string
          event_id: string
          event_kind: string
          reason: string
        }[]
      }
      get_internal_warranty_detail: {
        Args: { p_warranty_id: string }
        Returns: {
          activated_at: string
          activating_center_name: string
          activating_center_party_id: string
          admin_void_reason: string
          care_instructions: string
          coverage_expires_at: string
          customer_email: string
          customer_name: string
          customer_phone: string
          derived_state: string
          product_code: string
          product_id: string
          product_name: string
          product_version: string
          record_state: string
          roll_id: string
          roll_serial: string
          vehicle_color: string
          vehicle_make: string
          vehicle_model: string
          vehicle_plate: string
          vehicle_vin: string
          vehicle_year: number
          voided_at: string
          warranty_coverage: string
          warranty_id: string
          warranty_months: number
          warranty_number: string
        }[]
      }
      get_roll_preinstall_issue_detail: {
        Args: { p_issue_id: string }
        Returns: {
          category: string
          center_name: string
          created_at: string
          description: string
          issue_id: string
          lot_number: string
          opened_at: string
          product_code: string
          product_name: string
          resolution_reason: string
          resolved_at: string
          resolved_by_name: string
          roll_id: string
          serial_number: string
          status: string
        }[]
      }
      get_roll_transfer_attention_counts: {
        Args: never
        Returns: {
          incoming_action_count: number
          outgoing_action_count: number
        }[]
      }
      get_roll_transfer_detail: {
        Args: { p_transfer_id: string }
        Returns: {
          can_admin_recovery_cancel: boolean
          can_admin_resolve_unreceived: boolean
          can_cancel: boolean
          can_receive: boolean
          can_reject: boolean
          can_resolve_unreceived: boolean
          closed_at: string
          closed_unreceived_count: number
          created_at: string
          lot_groups: Json
          pending_count: number
          received_count: number
          recipient_name: string
          recipient_party_type: string
          released_to_sender_count: number
          roll_count: number
          sender_name: string
          sender_party_type: string
          status: string
          timeline: Json
          transfer_id: string
          transfer_number: string
          viewer_is_admin: boolean
          viewer_is_recipient: boolean
          viewer_is_sender: boolean
        }[]
      }
      list_internal_warranties: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_record_state?: string
          p_search?: string
        }
        Returns: {
          activated_at: string
          activating_center_name: string
          coverage_expires_at: string
          customer_name: string
          derived_state: string
          product_code: string
          product_name: string
          record_state: string
          roll_serial: string
          vehicle_make: string
          vehicle_model: string
          vehicle_vin: string
          warranty_id: string
          warranty_number: string
        }[]
      }
      list_notifications: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          action_path: string
          attention_level: string
          body: string
          created_at: string
          event_type: string
          id: string
          push_eligible: boolean
          read_at: string
          source_domain: string
          source_event_key: string
          title: string
        }[]
      }
      list_roll_preinstall_issues: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          category: string
          center_name: string
          created_at: string
          description: string
          evidence_count: number
          issue_id: string
          lot_number: string
          product_code: string
          product_name: string
          resolution_reason: string
          resolved_at: string
          roll_id: string
          serial_number: string
          status: string
        }[]
      }
      list_roll_transfer_items: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_status?: string
          p_transfer_id: string
        }
        Returns: {
          acted_at: string
          erp_serial: string
          item_status: string
          lot_id: string
          lot_number: string
          product_code: string
          product_name: string
          roll_id: string
          serial_number: string
        }[]
      }
      list_roll_transfers: {
        Args: {
          p_direction?: string
          p_limit?: number
          p_offset?: number
          p_scope?: string
          p_search?: string
        }
        Returns: {
          closed_at: string
          closed_unreceived_count: number
          created_at: string
          matching_count: number
          needs_action: boolean
          pending_count: number
          received_count: number
          recipient_name: string
          recipient_party_type: string
          released_to_sender_count: number
          roll_count: number
          sender_name: string
          sender_party_type: string
          status: string
          transfer_id: string
          transfer_number: string
        }[]
      }
      list_roll_warranty_print_identities: {
        Args: { p_production_order_id: string }
        Returns: {
          public_code: string
          roll_id: string
        }[]
      }
      list_transfer_send_lots: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string }
        Returns: {
          available_count: number
          elsewhere_count: number
          held_count: number
          lot_id: string
          lot_number: string
          opened_count: number
          product_code: string
          product_name: string
          reserved_count: number
          total_count: number
        }[]
      }
      list_transfer_send_rolls: {
        Args: {
          p_limit?: number
          p_lot_id?: string
          p_offset?: number
          p_search?: string
        }
        Returns: {
          availability: string
          erp_serial: string
          lot_id: string
          lot_number: string
          product_code: string
          product_name: string
          roll_id: string
          serial_number: string
        }[]
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: string
      }
      mark_roll_preinstall_issue_reported_in_error: {
        Args: { p_issue_id: string; p_reason: string; p_request_id: string }
        Returns: string
      }
      materialize_center_onboarding_success: {
        Args: { p_invitation_id: string }
        Returns: number
      }
      notification_unread_count: { Args: never; Returns: number }
      open_roll: {
        Args: { p_request_id: string; p_roll_serial: string }
        Returns: string
      }
      receive_roll_transfer_items: {
        Args: {
          p_request_id: string
          p_roll_ids: string[]
          p_transfer_id: string
        }
        Returns: string
      }
      reconcile_roll_transfer_receipt_selection: {
        Args: { p_roll_ids: string[]; p_transfer_id: string }
        Returns: string[]
      }
      record_notification_push_delivery_result: {
        Args: {
          p_claim_token: string
          p_delivery_id: string
          p_error_code?: string
          p_http_status?: number
          p_result: string
        }
        Returns: string
      }
      recover_opened_roll: {
        Args: {
          p_confirm_physical_receipt: boolean
          p_reason: string
          p_request_id: string
          p_roll_serial: string
        }
        Returns: string
      }
      register_push_subscription: {
        Args: { p_auth_secret: string; p_endpoint: string; p_p256dh: string }
        Returns: string
      }
      reject_roll_transfer: { Args: { p_transfer_id: string }; Returns: string }
      release_unreceived_roll_transfer_items: {
        Args: {
          p_reason: string
          p_request_id: string
          p_roll_ids: string[]
          p_transfer_id: string
        }
        Returns: string
      }
      resolve_opened_roll_recovery_candidate: {
        Args: { p_roll_serial: string }
        Returns: {
          current_custodian_name: string
          current_custodian_type: string
          eligibility: string
          lot_number: string
          opened_at: string
          opening_center_name: string
          product_code: string
          product_name: string
          recovery_destination_name: string
          roll_id: string
          serial_number: string
        }[]
      }
      resolve_public_roll_product_slug: {
        Args: { p_serial: string }
        Returns: string
      }
      resolve_public_warranty: {
        Args: { p_public_code: string }
        Returns: {
          activated_at: string
          activating_center_name: string
          coverage_expires_at: string
          product_name: string
          public_state: string
          vehicle_make: string
          vehicle_model: string
          vehicle_year: number
          warranty_number: string
        }[]
      }
      resolve_roll_opening_candidate: {
        Args: { p_roll_serial: string }
        Returns: {
          eligibility: string
          lot_number: string
          opened_at: string
          product_code: string
          product_name: string
          roll_id: string
          serial_number: string
        }[]
      }
      resolve_roll_preinstall_issue: {
        Args: {
          p_issue_id: string
          p_outcome: string
          p_reason: string
          p_request_id: string
        }
        Returns: string
      }
      resolve_roll_preinstall_issue_candidate: {
        Args: { p_roll_serial: string }
        Returns: {
          center_name: string
          eligibility: string
          lot_number: string
          opened_at: string
          product_code: string
          product_name: string
          roll_id: string
          serial_number: string
        }[]
      }
      resolve_transfer_recipient: {
        Args: { p_transfer_code: string }
        Returns: {
          city: string
          country_code: string
          display_name: string
          entity_code: string
          entity_type: string
          party_id: string
        }[]
      }
      resolve_warranty_activation_candidate: {
        Args: { p_roll_serial: string }
        Returns: {
          acting_center_name: string
          acting_center_party_id: string
          blocking_issue_state: string
          eligibility: string
          existing_warranty_id: string
          existing_warranty_number: string
          lot_number: string
          opened_at: string
          product_code: string
          product_name: string
          product_version: string
          roll_id: string
          serial_number: string
          warranty_months: number
        }[]
      }
      revoke_center_network_approval: {
        Args: { p_center_id: string }
        Returns: {
          approval_status: string
          approved_at: string
          approved_by_profile_id: string
          changed: boolean
          installation_center_id: string
        }[]
      }
      set_agent_opened_roll_recovery: {
        Args: { p_agent_id: string; p_enabled: boolean }
        Returns: boolean
      }
      update_own_center_location: {
        Args: { p_accuracy_m: number; p_latitude: number; p_longitude: number }
        Returns: {
          accuracy_m: number
          captured_at: string
          installation_center_id: string
          latitude: number
          longitude: number
          source: string
        }[]
      }
      verify_customer_warranty_claim_phone: {
        Args: { p_phone: string; p_public_code: string }
        Returns: {
          coverage_expires_at: string
          normalized_phone: string
          public_state: string
          warranty_id: string
        }[]
      }
      void_production_order: {
        Args: { p_order_id: string; p_reason: string }
        Returns: string
      }
      void_warranty_in_error: {
        Args: {
          p_action_request_id: string
          p_reason: string
          p_warranty_id: string
        }
        Returns: string
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
