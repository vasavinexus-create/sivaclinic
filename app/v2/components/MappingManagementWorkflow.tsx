"use client";

import { useEffect, useState } from "react";
import { Search, Trash2, Edit2, ShieldCheck, RefreshCw } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { Profile, Row } from "../lib/types";

export function MappingManagementWorkflow({ profile, notify }: { profile: Profile; notify: (message: string) => void }) {
  const [mappings, setMappings] = useState<Row[]>([]);
  const [suppliers, setSuppliers] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const loadData = async () => {
    if (!supabase) return;
    setLoading(true);
    const [mapRes, supRes] = await Promise.all([
      supabase
        .from("supplier_product_mappings")
        .select("*,supplier:suppliers(name),product:products(name,product_id,manufacturer)")
        .eq("organization_id", profile.organization_id)
        .order("last_used_at", { ascending: false }),
      supabase.from("suppliers").select("id,name").eq("organization_id", profile.organization_id).order("name")
    ]);

    setMappings(mapRes.data || []);
    setSuppliers(supRes.data || []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [profile.organization_id]);

  const deleteMapping = async (id: string, description: string) => {
    if (!supabase) return;
    if (!window.confirm(`Delete confirmed mapping for "${description}"? Future imports will require mapping again.`)) return;

    const { error } = await supabase.from("supplier_product_mappings").delete().eq("id", id);
    if (error) {
      notify(error.message);
    } else {
      notify(`Mapping deleted for "${description}"`);
      loadData();
    }
  };

  const filtered = mappings.filter((m) => {
    if (selectedSupplierId && m.supplier_id !== selectedSupplierId) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.supplier_description?.toLowerCase().includes(q) ||
      m.product?.name?.toLowerCase().includes(q) ||
      m.supplier?.name?.toLowerCase().includes(q) ||
      m.supplier_product_code?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Supplier Product Mappings</h1>
          <p>Dictionary of human-confirmed supplier descriptions mapped to internal products.</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="v2-toolbar">
        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search supplier description, product, or code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="v2-filter">
          <span>Supplier Filter</span>
          <select value={selectedSupplierId} onChange={(e) => setSelectedSupplierId(e.target.value)}>
            <option value="">All Suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <button className="secondary" onClick={loadData}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Mappings Table */}
      <div className="panel">
        {loading ? (
          <div className="loading-panel">Loading supplier product mappings...</div>
        ) : filtered.length > 0 ? (
          <div className="data-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Supplier Invoice Description</th>
                  <th>Internal Product</th>
                  <th>Manufacturer / Pack</th>
                  <th>Times Used</th>
                  <th>Last Used</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.supplier?.name || "Unknown Supplier"}</strong>
                    </td>
                    <td>
                      <strong>{row.supplier_description}</strong>
                      {row.supplier_product_code && (
                        <div style={{ fontSize: "11px", color: "var(--muted)" }}>Code: {row.supplier_product_code}</div>
                      )}
                    </td>
                    <td>
                      <strong>{row.product?.name || "Unmapped"}</strong>
                      <div style={{ fontSize: "11px", color: "var(--muted)" }}>ID: {row.product?.product_id || row.product_id}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: "12px" }}>
                        {row.supplier_manufacturer || row.product?.manufacturer || "-"} | Pack: {row.supplier_pack || "-"}
                      </div>
                    </td>
                    <td>{row.times_used || 1}</td>
                    <td>{row.last_used_at ? new Date(row.last_used_at).toLocaleDateString() : "-"}</td>
                    <td>
                      <button
                        className="table-edit danger-btn"
                        title="Delete Mapping"
                        onClick={() => deleteMapping(row.id, row.supplier_description)}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h3>No supplier product mappings found.</h3>
            <p>Confirmed product mappings from purchase bill imports will be saved here automatically.</p>
          </div>
        )}
      </div>
    </div>
  );
}
