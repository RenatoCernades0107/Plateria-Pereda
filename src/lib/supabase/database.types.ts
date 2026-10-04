export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_name: string | null;
          changes: NonNullable<Json>;
          id: number;
          occurred_at: string;
          record_id: string;
          table_name: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_name?: string | null;
          changes?: NonNullable<Json>;
          id?: never;
          occurred_at?: string;
          record_id: string;
          table_name: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_name?: string | null;
          changes?: NonNullable<Json>;
          id?: never;
          occurred_at?: string;
          record_id?: string;
          table_name?: string;
        };
        Relationships: [];
      };
      clients: {
        Row: {
          active: boolean;
          address: string;
          city: string;
          created_at: string;
          created_by: string | null;
          display_name: string | null;
          document_number: string | null;
          document_type: Database["public"]["Enums"]["document_type"] | null;
          email: string | null;
          first_name: string;
          id: string;
          kind: Database["public"]["Enums"]["client_kind"];
          last_name: string;
          legal_name: string;
          notes: string;
          phone: string | null;
          region: string | null;
          shopify_company_id: string | null;
          shopify_company_location_id: string | null;
          shopify_customer_id: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          address?: string;
          city?: string;
          created_at?: string;
          created_by?: string | null;
          display_name?: never;
          document_number?: string | null;
          document_type?: Database["public"]["Enums"]["document_type"] | null;
          email?: string | null;
          first_name?: string;
          id?: string;
          kind: Database["public"]["Enums"]["client_kind"];
          last_name?: string;
          legal_name?: string;
          notes?: string;
          phone?: string | null;
          region?: string | null;
          shopify_company_id?: string | null;
          shopify_company_location_id?: string | null;
          shopify_customer_id?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          address?: string;
          city?: string;
          created_at?: string;
          created_by?: string | null;
          display_name?: never;
          document_number?: string | null;
          document_type?: Database["public"]["Enums"]["document_type"] | null;
          email?: string | null;
          first_name?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["client_kind"];
          last_name?: string;
          legal_name?: string;
          notes?: string;
          phone?: string | null;
          region?: string | null;
          shopify_company_id?: string | null;
          shopify_company_location_id?: string | null;
          shopify_customer_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clients_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      contacts: {
        Row: {
          active: boolean;
          client_id: string;
          created_at: string;
          created_by: string | null;
          display_name: string | null;
          document_number: string | null;
          document_type: Database["public"]["Enums"]["document_type"] | null;
          email: string | null;
          first_name: string;
          id: string;
          last_name: string;
          phone: string | null;
          position: string;
          shopify_company_contact_id: string | null;
          shopify_customer_id: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          display_name?: never;
          document_number?: string | null;
          document_type?: Database["public"]["Enums"]["document_type"] | null;
          email?: string | null;
          first_name: string;
          id?: string;
          last_name?: string;
          phone?: string | null;
          position?: string;
          shopify_company_contact_id?: string | null;
          shopify_customer_id?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          display_name?: never;
          document_number?: string | null;
          document_type?: Database["public"]["Enums"]["document_type"] | null;
          email?: string | null;
          first_name?: string;
          id?: string;
          last_name?: string;
          phone?: string | null;
          position?: string;
          shopify_company_contact_id?: string | null;
          shopify_customer_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contacts_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contacts_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      materials: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      payment_methods: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      pieces: {
        Row: {
          approved_at: string | null;
          arrived_at: string | null;
          cancelled_at: string | null;
          code: string;
          created_at: string;
          created_by: string | null;
          delivered_at: string | null;
          description: string;
          first_sent_at: string | null;
          id: string;
          last_returned_at: string | null;
          location: Database["public"]["Enums"]["piece_location"] | null;
          material_id: string | null;
          material_name: string;
          measure: string;
          notes: string;
          number: number;
          price: number;
          received_at: string | null;
          restoration_id: string;
          service_id: string | null;
          service_name: string;
          shopify_line_item_id: string | null;
          status: Database["public"]["Enums"]["piece_status"];
          updated_at: string;
          weight_grams: number | null;
          workshop_id: string | null;
        };
        Insert: {
          approved_at?: string | null;
          arrived_at?: string | null;
          cancelled_at?: string | null;
          code: string;
          created_at?: string;
          created_by?: string | null;
          delivered_at?: string | null;
          description: string;
          first_sent_at?: string | null;
          id?: string;
          last_returned_at?: string | null;
          location?: never;
          material_id?: string | null;
          material_name?: string;
          measure?: string;
          notes?: string;
          number: number;
          price: number;
          received_at?: string | null;
          restoration_id: string;
          service_id?: string | null;
          service_name?: string;
          shopify_line_item_id?: string | null;
          status?: Database["public"]["Enums"]["piece_status"];
          updated_at?: string;
          weight_grams?: number | null;
          workshop_id?: string | null;
        };
        Update: {
          approved_at?: string | null;
          arrived_at?: string | null;
          cancelled_at?: string | null;
          code?: string;
          created_at?: string;
          created_by?: string | null;
          delivered_at?: string | null;
          description?: string;
          first_sent_at?: string | null;
          id?: string;
          last_returned_at?: string | null;
          location?: never;
          material_id?: string | null;
          material_name?: string;
          measure?: string;
          notes?: string;
          number?: number;
          price?: number;
          received_at?: string | null;
          restoration_id?: string;
          service_id?: string | null;
          service_name?: string;
          shopify_line_item_id?: string | null;
          status?: Database["public"]["Enums"]["piece_status"];
          updated_at?: string;
          weight_grams?: number | null;
          workshop_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pieces_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pieces_material_id_fkey";
            columns: ["material_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pieces_restoration_id_fkey";
            columns: ["restoration_id"];
            isOneToOne: false;
            referencedRelation: "restorations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pieces_restoration_id_fkey";
            columns: ["restoration_id"];
            isOneToOne: false;
            referencedRelation: "restorations_operational";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pieces_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pieces_workshop_id_fkey";
            columns: ["workshop_id"];
            isOneToOne: false;
            referencedRelation: "workshops";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          active: boolean;
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          email?: string | null;
          full_name: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
        };
        Relationships: [];
      };
      restorations: {
        Row: {
          balance: number | null;
          client_id: string;
          code: string;
          contact_id: string | null;
          created_at: string;
          created_by: string | null;
          deposit_percent: number | null;
          expected_deposit: number | null;
          id: string;
          notes: string;
          paid: number;
          payment_status: Database["public"]["Enums"]["payment_status"];
          payment_type: Database["public"]["Enums"]["payment_type"];
          shopify_order_id: string | null;
          shopify_order_name: string | null;
          status: Database["public"]["Enums"]["restoration_status"];
          total: number;
          updated_at: string;
        };
        Insert: {
          balance?: never;
          client_id: string;
          code?: string;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          deposit_percent?: number | null;
          expected_deposit?: never;
          id?: string;
          notes?: string;
          paid?: number;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          payment_type: Database["public"]["Enums"]["payment_type"];
          shopify_order_id?: string | null;
          shopify_order_name?: string | null;
          status?: Database["public"]["Enums"]["restoration_status"];
          total?: number;
          updated_at?: string;
        };
        Update: {
          balance?: never;
          client_id?: string;
          code?: string;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          deposit_percent?: number | null;
          expected_deposit?: never;
          id?: string;
          notes?: string;
          paid?: number;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          payment_type?: Database["public"]["Enums"]["payment_type"];
          shopify_order_id?: string | null;
          shopify_order_name?: string | null;
          status?: Database["public"]["Enums"]["restoration_status"];
          total?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "restorations_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "restorations_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "restorations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          name: string;
          suggested_price: number | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name: string;
          suggested_price?: number | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name?: string;
          suggested_price?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          address: string;
          created_at: string;
          deposit_percent: number;
          email: string;
          id: boolean;
          legal_name: string;
          logo_path: string | null;
          phones: string;
          quote_validity_days: number;
          ruc: string | null;
          terms: string;
          updated_at: string;
          whatsapp_template: string | null;
        };
        Insert: {
          address?: string;
          created_at?: string;
          deposit_percent?: number;
          email?: string;
          id?: boolean;
          legal_name?: string;
          logo_path?: string | null;
          phones?: string;
          quote_validity_days?: number;
          ruc?: string | null;
          terms?: string;
          updated_at?: string;
          whatsapp_template?: string | null;
        };
        Update: {
          address?: string;
          created_at?: string;
          deposit_percent?: number;
          email?: string;
          id?: boolean;
          legal_name?: string;
          logo_path?: string | null;
          phones?: string;
          quote_validity_days?: number;
          ruc?: string | null;
          terms?: string;
          updated_at?: string;
          whatsapp_template?: string | null;
        };
        Relationships: [];
      };
      shopify_sync_jobs: {
        Row: {
          attempts: number;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          entity_id: string;
          entity_table: string;
          id: number;
          idempotency_key: string | null;
          kind: string;
          last_error: string | null;
          locked_at: string | null;
          max_attempts: number;
          next_attempt_at: string;
          payload: NonNullable<Json>;
          result: Json | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          entity_id: string;
          entity_table: string;
          id?: never;
          idempotency_key?: string | null;
          kind: string;
          last_error?: string | null;
          locked_at?: string | null;
          max_attempts?: number;
          next_attempt_at?: string;
          payload?: NonNullable<Json>;
          result?: Json | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          entity_id?: string;
          entity_table?: string;
          id?: never;
          idempotency_key?: string | null;
          kind?: string;
          last_error?: string | null;
          locked_at?: string | null;
          max_attempts?: number;
          next_attempt_at?: string;
          payload?: NonNullable<Json>;
          result?: Json | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      shopify_tokens: {
        Row: {
          access_token: string;
          expires_at: string;
          shop_domain: string;
          updated_at: string;
        };
        Insert: {
          access_token: string;
          expires_at: string;
          shop_domain: string;
          updated_at?: string;
        };
        Update: {
          access_token?: string;
          expires_at?: string;
          shop_domain?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      shopify_webhook_events: {
        Row: {
          api_version: string | null;
          error: string | null;
          id: number;
          payload: NonNullable<Json>;
          processed_at: string | null;
          received_at: string;
          shop_domain: string;
          status: string;
          topic: string;
          webhook_id: string;
        };
        Insert: {
          api_version?: string | null;
          error?: string | null;
          id?: never;
          payload: NonNullable<Json>;
          processed_at?: string | null;
          received_at?: string;
          shop_domain: string;
          status?: string;
          topic: string;
          webhook_id: string;
        };
        Update: {
          api_version?: string | null;
          error?: string | null;
          id?: never;
          payload?: NonNullable<Json>;
          processed_at?: string | null;
          received_at?: string;
          shop_domain?: string;
          status?: string;
          topic?: string;
          webhook_id?: string;
        };
        Relationships: [];
      };
      workshops: {
        Row: {
          active: boolean;
          address: string;
          contact_name: string;
          created_at: string;
          id: string;
          name: string;
          notes: string;
          phone: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          address?: string;
          contact_name?: string;
          created_at?: string;
          id?: string;
          name: string;
          notes?: string;
          phone?: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          address?: string;
          contact_name?: string;
          created_at?: string;
          id?: string;
          name?: string;
          notes?: string;
          phone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      pieces_operational: {
        Row: {
          approved_at: string | null;
          arrived_at: string | null;
          cancelled_at: string | null;
          code: string | null;
          created_at: string | null;
          delivered_at: string | null;
          description: string | null;
          first_sent_at: string | null;
          id: string | null;
          last_returned_at: string | null;
          location: Database["public"]["Enums"]["piece_location"] | null;
          material_id: string | null;
          material_name: string | null;
          measure: string | null;
          notes: string | null;
          number: number | null;
          received_at: string | null;
          restoration_id: string | null;
          service_id: string | null;
          service_name: string | null;
          status: Database["public"]["Enums"]["piece_status"] | null;
          updated_at: string | null;
          weight_grams: number | null;
          workshop_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pieces_material_id_fkey";
            columns: ["material_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pieces_restoration_id_fkey";
            columns: ["restoration_id"];
            isOneToOne: false;
            referencedRelation: "restorations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pieces_restoration_id_fkey";
            columns: ["restoration_id"];
            isOneToOne: false;
            referencedRelation: "restorations_operational";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pieces_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pieces_workshop_id_fkey";
            columns: ["workshop_id"];
            isOneToOne: false;
            referencedRelation: "workshops";
            referencedColumns: ["id"];
          },
        ];
      };
      restorations_operational: {
        Row: {
          client_id: string | null;
          code: string | null;
          contact_id: string | null;
          created_at: string | null;
          created_by: string | null;
          id: string | null;
          notes: string | null;
          payment_type: Database["public"]["Enums"]["payment_type"] | null;
          shopify_order_name: string | null;
          status: Database["public"]["Enums"]["restoration_status"] | null;
          updated_at: string | null;
        };
        Insert: {
          client_id?: string | null;
          code?: string | null;
          contact_id?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          id?: string | null;
          notes?: string | null;
          payment_type?: Database["public"]["Enums"]["payment_type"] | null;
          shopify_order_name?: string | null;
          status?: Database["public"]["Enums"]["restoration_status"] | null;
          updated_at?: string | null;
        };
        Update: {
          client_id?: string | null;
          code?: string | null;
          contact_id?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          id?: string | null;
          notes?: string | null;
          payment_type?: Database["public"]["Enums"]["payment_type"] | null;
          shopify_order_name?: string | null;
          status?: Database["public"]["Enums"]["restoration_status"] | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "restorations_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "restorations_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "restorations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      apply_shopify_customer_update: {
        Args: {
          p_customer_id: string;
          p_email: string;
          p_first_name: string;
          p_last_name: string;
          p_phone: string;
        };
        Returns: number;
      };
      claim_shopify_jobs: {
        Args: { p_limit?: number; p_lock_timeout?: string };
        Returns: {
          attempts: number;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          entity_id: string;
          entity_table: string;
          id: number;
          idempotency_key: string | null;
          kind: string;
          last_error: string | null;
          locked_at: string | null;
          max_attempts: number;
          next_attempt_at: string;
          payload: NonNullable<Json>;
          result: Json | null;
          status: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "shopify_sync_jobs";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      import_shopify_customer: {
        Args: {
          p_customer_id: string;
          p_email: string;
          p_fallback_name: string;
          p_first_name: string;
          p_last_name: string;
          p_note: string;
          p_phone: string;
        };
        Returns: string;
      };
      list_clients: {
        Args: {
          p_active?: boolean;
          p_kind?: Database["public"]["Enums"]["client_kind"];
          p_limit?: number;
          p_offset?: number;
          p_query?: string;
          p_sync?: string;
        };
        Returns: {
          active: boolean;
          display_name: string;
          document_number: string;
          document_type: Database["public"]["Enums"]["document_type"];
          email: string;
          id: string;
          job_id: number;
          kind: Database["public"]["Enums"]["client_kind"];
          last_error: string;
          phone: string;
          sync_status: string;
          total_count: number;
        }[];
      };
      shopify_sync_status: {
        Args: { p_entity_ids: string[]; p_entity_table: string };
        Returns: {
          entity_id: string;
          job_id: number;
          last_error: string;
          status: string;
        }[];
      };
    };
    Enums: {
      app_role: "admin" | "ventas" | "logistica";
      client_kind: "persona" | "empresa";
      document_type: "dni" | "ce" | "pasaporte" | "ruc";
      payment_status: "pendiente" | "parcial" | "pagado" | "reembolsado";
      payment_type: "contado" | "a_cuenta" | "credito";
      piece_location:
        "por_recibir" | "en_tienda" | "en_taller" | "entregada" | "anulada";
      piece_status:
        | "registrada"
        | "en_consulta"
        | "en_espera"
        | "aprobada"
        | "recibida"
        | "enviada_taller"
        | "devuelta_taller"
        | "observada"
        | "entregada"
        | "anulada";
      restoration_status:
        | "registrada"
        | "aprobada"
        | "en_proceso"
        | "parcialmente_lista"
        | "lista"
        | "completada"
        | "anulada";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

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
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
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
      app_role: ["admin", "ventas", "logistica"],
      client_kind: ["persona", "empresa"],
      document_type: ["dni", "ce", "pasaporte", "ruc"],
      payment_status: ["pendiente", "parcial", "pagado", "reembolsado"],
      payment_type: ["contado", "a_cuenta", "credito"],
      piece_location: [
        "por_recibir",
        "en_tienda",
        "en_taller",
        "entregada",
        "anulada",
      ],
      piece_status: [
        "registrada",
        "en_consulta",
        "en_espera",
        "aprobada",
        "recibida",
        "enviada_taller",
        "devuelta_taller",
        "observada",
        "entregada",
        "anulada",
      ],
      restoration_status: [
        "registrada",
        "aprobada",
        "en_proceso",
        "parcialmente_lista",
        "lista",
        "completada",
        "anulada",
      ],
    },
  },
} as const;
