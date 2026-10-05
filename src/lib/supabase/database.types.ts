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
      piece_status_history: {
        Row: {
          actor_id: string | null;
          actor_name: string | null;
          from_status: Database["public"]["Enums"]["piece_status"] | null;
          id: number;
          note: string | null;
          occurred_at: string;
          piece_id: string;
          restoration_id: string;
          to_status: Database["public"]["Enums"]["piece_status"];
          workshop_id: string | null;
        };
        Insert: {
          actor_id?: string | null;
          actor_name?: string | null;
          from_status?: Database["public"]["Enums"]["piece_status"] | null;
          id?: never;
          note?: string | null;
          occurred_at?: string;
          piece_id: string;
          restoration_id: string;
          to_status: Database["public"]["Enums"]["piece_status"];
          workshop_id?: string | null;
        };
        Update: {
          actor_id?: string | null;
          actor_name?: string | null;
          from_status?: Database["public"]["Enums"]["piece_status"] | null;
          id?: never;
          note?: string | null;
          occurred_at?: string;
          piece_id?: string;
          restoration_id?: string;
          to_status?: Database["public"]["Enums"]["piece_status"];
          workshop_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "piece_status_history_piece_id_fkey";
            columns: ["piece_id"];
            isOneToOne: false;
            referencedRelation: "piece_metrics";
            referencedColumns: ["piece_id"];
          },
          {
            foreignKeyName: "piece_status_history_piece_id_fkey";
            columns: ["piece_id"];
            isOneToOne: false;
            referencedRelation: "pieces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "piece_status_history_piece_id_fkey";
            columns: ["piece_id"];
            isOneToOne: false;
            referencedRelation: "pieces_operational";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "piece_status_history_restoration_id_fkey";
            columns: ["restoration_id"];
            isOneToOne: false;
            referencedRelation: "restorations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "piece_status_history_restoration_id_fkey";
            columns: ["restoration_id"];
            isOneToOne: false;
            referencedRelation: "restorations_operational";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "piece_status_history_workshop_id_fkey";
            columns: ["workshop_id"];
            isOneToOne: false;
            referencedRelation: "workshops";
            referencedColumns: ["id"];
          },
        ];
      };
      piece_status_transitions: {
        Row: {
          from_status: Database["public"]["Enums"]["piece_status"];
          requires_note: boolean;
          requires_workshop: boolean;
          roles: Database["public"]["Enums"]["app_role"][];
          to_status: Database["public"]["Enums"]["piece_status"];
        };
        Insert: {
          from_status: Database["public"]["Enums"]["piece_status"];
          requires_note?: boolean;
          requires_workshop?: boolean;
          roles: Database["public"]["Enums"]["app_role"][];
          to_status: Database["public"]["Enums"]["piece_status"];
        };
        Update: {
          from_status?: Database["public"]["Enums"]["piece_status"];
          requires_note?: boolean;
          requires_workshop?: boolean;
          roles?: Database["public"]["Enums"]["app_role"][];
          to_status?: Database["public"]["Enums"]["piece_status"];
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
      quote_items: {
        Row: {
          catalog_price: number | null;
          created_at: string;
          customization: string;
          discount_amount: number | null;
          discount_type: string | null;
          discount_value: number;
          gross: number | null;
          id: string;
          image_url: string | null;
          position: number;
          quantity: number;
          quote_id: string;
          shopify_product_id: string | null;
          shopify_variant_id: string | null;
          sku: string | null;
          title: string;
          total: number | null;
          unit_price: number;
          updated_at: string;
          variant_title: string;
        };
        Insert: {
          catalog_price?: number | null;
          created_at?: string;
          customization?: string;
          discount_amount?: never;
          discount_type?: string | null;
          discount_value?: number;
          gross?: never;
          id?: string;
          image_url?: string | null;
          position?: number;
          quantity: number;
          quote_id: string;
          shopify_product_id?: string | null;
          shopify_variant_id?: string | null;
          sku?: string | null;
          title: string;
          total?: never;
          unit_price: number;
          updated_at?: string;
          variant_title?: string;
        };
        Update: {
          catalog_price?: number | null;
          created_at?: string;
          customization?: string;
          discount_amount?: never;
          discount_type?: string | null;
          discount_value?: number;
          gross?: never;
          id?: string;
          image_url?: string | null;
          position?: number;
          quantity?: number;
          quote_id?: string;
          shopify_product_id?: string | null;
          shopify_variant_id?: string | null;
          sku?: string | null;
          title?: string;
          total?: never;
          unit_price?: number;
          updated_at?: string;
          variant_title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey";
            columns: ["quote_id"];
            isOneToOne: false;
            referencedRelation: "quotes";
            referencedColumns: ["id"];
          },
        ];
      };
      quotes: {
        Row: {
          client_address: string;
          client_document_number: string | null;
          client_document_type:
            Database["public"]["Enums"]["document_type"] | null;
          client_email: string | null;
          client_id: string;
          client_name: string;
          client_phone: string | null;
          code: string | null;
          contact_email: string | null;
          contact_id: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          created_at: string;
          created_by: string | null;
          discount_total: number;
          duplicated_from: string | null;
          id: string;
          issue_date: string | null;
          issued_at: string | null;
          notes: string;
          number: number;
          status: Database["public"]["Enums"]["quote_status"];
          subtotal: number;
          terms: string;
          total: number;
          updated_at: string;
          valid_until: string | null;
          validity_days: number;
          effective_status: string | null;
        };
        Insert: {
          client_address?: string;
          client_document_number?: string | null;
          client_document_type?:
            Database["public"]["Enums"]["document_type"] | null;
          client_email?: string | null;
          client_id: string;
          client_name?: string;
          client_phone?: string | null;
          code?: never;
          contact_email?: string | null;
          contact_id?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          created_by?: string | null;
          discount_total?: number;
          duplicated_from?: string | null;
          id?: string;
          issue_date?: string | null;
          issued_at?: string | null;
          notes?: string;
          number?: never;
          status?: Database["public"]["Enums"]["quote_status"];
          subtotal?: number;
          terms?: string;
          total?: number;
          updated_at?: string;
          valid_until?: never;
          validity_days?: number;
        };
        Update: {
          client_address?: string;
          client_document_number?: string | null;
          client_document_type?:
            Database["public"]["Enums"]["document_type"] | null;
          client_email?: string | null;
          client_id?: string;
          client_name?: string;
          client_phone?: string | null;
          code?: never;
          contact_email?: string | null;
          contact_id?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          created_by?: string | null;
          discount_total?: number;
          duplicated_from?: string | null;
          id?: string;
          issue_date?: string | null;
          issued_at?: string | null;
          notes?: string;
          number?: never;
          status?: Database["public"]["Enums"]["quote_status"];
          subtotal?: number;
          terms?: string;
          total?: number;
          updated_at?: string;
          valid_until?: never;
          validity_days?: number;
        };
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotes_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotes_duplicated_from_fkey";
            columns: ["duplicated_from"];
            isOneToOne: false;
            referencedRelation: "quotes";
            referencedColumns: ["id"];
          },
        ];
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
      piece_metrics: {
        Row: {
          code: string | null;
          fulfillment_days: number | null;
          fulfillment_ongoing: boolean | null;
          piece_id: string | null;
          restoration_id: string | null;
          status: Database["public"]["Enums"]["piece_status"] | null;
          workshop_days: number | null;
          workshop_ongoing: boolean | null;
        };
        Relationships: [
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
        ];
      };
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
      advance_restoration_status: {
        Args: {
          p_current: Database["public"]["Enums"]["restoration_status"];
          p_derived: Database["public"]["Enums"]["restoration_status"];
        };
        Returns: Database["public"]["Enums"]["restoration_status"];
      };
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
      assign_piece_workshop: {
        Args: { p_piece_ids: string[]; p_workshop_id: string };
        Returns: number;
      };
      change_piece_status: {
        Args: {
          p_note?: string;
          p_piece_ids: string[];
          p_to: Database["public"]["Enums"]["piece_status"];
          p_workshop_id?: string;
        };
        Returns: {
          piece_id: string;
          status: Database["public"]["Enums"]["piece_status"];
        }[];
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
      create_restoration: {
        Args: {
          p_client_id: string;
          p_contact_id: string;
          p_deposit_percent: number;
          p_notes: string;
          p_payment_type: Database["public"]["Enums"]["payment_type"];
          p_pieces: Json;
        };
        Returns: {
          code: string;
          id: string;
        }[];
      };
      derive_piece_location: {
        Args: {
          p_arrived_at: string;
          p_status: Database["public"]["Enums"]["piece_status"];
        };
        Returns: Database["public"]["Enums"]["piece_location"];
      };
      derive_restoration_status: {
        Args: { p_pieces: Json };
        Returns: Database["public"]["Enums"]["restoration_status"];
      };
      duplicate_quote: { Args: { p_id: string }; Returns: string };
      effective_status: {
        Args: { q: Database["public"]["Tables"]["quotes"]["Row"] };
        Returns: string;
      };
      fulfillment_days: {
        Args: {
          p_delivered_at: string;
          p_now: string;
          p_registered_at: string;
          p_status: Database["public"]["Enums"]["piece_status"];
        };
        Returns: {
          days: number;
          ongoing: boolean;
        }[];
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
      is_ready_for_shopify_order: {
        Args: { p_pieces: Json };
        Returns: boolean;
      };
      lima_days_between: {
        Args: { p_end: string; p_start: string };
        Returns: number;
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
      mark_pieces_arrived: {
        Args: { p_piece_ids: string[] };
        Returns: {
          piece_id: string;
          status: Database["public"]["Enums"]["piece_status"];
        }[];
      };
      piece_logistics_info: {
        Args: { p_restoration_id: string };
        Returns: {
          last_observation: string;
          piece_id: string;
          workshop_days: number;
          workshop_ongoing: boolean;
        }[];
      };
      save_quote: {
        Args: { p_id: string; p_items: Json; p_quote: Json };
        Returns: string;
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
      workshop_days: {
        Args: { p_history: Json; p_now: string };
        Returns: {
          days: number;
          ongoing: boolean;
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
      quote_status: "borrador" | "emitida" | "aceptada" | "rechazada";
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
      quote_status: ["borrador", "emitida", "aceptada", "rechazada"],
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
