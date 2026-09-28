"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { supabase } from "../../../lib/supabase";
import { ModuleConfig, Row } from "./types";
import { businessDate } from "../../../lib/reporting.mjs";
import { readAll } from "../../../lib/read-all";

type QueryArgs = {
  module: ModuleConfig;
  page: number;
  pageSize: number;
  search: string;
  filters: Record<string, string>;
  organizationId?: string;
};

function escapeSearch(value: string) {
  return value.replace(/[,*()]/g, " ").trim().replace(/\s+/g, " ");
}

async function relatedSearchMatches(moduleKey: string, term: string) {
  if (!supabase || !term) return { patientIds: [], doctorIds: [], saleIds: [] } as { patientIds: string[]; doctorIds: string[]; saleIds: string[] };
  const client = supabase;
  const like = `%${term}%`;
  const searchIds = async (table: string, columns: string[]) => {
    const results = await Promise.all(columns.map((column) => client.from(table).select("id").ilike(column, like).limit(100)));
    return Array.from(new Set(results.flatMap((result) => (result.data || []).map((row: any) => row.id))));
  };
  const matches = { patientIds: [] as string[], doctorIds: [] as string[], saleIds: [] as string[] };

  if (["consultation", "patient-history", "doctor-fees-pending", "follow-up-alerts"].includes(moduleKey)) {
    const [patientIds, doctorIds] = await Promise.all([
      searchIds("patients", ["patient_id", "name", "mobile"]),
      searchIds("doctors", ["doctor_id", "name", "mobile", "specialization"]),
    ]);
    matches.patientIds = patientIds;
    matches.doctorIds = doctorIds;
  }

  if (["billing", "sales", "medicine-sales", "sales-account", "profit-loss", "reports", "inpatient-billing", "rate-edit-verification"].includes(moduleKey)) {
    const [patientIds, productIds] = await Promise.all([
      searchIds("patients", ["patient_id", "name", "mobile"]),
      searchIds("products", ["product_id", "name", "barcode", "generic_name"]),
    ]);
    matches.patientIds = patientIds;

    if (productIds.length) {
      const saleItems = await client.from("sale_items").select("sale_id").in("product_id", productIds).limit(500);
      matches.saleIds = Array.from(new Set((saleItems.data || []).map((row: any) => row.sale_id).filter(Boolean)));
    }
  }

  return matches;
}

export function usePagedQuery({ module, page, pageSize, search, filters, organizationId }: QueryArgs) {
  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);
  
  // Cache key includes module.table so we can easily invalidate by table name later
  const cacheKey = organizationId 
    ? `table:${module.table}:${module.key}:${page}:${pageSize}:${search}:${filterKey}:${organizationId}` 
    : null;

  const { data, error, mutate, isValidating } = useSWR(
    cacheKey,
    async () => {
      if (!supabase) throw new Error("Supabase not initialized");
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let query = supabase.from(module.table).select(module.select, { count: "exact" });

      const organizationColumn = module.organizationColumn === null ? null : module.organizationColumn || "organization_id";
      if (organizationId && organizationColumn) query = query.eq(organizationColumn, organizationId);

      if (module.key === "expiry-alerts") {
        query = query.gt("current_stock", 0).lte("expiry_date", businessDate(new Date(Date.now() + 90 * 86400000).toISOString()));
      }
      if (module.key === "low-stock") {
        const client = supabase;
        const products = await readAll(() => client.from("products").select("id,minimum_stock").eq("organization_id", organizationId!).order("id"));
        const thresholds = new Map<number, string[]>();
        products.forEach(p => {
          const minimum = Math.max(0, Number(p.minimum_stock || 0));
          thresholds.set(minimum, [...(thresholds.get(minimum) || []), p.id]);
        });
        if (!thresholds.size) return { rows: [], count: 0 };
        query = query.or([...thresholds].map(([minimum, ids]) => `and(product_id.in.(${ids.join(",")}),current_stock.lte.${minimum})`).join(","));
      }

      const trimmed = search.trim();
      if (trimmed) {
        const clean = escapeSearch(trimmed);
        const related = await relatedSearchMatches(module.key, clean);
        if (related.saleIds.length) {
          query = query.in("id", related.saleIds);
        } else if (related.patientIds.length) {
          query = query.in("patient_id", related.patientIds);
        } else if (related.doctorIds.length) {
          query = query.in("doctor_id", related.doctorIds);
        } else {
          const term = `*${clean}*`;
          query = query.or(module.searchColumns.map((column) => `${column}.ilike.${term}`).join(","));
        }
      }

      Object.entries(filters).forEach(([key, value]) => {
        if (value) query = query.eq(key, value === "true" ? true : value === "false" ? false : value);
      });

      query = query
        .order(module.orderBy, { ascending: module.ascending ?? false })
        .range(from, to);

      const { data: resultData, count: total, error: queryError } = await query;
      if (queryError) throw queryError;

      return { rows: (resultData || []) as Row[], count: total || 0 };
    },
    { 
      keepPreviousData: true,
      revalidateOnFocus: false,
      dedupingInterval: 10000 // Cache table queries for 10 seconds to make pagination/tabs instant
    }
  );

  return { 
    rows: data?.rows || [], 
    count: data?.count || 0, 
    loading: isValidating && !data, 
    error: error?.message || "", 
    reload: () => mutate() 
  };
}
