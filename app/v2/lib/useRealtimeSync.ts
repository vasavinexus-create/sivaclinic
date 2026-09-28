"use client";

import { useEffect } from "react";
import { mutate } from "swr";
import { supabase } from "../../../lib/supabase";

/**
 * Enterprise Cache Invalidation Layer
 * Connects via WebSocket to Supabase Realtime.
 * When another user modifies data in the database, this receives a ping
 * and automatically invalidates the local SWR memory caches, forcing a silent background refresh.
 */
export function useRealtimeSync(organizationId?: string | null) {
  useEffect(() => {
    if (!supabase || !organizationId) return;

    // Helper to invalidate all related caches across the app
    const invalidateTableCache = (table: string) => {
      // 1. Invalidate any PagedCrud table lists (e.g. `table:patients:...`)
      mutate(
        (key) => typeof key === "string" && key.startsWith(`table:${table}:`),
        undefined, // Undefined data means "drop cache and re-fetch"
        { revalidate: true }
      );
      
      // 2. Invalidate any generic dropdown SWR caches from useClinicData.ts
      mutate(`${table}:${organizationId}`);
    };

    const channel = supabase.channel(`realtime-org-${organizationId}`)
      // Medicines / Inventory
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => invalidateTableCache("products"))
      .on("postgres_changes", { event: "*", schema: "public", table: "medicine_batches" }, () => invalidateTableCache("medicine_batches"))
      // Users / Roles
      .on("postgres_changes", { event: "*", schema: "public", table: "patients" }, () => invalidateTableCache("patients"))
      .on("postgres_changes", { event: "*", schema: "public", table: "doctors" }, () => invalidateTableCache("doctors"))
      .on("postgres_changes", { event: "*", schema: "public", table: "suppliers" }, () => invalidateTableCache("suppliers"))
      // Transactions
      .on("postgres_changes", { event: "*", schema: "public", table: "consultations" }, () => invalidateTableCache("consultations"))
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, () => invalidateTableCache("sales"))
      .on("postgres_changes", { event: "*", schema: "public", table: "purchases" }, () => invalidateTableCache("purchases"))
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  }, [organizationId]);
}
