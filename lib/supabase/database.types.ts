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
          status: string
        }
        Insert: {
          code: string
          country_code: string
          created_at?: string
          id?: string
          name: string
          status?: string
        }
        Update: {
          code?: string
          country_code?: string
          created_at?: string
          id?: string
          name?: string
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
        }
        Insert: {
          confirmed_at: string
          custodian_party_id: string
          custody_sequence: number
          id?: string
          recorded_at?: string
          roll_id: string
        }
        Update: {
          confirmed_at?: string
          custodian_party_id?: string
          custody_sequence?: number
          id?: string
          recorded_at?: string
          roll_id?: string
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
      ensure_operational_party: {
        Args: { p_entity_id?: string; p_party_type: string }
        Returns: string
      }
      generate_operational_transfer_code: {
        Args: { p_party_type: string }
        Returns: string
      }
      resolve_public_roll_product_slug: {
        Args: { p_serial: string }
        Returns: string
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
      void_production_order: {
        Args: { p_order_id: string; p_reason: string }
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
