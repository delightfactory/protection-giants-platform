import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabasePublicClient } from "@/lib/supabase/public";

export type PublicCenterDirectoryRow = {
  center_name: string | null;
  city: string | null;
  country_code: string | null;
  latitude: number | null;
  longitude: number | null;
  classification: string | null;
};

type PublicCenterDirectoryDatabase = {
  public: {
    Tables: Record<never, never>;
    Views: {
      public_center_directory: {
        Row: PublicCenterDirectoryRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

export function createPublicCenterDirectoryClient(): SupabaseClient<PublicCenterDirectoryDatabase> {
  return createSupabasePublicClient() as unknown as SupabaseClient<PublicCenterDirectoryDatabase>;
}
