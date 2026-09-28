"use client";

import useSWR from "swr";
import { supabase } from "../../../lib/supabase";
import { Doctor, Product, Supplier } from "./types";
import { readAll } from "../../../lib/read-all";

export function useClinicDoctors(organizationId?: string | null) {
  return useSWR(
    organizationId ? `doctors:${organizationId}` : null,
    async () => {
      const data = await readAll(() => 
        supabase!.from("doctors").select("*").eq("organization_id", organizationId).eq("active", true).order("name")
      );
      return data as Doctor[];
    },
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );
}

export function useClinicSuppliers(organizationId?: string | null) {
  return useSWR(
    organizationId ? `suppliers:${organizationId}` : null,
    async () => {
      const data = await readAll(() => 
        supabase!.from("suppliers").select("*").eq("organization_id", organizationId).order("name")
      );
      return data as Supplier[];
    },
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );
}

export function useClinicProducts(organizationId?: string | null) {
  return useSWR(
    organizationId ? `products:${organizationId}` : null,
    async () => {
      const data = await readAll(() => 
        supabase!.from("products").select("*").eq("organization_id", organizationId).eq("active", true).order("name")
      );
      return data as Product[];
    },
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );
}
