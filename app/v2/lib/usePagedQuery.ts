"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { ModuleConfig, Row } from "./types";

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

async function fallbackJoinedSearch(module: ModuleConfig, term: string, page: number, pageSize: number) {
  if (!supabase || !term) return null;
  const needle = term.toLowerCase();
  const from = (page - 1) * pageSize;
  const to = from + pageSize;
  const isConsultation = ["consultation", "patient-history", "doctor-fees-pending", "follow-up-alerts"].includes(module.key);
  const isSale = ["billing", "sales", "medicine-sales", "sales-account", "profit-loss", "reports", "inpatient-billing", "rate-edit-verification"].includes(module.key);
  if (!isConsultation && !isSale) return null;

  const select = isConsultation
    ? module.select
    : `${module.select}${module.select.includes("sale_items(") ? "" : ",sale_items(product:products(product_id,name,barcode,generic_name))"}`;
  const { data, error } = await supabase
    .from(module.table)
    .select(select)
    .order(module.orderBy, { ascending: module.ascending ?? false })
    .limit(1000);
  if (error) return null;
  const rows = (data || []).filter((row: any) => JSON.stringify(row).toLowerCase().includes(needle));
  return { rows: rows.slice(from, to), count: rows.length };
}

export function usePagedQuery({ module, page, pageSize, search, filters, organizationId }: QueryArgs) {
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = supabase
      .from(module.table)
      .select(module.select, { count: "exact" });

    const organizationColumn = module.organizationColumn ?? null;
    if (organizationId && organizationColumn) query = query.eq(organizationColumn, organizationId);

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

    const { data, count: total, error: queryError } = await query;
    let nextRows = data || [];
    let nextCount = total || 0;
    if (!queryError && trimmed && nextRows.length === 0) {
      const fallback = await fallbackJoinedSearch(module, trimmed, page, pageSize);
      if (fallback && fallback.rows.length) {
        nextRows = fallback.rows;
        nextCount = fallback.count;
      }
    }
    setRows(nextRows);
    setCount(nextCount);
    setError(queryError?.message || "");
    setLoading(false);
  }, [module, page, pageSize, search, filterKey, organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  return { rows, count, loading, error, reload: load };
}
