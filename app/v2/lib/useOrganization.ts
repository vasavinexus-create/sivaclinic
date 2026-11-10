"use client";

import useSWR from "swr";
import { supabase } from "../../../lib/supabase";
import { getBillingDiscountConfig, getBillingPrintConfig, parseSalesGstMode, Organization, Profile } from "./types";

export function useOrganization(organizationId?: string | null) {
  return useSWR(
    organizationId ? `org:${organizationId}` : null,
    async () => {
      const { data, error } = await supabase!
        .from("organizations")
        .select("*")
        .eq("id", organizationId)
        .single();
      if (error) throw error;
      const printCfg = getBillingPrintConfig(organizationId, data as Organization);
      const discountCfg = getBillingDiscountConfig(organizationId, data as Organization);
      const { mode } = parseSalesGstMode(data?.sales_gst_mode);
      return {
        ...(data as Organization),
        sales_gst_mode: mode,
        min_discount_medicine_value: discountCfg.minDiscountValue,
        ...printCfg,
      } as Organization;
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
