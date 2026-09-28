"use client";

import useSWR from "swr";
import { supabase } from "../../../lib/supabase";
import { Organization, Profile } from "./types";

export function useOrganization(organizationId?: string | null) {
  return useSWR(
    organizationId ? `org:${organizationId}` : null,
    async () => {
      const { data, error } = await supabase!
        .from("organizations")
        .select("id,clinic_name,pharmacy_name,sales_gst_mode,sales_discount_percent")
        .eq("id", organizationId)
        .single();
      if (error) throw error;
      return data as Organization;
    },
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );
}

export function useProfile(userId?: string | null) {
  return useSWR(
    userId ? `profile:${userId}` : null,
    async () => {
      const { data, error } = await supabase!
        .from("profiles")
        .select("id,organization_id,full_name,role,active")
        .eq("id", userId)
        .single();
      if (error) throw error;
      return data as Profile;
    },
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );
}
