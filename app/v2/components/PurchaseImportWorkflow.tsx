"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, FileText, Key, LoaderCircle,
  PackagePlus, Plus, Search, ShieldAlert, Sparkles, Upload, X
} from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { money } from "../lib/format";
import { normalizeDescription, scoreProductSuggestion } from "../lib/normalization";
import { postJournal } from "../lib/accounting";
import { Profile, Row } from "../lib/types";
import { Field } from "./controls";

export interface StagingItem {
  id?: string;
  line_no: number;
  supplier_description: string;
  normalized_description: string;
  product_code?: string;
  barcode?: string;
  manufacturer?: string;
  pack?: string;
  unit?: string;
  hsn?: string;
  batch_no: string;
  expiry_month?: number;
  expiry_year?: number;
  expiry_date: string;
  quantity: number;
  free_quantity: number;
  purchase_unit: string;
  sale_unit: string;
  units_per_purchase_unit: number;
  rate: number;
  purchase_rate_per_unit: number;
  mrp: number;
  selling_rate: number;
  discount_percent: number;
  discount_amount: number;
  gst_percent: number;
  line_total: number;
  mapped_product_id: string | null;
  mapped_product?: Row | null;
  mapping_source: "saved_mapping" | "exact_barcode" | "suggested" | "manual" | "new_product" | "unmapped";
  mapping_status: "auto_mapped" | "suggested" | "manual" | "new_product" | "unmapped";
  suggestion_score?: number;
  suggestions?: { product: Row; score: number }[];
  requires_review: boolean;
  review_reason?: string;
}

export function PurchaseImportWorkflow({ profile, notify }: { profile: Profile; notify: (message: string) => void }) {
  // Workflow step state
  const [step, setStep] = useState<"upload" | "extracting" | "review" | "approved">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState("");

  // API Key modal prompt state
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [userGeminiKey, setUserGeminiKey] = useState("");
  const [apiKeyError, setApiKeyError] = useState("");
  const [pendingBase64, setPendingBase64] = useState<{ base64: string; mimeType: string } | null>(null);

  // Extracted Invoice & Staging Header
  const [supplierId, setSupplierId] = useState("");
  const [suppliers, setSuppliers] = useState<Row[]>([]);
  const [productsMaster, setProductsMaster] = useState<Row[]>([]);
  const [savedMappings, setSavedMappings] = useState<Row[]>([]);

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [printedTotal, setPrintedTotal] = useState<number>(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // Staging items & filters
  const [items, setItems] = useState<StagingItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<"all" | "unmapped" | "suggested" | "auto_mapped" | "warnings">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal states
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [showCreateProductModal, setShowCreateProductModal] = useState(false);
  const [newProductForm, setNewProductForm] = useState<Partial<Row>>({});

  const [savingApproval, setSavingApproval] = useState(false);

  // Load suppliers and product master
  const loadMasterData = async () => {
    if (!supabase) return;
    const [supRes, prodRes] = await Promise.all([
      supabase.from("suppliers").select("*").eq("organization_id", profile.organization_id).order("name"),
      supabase.from("products").select("*").eq("organization_id", profile.organization_id).eq("active", true).order("name")
    ]);
    setSuppliers(supRes.data || []);
    setProductsMaster(prodRes.data || []);
  };

  useEffect(() => { loadMasterData(); }, [profile.organization_id]);

  // Load saved description mappings when supplier changes
  useEffect(() => {
    if (!supabase || !supplierId) {
      setSavedMappings([]);
      return;
    }
    supabase
      .from("supplier_product_mappings")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .eq("supplier_id", supplierId)
      .then(({ data }) => setSavedMappings(data || []));
  }, [supplierId, profile.organization_id]);

  // Check duplicate invoice
  useEffect(() => {
    if (!supabase || !supplierId || !invoiceNumber) {
      setDuplicateWarning(null);
      return;
    }
    supabase
      .from("purchases")
      .select("purchase_no,supplier_invoice_no,invoice_date")
      .eq("organization_id", profile.organization_id)
      .eq("supplier_id", supplierId)
      .eq("supplier_invoice_no", invoiceNumber)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setDuplicateWarning(`Possible duplicate invoice: ${data[0].purchase_no} with invoice #${data[0].supplier_invoice_no} on ${data[0].invoice_date} already exists.`);
        } else {
          setDuplicateWarning(null);
        }
      });
  }, [supplierId, invoiceNumber, profile.organization_id]);

  // Execute extraction API call
  const callExtractionApi = async (base64Content: string, mimeType: string, customApiKey?: string) => {
    setUploadProgress("Analyzing invoice structure with Gemini AI...");

    const payload = {
      file_base64: base64Content,
      mime_type: mimeType,
      organization_id: profile.organization_id,
      user_api_key: customApiKey || userGeminiKey || undefined
    };

    let responseOk = false;
    let resData: any = {};

    if (supabase) {
      const { data, error } = await supabase.functions.invoke("extract-purchase-bill", { body: payload });
      if (!error && data) {
        responseOk = true;
        resData = data;
      } else if (error) {
        resData = { error: error.message };
      }
    }

    if (!responseOk) {
      const response = await fetch("/api/extract-purchase-bill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      responseOk = response.ok;
      const responseText = await response.text();
      try {
        resData = responseText ? JSON.parse(responseText) : {};
      } catch {
        resData = {
          error: response.status === 504
            ? "The invoice extraction timed out on the server. Try uploading a smaller/clearer single-page bill image or PDF."
            : `Server returned a non-JSON error (${response.status}). Please try again.`
        };
      }
    }

    if (!responseOk || !resData.success) {
      const errMsg = resData.error || "Failed to extract invoice via Gemini API";
      setPendingBase64({ base64: base64Content, mimeType });
      setApiKeyError(errMsg);
      setShowApiKeyModal(true);
      setStep("upload");
      notify(errMsg);
      return;
    }

    setApiKeyError("");
    const ext = resData.extraction;
    setUploadProgress("Mapping products & calculating invoice totals...");

    // Auto-identify Supplier by GSTIN
    if (ext.supplier?.gstin) {
      const matchedSup = suppliers.find(
        (s) => s.gst_number && s.gst_number.trim().toLowerCase() === ext.supplier.gstin.trim().toLowerCase()
      );
      if (matchedSup) setSupplierId(matchedSup.id);
    }

    if (ext.invoice?.invoice_number) setInvoiceNumber(ext.invoice.invoice_number);
    if (ext.invoice?.invoice_date) setInvoiceDate(ext.invoice.invoice_date);
    if (ext.totals?.grand_total) setPrintedTotal(Number(ext.totals.grand_total));
    if (ext.validation?.warnings) setWarnings(ext.validation.warnings);

    // Process Extracted Items
    const extractedRawItems = ext.items || [];
    const processedStagingItems: StagingItem[] = extractedRawItems.map((raw: any, index: number) => {
      const desc = raw.description || raw.product_name || `Item ${index + 1}`;
      const normDesc = normalizeDescription(desc);
      const qty = Number(raw.quantity || 0);
      const freeQty = Number(raw.free_quantity || 0);
      const rate = Number(raw.purchase_rate || raw.rate || 0);
      const mrp = Number(raw.mrp || rate);
      const discountPct = Number(raw.discount_percent || 0);
      const discountAmt = Number(raw.discount_amount || 0);
      const gstPct = Number(raw.gst_percent || 0);
      const lineTotal = Number(raw.line_total || ((qty * rate - discountAmt) * (1 + gstPct / 100)));

      let expDate = "";
      const expM = raw.expiry_month ? String(raw.expiry_month).padStart(2, "0") : "12";
      const expY = raw.expiry_year ? (String(raw.expiry_year).length === 2 ? `20${raw.expiry_year}` : raw.expiry_year) : "2028";
      expDate = `${expY}-${expM}-28`;

      return {
        line_no: raw.line_no || index + 1,
        supplier_description: desc,
        normalized_description: normDesc,
        product_code: raw.product_code || null,
        barcode: raw.barcode || null,
        manufacturer: raw.manufacturer || null,
        pack: raw.pack || null,
        unit: raw.unit || null,
        hsn: raw.hsn || null,
        batch_no: raw.batch_no || `BAT-${Date.now().toString().slice(-4)}-${index + 1}`,
        expiry_month: raw.expiry_month || null,
        expiry_year: raw.expiry_year || null,
        expiry_date: expDate,
        quantity: qty,
        free_quantity: freeQty,
        purchase_unit: raw.purchase_unit || raw.unit || "unit",
        sale_unit: raw.sale_unit || "unit",
        units_per_purchase_unit: 1,
        rate: rate,
        purchase_rate_per_unit: rate,
        mrp: mrp,
        selling_rate: mrp,
        discount_percent: discountPct,
        discount_amount: discountAmt,
        gst_percent: gstPct,
        line_total: lineTotal,
        mapped_product_id: null,
        mapped_product: null,
        mapping_source: "unmapped",
        mapping_status: "unmapped",
        requires_review: false
      };
    });

    runProductMapping(processedStagingItems, savedMappings, productsMaster);
    setStep("review");
  };

  // Handle File Upload and AI Extraction
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    const validTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
    if (!validTypes.includes(selectedFile.type)) {
      notify("Please upload a valid PDF, JPG, or PNG invoice file.");
      return;
    }

    setFile(selectedFile);
    setStep("extracting");
    setUploadProgress("Uploading file to secure storage...");

    try {
      // 1. Safe Upload to Supabase Storage if image file
      if (supabase && selectedFile.type.startsWith("image/")) {
        try {
          const filePath = `invoices/${profile.organization_id}/${Date.now()}_${selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
          await supabase.storage
            .from("prescription_attachments")
            .upload(filePath, selectedFile, { upsert: true });
        } catch {
          // Best-effort attachment backup; extraction still uses the local file payload.
        }
      }
      // 2. Convert file to Base64 for Gemini API Route
      const reader = new FileReader();
      reader.readAsDataURL(selectedFile);
      reader.onload = async () => {
        const base64Content = (reader.result as string).split(",")[1];
        await callExtractionApi(base64Content, selectedFile.type);
      };
    } catch (err: any) {
      setStep("upload");
      notify(err.message || "Failed to process uploaded file");
    }
  };

  // Handle saving user API key and retrying extraction
  const handleSaveApiKeyAndRetry = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const keyFromForm = String(formData.get("user_gemini_key") || "").trim();

    if (!keyFromForm) {
      notify("Please enter a valid Gemini API Key.");
      return;
    }

    setUserGeminiKey(keyFromForm);
    setShowApiKeyModal(false);

    if (pendingBase64) {
      setStep("extracting");
      await callExtractionApi(pendingBase64.base64, pendingBase64.mimeType, keyFromForm);
    }
  };

  // Product Mapping Engine
  const runProductMapping = (currentItems: StagingItem[], mappings: Row[], master: Row[]) => {
    const updated = currentItems.map((item) => {
      // Priority 1: Exact saved supplier mapping
      const exactSaved = mappings.find((m) => m.normalized_description === item.normalized_description);
      if (exactSaved) {
        const prod = master.find((p) => p.id === exactSaved.product_id);
        if (prod) {
          return {
            ...item,
            purchase_unit: prod.purchase_unit || item.purchase_unit || "unit",
            sale_unit: prod.sale_unit || item.sale_unit || "unit",
            units_per_purchase_unit: Number(prod.default_units_per_purchase_unit || item.units_per_purchase_unit || 1) || 1,
            purchase_rate_per_unit: Number(item.rate || 0) / (Number(prod.default_units_per_purchase_unit || item.units_per_purchase_unit || 1) || 1),
            selling_rate: Number(item.selling_rate || prod.selling_rate || prod.mrp || item.mrp || 0),
            mapped_product_id: prod.id,
            mapped_product: prod,
            mapping_source: "saved_mapping" as const,
            mapping_status: "auto_mapped" as const,
            suggestion_score: 100
          };
        }
      }

      // Priority 2: Exact Barcode match
      if (item.barcode) {
        const prodByBarcode = master.find((p) => p.barcode && p.barcode.trim() === item.barcode?.trim());
        if (prodByBarcode) {
          return {
            ...item,
            purchase_unit: prodByBarcode.purchase_unit || item.purchase_unit || "unit",
            sale_unit: prodByBarcode.sale_unit || item.sale_unit || "unit",
            units_per_purchase_unit: Number(prodByBarcode.default_units_per_purchase_unit || item.units_per_purchase_unit || 1) || 1,
            purchase_rate_per_unit: Number(item.rate || 0) / (Number(prodByBarcode.default_units_per_purchase_unit || item.units_per_purchase_unit || 1) || 1),
            selling_rate: Number(item.selling_rate || prodByBarcode.selling_rate || prodByBarcode.mrp || item.mrp || 0),
            mapped_product_id: prodByBarcode.id,
            mapped_product: prodByBarcode,
            mapping_source: "exact_barcode" as const,
            mapping_status: "auto_mapped" as const,
            suggestion_score: 98
          };
        }
      }

      // Priority 3: Candidate Product Suggestions
      const scoredCandidates = master
        .map((prod) => ({
          product: prod,
          score: scoreProductSuggestion(item, prod)
        }))
        .filter((c) => c.score > 25)
        .sort((a, b) => b.score - a.score);

      if (scoredCandidates.length > 0 && scoredCandidates[0].score >= 45) {
        return {
          ...item,
          mapped_product_id: null,
          mapped_product: null,
          mapping_source: "suggested" as const,
          mapping_status: "suggested" as const,
          suggestion_score: scoredCandidates[0].score,
          suggestions: scoredCandidates.slice(0, 5)
        };
      }

      return {
        ...item,
        mapped_product_id: null,
        mapped_product: null,
        mapping_source: "unmapped" as const,
        mapping_status: "unmapped" as const,
        suggestions: scoredCandidates.slice(0, 5)
      };
    });

    setItems(updated);
  };

  // Re-run mapping when supplier or master data updates
  useEffect(() => {
    if (items.length > 0) {
      runProductMapping(items, savedMappings, productsMaster);
    }
  }, [savedMappings, productsMaster]);

  // Bulk action: Accept Selected Suggestions
  const acceptAllSuggestions = () => {
    let acceptedCount = 0;
    const updated = items.map((item) => {
      if (item.mapping_status === "suggested" && item.suggestions && item.suggestions.length > 0) {
        acceptedCount++;
        const topProd = item.suggestions[0].product;
        const unitsPerPurchaseUnit = Number(topProd.default_units_per_purchase_unit || item.units_per_purchase_unit || 1) || 1;
        return {
          ...item,
          purchase_unit: topProd.purchase_unit || item.purchase_unit || "unit",
          sale_unit: topProd.sale_unit || item.sale_unit || "unit",
          units_per_purchase_unit: unitsPerPurchaseUnit,
          purchase_rate_per_unit: Number(item.rate || 0) / unitsPerPurchaseUnit,
          selling_rate: Number(item.selling_rate || topProd.selling_rate || topProd.mrp || item.mrp || 0),
          mapped_product_id: topProd.id,
          mapped_product: topProd,
          mapping_source: "suggested" as const,
          mapping_status: "manual" as const
        };
      }
      return item;
    });
    setItems(updated);
    notify(`Accepted ${acceptedCount} suggested product mappings`);
  };

  // Select Product for a line item manually
  const handleSelectProduct = (index: number, product: Row) => {
    setItems((rows) => {
      const copy = [...rows];
      const unitsPerPurchaseUnit = Number(product.default_units_per_purchase_unit || copy[index].units_per_purchase_unit || 1) || 1;
      copy[index] = {
        ...copy[index],
        purchase_unit: product.purchase_unit || copy[index].purchase_unit || "unit",
        sale_unit: product.sale_unit || copy[index].sale_unit || "unit",
        units_per_purchase_unit: unitsPerPurchaseUnit,
        purchase_rate_per_unit: Number(copy[index].rate || 0) / unitsPerPurchaseUnit,
        selling_rate: Number(copy[index].selling_rate || product.selling_rate || product.mrp || copy[index].mrp || 0),
        mapped_product_id: product.id,
        mapped_product: product,
        mapping_source: "manual",
        mapping_status: "manual"
      };
      return copy;
    });
    setEditingItemIndex(null);
  };

  // Create New Product inline
  const handleCreateNewProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || editingItemIndex === null) return;
    const currentItem = items[editingItemIndex];

    const prodCode = `PRD-${Date.now().toString().slice(-6)}`;
    const newProdPayload = {
      organization_id: profile.organization_id,
      product_id: prodCode,
      name: newProductForm.name || currentItem.supplier_description,
      manufacturer: newProductForm.manufacturer || currentItem.manufacturer || null,
      pack_size: newProductForm.pack_size || currentItem.pack || null,
      hsn_code: newProductForm.hsn_code || currentItem.hsn || null,
      sale_unit: currentItem.sale_unit || "unit",
      purchase_unit: currentItem.purchase_unit || currentItem.unit || "unit",
      default_units_per_purchase_unit: Number(currentItem.units_per_purchase_unit || 1),
      mrp: Number(newProductForm.mrp || currentItem.mrp || 0),
      purchase_rate: Number(newProductForm.purchase_rate || currentItem.rate || 0),
      selling_rate: Number(newProductForm.mrp || currentItem.mrp || 0),
      gst_percent: Number(newProductForm.gst_percent || currentItem.gst_percent || 0),
      active: true
    };

    const { data: createdProd, error } = await supabase
      .from("products")
      .insert(newProdPayload)
      .select("*")
      .single();

    if (error || !createdProd) {
      notify(error?.message || "Failed to create new product");
      return;
    }

    notify(`Created product "${createdProd.name}"`);
    setProductsMaster((prev) => [...prev, createdProd]);
    handleSelectProduct(editingItemIndex, createdProd);
    setShowCreateProductModal(false);
  };

  // Item Metrics & Counts
  const counts = useMemo(() => {
    const total = items.length;
    const autoMapped = items.filter((i) => i.mapping_status === "auto_mapped").length;
    const suggested = items.filter((i) => i.mapping_status === "suggested").length;
    const manual = items.filter((i) => i.mapping_status === "manual" || i.mapping_status === "new_product").length;
    const unmapped = items.filter((i) => i.mapping_status === "unmapped" && !i.mapped_product_id).length;
    const warningsCount = warnings.length + (duplicateWarning ? 1 : 0);

    return { total, autoMapped, suggested, manual, unmapped, warningsCount };
  }, [items, warnings, duplicateWarning]);

  // Filtered List
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const queryMatch =
        !searchQuery ||
        item.supplier_description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.mapped_product?.name && item.mapped_product.name.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!queryMatch) return false;

      if (activeFilter === "unmapped") return item.mapping_status === "unmapped" && !item.mapped_product_id;
      if (activeFilter === "suggested") return item.mapping_status === "suggested";
      if (activeFilter === "auto_mapped") return item.mapping_status === "auto_mapped" || item.mapping_status === "manual";
      if (activeFilter === "warnings") return item.requires_review || item.quantity <= 0 || item.rate <= 0;

      return true;
    });
  }, [items, activeFilter, searchQuery]);

  // Calculate Grand Total from items
  const calculatedGrandTotal = items.reduce((sum, item) => sum + Number(item.line_total || 0), 0);

  // APPROVAL & FINAL POSTING
  const handleApprovePurchase = async () => {
    if (!supplierId) {
      notify("Please select a supplier for this purchase.");
      return;
    }
    const unmappedItems = items.filter((i) => !i.mapped_product_id);
    if (unmappedItems.length > 0) {
      notify(`Cannot approve: ${unmappedItems.length} items remain unmapped. Please map all products first.`);
      return;
    }

    if (!supabase) return;
    setSavingApproval(true);

    try {
      const purchaseNo = `VP-AI-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

      // 1. Create Purchase Header
      const { data: purchase, error: purchaseErr } = await supabase
        .from("purchases")
        .insert({
          organization_id: profile.organization_id,
          purchase_no: purchaseNo,
          supplier_id: supplierId,
          supplier_invoice_no: invoiceNumber || purchaseNo,
          invoice_date: invoiceDate,
          subtotal: calculatedGrandTotal,
          tax_total: 0,
          invoice_total: calculatedGrandTotal,
          amount_paid: 0,
          status: "completed",
          created_by: profile.id
        })
        .select("id")
        .single();

      if (purchaseErr || !purchase) {
        setSavingApproval(false);
        notify(purchaseErr?.message || "Failed to create purchase record");
        return;
      }

      // 2. Loop through items & create Medicine Batches, Purchase Items, Stock Movements
      for (const item of items) {
        const unitsPerPurchaseUnit = Number(item.units_per_purchase_unit || 1) || 1;
        const purchasePackQty = Number(item.quantity || 0);
        const freePackQty = Number(item.free_quantity || 0);
        const totalStockQty = (purchasePackQty + freePackQty) * unitsPerPurchaseUnit;
        const freeStockQty = freePackQty * unitsPerPurchaseUnit;
        const purchaseRatePerUnit = Number(item.rate || 0) / unitsPerPurchaseUnit;

        const { data: batch, error: batchErr } = await supabase
          .from("medicine_batches")
          .insert({
            organization_id: profile.organization_id,
            product_id: item.mapped_product_id!,
            batch_number: item.batch_no,
            expiry_date: item.expiry_date,
            supplier_id: supplierId,
            purchase_id: purchase.id,
            quantity_received: totalStockQty,
            free_quantity: freeStockQty,
            current_stock: totalStockQty,
            purchase_rate: purchaseRatePerUnit,
            mrp: item.mrp,
            selling_rate: item.selling_rate || item.mrp,
            gst_percent: item.gst_percent,
            purchase_unit: item.purchase_unit || "unit",
            sale_unit: item.sale_unit || "unit",
            units_per_purchase_unit: unitsPerPurchaseUnit,
            purchase_pack_qty: purchasePackQty,
            free_pack_qty: freePackQty,
            stock_unit_qty: totalStockQty
          })
          .select("id")
          .single();

        if (batchErr || !batch) {
          throw new Error(`Batch save failed for ${item.supplier_description}: ${batchErr?.message || "No batch returned"}`);
        }

        const { error: itemErr } = await supabase.from("purchase_items").insert({
          organization_id: profile.organization_id,
          purchase_id: purchase.id,
          product_id: item.mapped_product_id!,
          batch_id: batch.id,
          quantity: totalStockQty,
          free_quantity: 0,
          rate: purchaseRatePerUnit,
          gst_percent: item.gst_percent,
          discount: item.discount_amount,
          line_total: item.line_total,
          purchase_unit: item.purchase_unit || "unit",
          sale_unit: item.sale_unit || "unit",
          units_per_purchase_unit: unitsPerPurchaseUnit,
          purchase_pack_qty: purchasePackQty,
          free_pack_qty: freePackQty,
          stock_unit_qty: totalStockQty,
          purchase_rate_per_unit: purchaseRatePerUnit
        });

        if (itemErr) {
          throw new Error(`Purchase item save failed for ${item.supplier_description}: ${itemErr.message}`);
        }

        const { error: stockErr } = await supabase.from("stock_movements").insert({
          organization_id: profile.organization_id,
          product_id: item.mapped_product_id!,
          batch_id: batch.id,
          movement_type: "purchase",
          reference_type: "purchase",
          reference_id: purchase.id,
          reference_number: purchaseNo,
          in_quantity: totalStockQty,
          balance_quantity: totalStockQty,
          created_by: profile.id
        });

        if (stockErr) {
          throw new Error(`Stock movement failed for ${item.supplier_description}: ${stockErr.message}`);
        }

        // 3. Save / Upsert Confirmed Description -> Product Mappings
        if (item.supplier_description && item.mapped_product_id) {
          await supabase.from("supplier_product_mappings").upsert(
            {
              organization_id: profile.organization_id,
              supplier_id: supplierId,
              product_id: item.mapped_product_id,
              supplier_description: item.supplier_description,
              normalized_description: item.normalized_description,
              supplier_product_code: item.product_code || null,
              supplier_manufacturer: item.manufacturer || null,
              supplier_pack: item.pack || null,
              supplier_hsn: item.hsn || null,
              last_used_at: new Date().toISOString(),
              created_by: profile.id,
              mapping_status: "confirmed"
            },
            { onConflict: "organization_id,supplier_id,normalized_description" }
          );
        }
      }

      // 4. Supplier Ledger & Accounting Journal
      await supabase.from("supplier_ledger").insert({
        organization_id: profile.organization_id,
        supplier_id: supplierId,
        occurred_on: invoiceDate,
        particulars: `AI Purchase bill ${purchaseNo} (Invoice #${invoiceNumber})`,
        reference_type: "purchase",
        reference_id: purchase.id,
        reference_number: purchaseNo,
        debit: calculatedGrandTotal,
        credit: 0,
        created_by: profile.id
      });

      try {
        await postJournal(profile, {
          voucherType: "purchase",
          entryDate: invoiceDate,
          referenceType: "purchase",
          referenceId: purchase.id,
          referenceNumber: purchaseNo,
          narration: `AI Purchase bill ${purchaseNo}`,
          lines: [
            { ledger: "Purchase", debit: calculatedGrandTotal },
            { ledger: "Supplier Payable", credit: calculatedGrandTotal }
          ]
        });
      } catch {}

      setSavingApproval(false);
      setStep("approved");
      notify(`Successfully approved & created purchase ${purchaseNo}`);
    } catch (err: any) {
      setSavingApproval(false);
      notify(err.message || "Failed to approve purchase");
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>AI Purchase Bill Import</h1>
          <p>Automated invoice extraction, product auto-mapping, and inventory receiving via Gemini API.</p>
        </div>
      </div>

      {/* STEP 1: FILE UPLOAD */}
      {step === "upload" && (
        <div className="panel">
          <div className="v2-pending" style={{ textAlign: "center", alignItems: "center", padding: "40px 20px" }}>
            <Upload size={48} className="text-green" />
            <h2>Upload Purchase Invoice</h2>
            <p>
              Support for single/multi-page PDF, JPG, or PNG files. Gemini AI will extract invoice totals, batch info, and item lines securely.
            </p>

            <label className="primary" style={{ cursor: "pointer", marginTop: "16px" }}>
              <FileText size={18} /> Select Bill File (PDF / JPG / PNG)
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileUpload} style={{ display: "none" }} />
            </label>
          </div>
        </div>
      )}

      {/* STEP 2: EXTRACTING PROGRESS */}
      {step === "extracting" && (
        <div className="panel">
          <div className="v2-pending" style={{ textAlign: "center", alignItems: "center", padding: "60px 20px" }}>
            <LoaderCircle size={44} className="spin text-green" />
            <h2>Processing Invoice...</h2>
            <p style={{ fontWeight: 600, color: "var(--text)" }}>{uploadProgress}</p>
            <p style={{ fontSize: "12px" }}>
              File: {file?.name} ({(file?.size ? file.size / 1024 : 0).toFixed(1)} KB)
            </p>
          </div>
        </div>
      )}

      {/* STEP 3: REVIEW & MAP ITEMS */}
      {step === "review" && (
        <div>
          {/* Duplicate / Sanity Warning Alerts */}
          {duplicateWarning && (
            <div className="alert-warning" style={{ background: "#fff3cd", border: "1px solid #ffeeba", padding: "12px 16px", borderRadius: "8px", marginBottom: "16px", color: "#856404", display: "flex", gap: "10px", alignItems: "center" }}>
              <ShieldAlert size={20} />
              <strong>{duplicateWarning}</strong>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="alert-warning" style={{ background: "#e2e3e5", border: "1px solid #d6d8db", padding: "12px 16px", borderRadius: "8px", marginBottom: "16px", color: "#383d41" }}>
              <strong>⚠ Invoice Validation Notices ({warnings.length}):</strong>
              <ul style={{ margin: "6px 0 0 20px", padding: 0 }}>
                {warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Staging Invoice Header Panel */}
          <div className="panel" style={{ marginBottom: "16px" }}>
            <div className="form-grid">
              <label className="field">
                <span>Supplier <b>*</b></span>
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">-- Select Supplier --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.gst_number ? `(GST: ${s.gst_number})` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <Field name="invoice_number" label="Invoice Number" value={invoiceNumber} onChange={(e: any) => setInvoiceNumber(e.target.value)} required />
              <Field name="invoice_date" label="Invoice Date" type="date" value={invoiceDate} onChange={(e: any) => setInvoiceDate(e.target.value)} required />
              <Field name="printed_total" label="Extracted Total" value={printedTotal ? money(printedTotal) : "-"} readOnly />
            </div>
          </div>

          {/* Status Metrics Bar */}
          <div className="summary-strip" style={{ marginBottom: "16px" }}>
            <div className="summary-card">
              <span>Total Extracted Items</span>
              <strong>{counts.total}</strong>
            </div>
            <div className="summary-card" style={{ borderColor: "#22c55e" }}>
              <span>Auto Mapped</span>
              <strong style={{ color: "#16a34a" }}>✓ {counts.autoMapped + counts.manual}</strong>
            </div>
            <div className="summary-card" style={{ borderColor: "#eab308" }}>
              <span>Suggested Matches</span>
              <strong style={{ color: "#ca8a04" }}>? {counts.suggested}</strong>
            </div>
            <div className="summary-card" style={{ borderColor: "#ef4444" }}>
              <span>Unmapped Items</span>
              <strong style={{ color: "#dc2626" }}>⚠ {counts.unmapped}</strong>
            </div>
          </div>

          {/* Review Toolbar & Filters */}
          <div className="v2-toolbar">
            <div className="search-box">
              <Search size={16} />
              <input type="text" placeholder="Search extracted item description or product..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>

            <div className="tab-row" style={{ margin: 0 }}>
              <button className={activeFilter === "all" ? "active" : ""} onClick={() => setActiveFilter("all")}>All ({counts.total})</button>
              <button className={activeFilter === "unmapped" ? "active" : ""} onClick={() => setActiveFilter("unmapped")}>Unmapped ({counts.unmapped})</button>
              <button className={activeFilter === "suggested" ? "active" : ""} onClick={() => setActiveFilter("suggested")}>Suggested ({counts.suggested})</button>
              <button className={activeFilter === "auto_mapped" ? "active" : ""} onClick={() => setActiveFilter("auto_mapped")}>Mapped ({counts.autoMapped + counts.manual})</button>
            </div>

            {counts.suggested > 0 && (
              <button className="secondary" onClick={acceptAllSuggestions}>
                <Sparkles size={16} /> Accept Suggestions ({counts.suggested})
              </button>
            )}
          </div>

          {/* Staging Items Table */}
          <div className="panel">
            <div className="data-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Supplier Description</th>
                    <th>Mfg / Pack / HSN</th>
                    <th>Batch & Expiry</th>
                    <th>Qty + Free</th>
                    <th>Rate</th>
                    <th>MRP</th>
                    <th>GST %</th>
                    <th>Line Total</th>
                    <th>Mapped Product Master</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, idx) => {
                    const originalIndex = items.findIndex((i) => i === item);

                    return (
                      <tr key={idx} style={{ background: !item.mapped_product_id ? "#fef2f2" : undefined }}>
                        <td>{item.line_no}</td>
                        <td>
                          <strong>{item.supplier_description}</strong>
                          {item.product_code && <div style={{ fontSize: "11px", color: "var(--muted)" }}>Code: {item.product_code}</div>}
                        </td>
                        <td>
                          <div style={{ fontSize: "11px" }}>
                            {item.manufacturer || "-"} | {item.pack || "-"} | HSN: {item.hsn || "-"}
                          </div>
                        </td>
                        <td>
                          <strong>{item.batch_no}</strong>
                          <div style={{ fontSize: "11px", color: "var(--muted)" }}>Exp: {item.expiry_date}</div>
                        </td>
                        <td>
                          {item.quantity} {item.free_quantity > 0 ? `+ ${item.free_quantity} free` : ""}
                        </td>
                        <td>{money(item.rate)}</td>
                        <td>{money(item.mrp)}</td>
                        <td>{item.gst_percent}%</td>
                        <td><strong>{money(item.line_total)}</strong></td>

                        {/* Mapped Product Selector Cell */}
                        <td style={{ minWidth: "220px" }}>
                          {item.mapped_product ? (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                              <div style={{ fontSize: "12px" }}>
                                <strong>{item.mapped_product.name}</strong>
                                <div style={{ fontSize: "10px", color: "var(--muted)" }}>Code: {item.mapped_product.product_id}</div>
                              </div>
                              <button className="secondary" style={{ padding: "4px 8px", fontSize: "10px" }} onClick={() => setEditingItemIndex(originalIndex)}>
                                Change
                              </button>
                            </div>
                          ) : (
                            <div>
                              <button className="primary" style={{ padding: "6px 10px", fontSize: "11px" }} onClick={() => { setEditingItemIndex(originalIndex); setProductSearchQuery(item.supplier_description); }}>
                                Select Product
                              </button>
                              {item.suggestions && item.suggestions.length > 0 && (
                                <div style={{ fontSize: "10px", color: "#ca8a04", marginTop: "4px" }}>
                                  Top Suggestion: {item.suggestions[0].product.name} ({item.suggestions[0].score}%)
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Mapping Status Badge */}
                        <td>
                          {item.mapping_status === "auto_mapped" && <span className="badge success">✓ Saved Mapping</span>}
                          {item.mapping_status === "suggested" && <span className="badge warning">? Suggested</span>}
                          {item.mapping_status === "manual" && <span className="badge info">✓ Manual</span>}
                          {item.mapping_status === "new_product" && <span className="badge info">+ New Product</span>}
                          {item.mapping_status === "unmapped" && !item.mapped_product_id && <span className="badge danger">⚠ Unmapped</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bottom Actions */}
            <div className="checkout" style={{ marginTop: "20px" }}>
              <div>
                <strong>Invoice Total: {money(calculatedGrandTotal)}</strong>
                {counts.unmapped > 0 && (
                  <div style={{ fontSize: "12px", color: "#dc2626" }}>
                    ⚠ {counts.unmapped} items need product mapping before approval.
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button className="secondary" onClick={() => setStep("upload")}>Cancel / Re-upload</button>
                <button className="primary" disabled={savingApproval || counts.unmapped > 0} onClick={handleApprovePurchase}>
                  {savingApproval ? <LoaderCircle className="spin" /> : <CheckCircle2 size={16} />} Approve Purchase & Post Stock
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: APPROVED SUCCESS SCREEN */}
      {step === "approved" && (
        <div className="panel">
          <div className="v2-pending" style={{ textAlign: "center", alignItems: "center", padding: "50px 20px" }}>
            <CheckCircle2 size={56} className="text-green" />
            <h2>Purchase Approved & Stock Posted!</h2>
            <p>All items, batches, stock movements, and description mappings have been permanently saved.</p>
            <button className="primary" onClick={() => setStep("upload")} style={{ marginTop: "16px" }}>
              <Plus size={16} /> Import Another Invoice
            </button>
          </div>
        </div>
      )}

      {/* MODAL: ENTER GEMINI API KEY PROMPT */}
      {showApiKeyModal && (
        <div className="image-viewer" style={{ background: "#000000aa" }}>
          <div style={{ background: "white", color: "#0f172a", width: "90%", maxWidth: "520px", margin: "auto", borderRadius: "12px", padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <Key className="text-green" size={24} />
                <h2 style={{ margin: 0, fontSize: "18px", color: "#0f172a" }}>Gemini API Key Required</h2>
              </div>
              <button className="secondary" onClick={() => setShowApiKeyModal(false)}><X size={16} /></button>
            </div>

            {apiKeyError && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "10px 14px", borderRadius: "8px", marginBottom: "14px", color: "#991b1b", fontSize: "12px", lineHeight: 1.4 }}>
                <strong>⚠ Error from Google:</strong> {apiKeyError}
              </div>
            )}

            {/* Step-by-step instructions */}
            <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "8px", padding: "12px 14px", marginBottom: "16px", fontSize: "12px", color: "#0c4a6e", lineHeight: 1.7 }}>
              <strong style={{ display: "block", marginBottom: "6px" }}>📋 How to get your free Gemini API key:</strong>
              <ol style={{ margin: 0, paddingLeft: "18px" }}>
                <li>Open <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: "#0284c7", fontWeight: 600 }}>aistudio.google.com/app/apikey</a></li>
                <li>Find a key listed under <strong>"API Keys"</strong></li>
                <li>Click <strong>"Copy key"</strong> button or the 📋 copy icon next to the key</li>
                <li>Paste the copied key below. The app will send it to Google Gemini and show Google&apos;s response if the key is invalid.</li>
              </ol>
            </div>

            <form onSubmit={handleSaveApiKeyAndRetry}>
              <div className="field" style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px", color: "#1e293b" }}>
                  Gemini API Key <b style={{ color: "#dc2626" }}>*</b>
                </label>
                <input
                  name="user_gemini_key"
                  type="text"
                  placeholder="Paste your Gemini API key"
                  defaultValue={userGeminiKey}
                  required
                  style={{
                    width: "100%",
                    height: "44px",
                    padding: "0 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--line)",
                    fontSize: "14px",
                    background: "#ffffff",
                    color: "#0f172a"
                  }}
                />
                <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
                  Use the full key exactly as copied from Google AI Studio.
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                <button type="button" className="secondary" onClick={() => setShowApiKeyModal(false)}>Cancel</button>
                <button type="submit" className="primary"><CheckCircle2 size={16} /> Save Key &amp; Process Bill</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1: SEARCH & MAP PRODUCT */}
      {editingItemIndex !== null && (
        <div className="image-viewer" style={{ background: "#000000aa" }}>
          <div style={{ background: "white", color: "var(--text)", width: "90%", maxWidth: "680px", margin: "auto", borderRadius: "12px", padding: "20px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <h2 style={{ margin: 0, fontSize: "18px" }}>Map Item #{items[editingItemIndex].line_no}</h2>
              <button className="secondary" onClick={() => setEditingItemIndex(null)}><X size={16} /></button>
            </div>

            <div style={{ background: "#f8fafc", padding: "10px 12px", borderRadius: "8px", marginBottom: "14px", fontSize: "12px" }}>
              <strong>Supplier Invoice Description:</strong> {items[editingItemIndex].supplier_description}
              <div>Mfg: {items[editingItemIndex].manufacturer || "-"} | Pack: {items[editingItemIndex].pack || "-"} | Rate: {money(items[editingItemIndex].rate)} | MRP: {money(items[editingItemIndex].mrp)}</div>
            </div>

            {/* Suggestions Section */}
            {items[editingItemIndex].suggestions && items[editingItemIndex].suggestions!.length > 0 && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", fontWeight: "bold", color: "var(--muted)", marginBottom: "8px" }}>TOP AI SUGGESTIONS</div>
                {items[editingItemIndex].suggestions!.map(({ product, score }) => (
                  <div key={product.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "8px", marginBottom: "6px", background: "#f0fdf4" }}>
                    <div>
                      <strong>{product.name}</strong> ({score}% match)
                      <div style={{ fontSize: "11px", color: "var(--muted)" }}>Code: {product.product_id} | Mfg: {product.manufacturer || "-"} | MRP: {money(product.mrp)}</div>
                    </div>
                    <button className="primary" style={{ padding: "4px 10px", fontSize: "11px" }} onClick={() => handleSelectProduct(editingItemIndex, product)}>Select</button>
                  </div>
                ))}
              </div>
            )}

            {/* Live Search Product Master */}
            <div style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "11px", fontWeight: "bold", color: "var(--muted)", marginBottom: "6px" }}>SEARCH COMPLETE PRODUCT MASTER</div>
              <div className="search-box">
                <Search size={16} />
                <input type="text" placeholder="Search product name, code, barcode..." value={productSearchQuery} onChange={(e) => setProductSearchQuery(e.target.value)} />
              </div>
            </div>

            <div style={{ maxHeight: "240px", overflowY: "auto", border: "1px solid var(--line)", borderRadius: "8px", marginBottom: "16px" }}>
              {productsMaster
                .filter((p) => !productSearchQuery || p.name.toLowerCase().includes(productSearchQuery.toLowerCase()) || (p.product_id && p.product_id.toLowerCase().includes(productSearchQuery.toLowerCase())))
                .slice(0, 15)
                .map((prod) => (
                  <div key={prod.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--line)" }}>
                    <div>
                      <strong>{prod.name}</strong>
                      <div style={{ fontSize: "11px", color: "var(--muted)" }}>Code: {prod.product_id} | Mfg: {prod.manufacturer || "-"} | MRP: {money(prod.mrp)}</div>
                    </div>
                    <button className="secondary" style={{ padding: "4px 10px", fontSize: "11px" }} onClick={() => handleSelectProduct(editingItemIndex, prod)}>Select</button>
                  </div>
                ))}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button className="secondary" onClick={() => { setNewProductForm({ name: items[editingItemIndex].supplier_description, manufacturer: items[editingItemIndex].manufacturer || "", pack_size: items[editingItemIndex].pack || "", hsn_code: items[editingItemIndex].hsn || "", mrp: items[editingItemIndex].mrp, purchase_rate: items[editingItemIndex].rate, gst_percent: items[editingItemIndex].gst_percent }); setShowCreateProductModal(true); }}>
                <PackagePlus size={16} /> + Create New Product
              </button>
              <button className="secondary" onClick={() => setEditingItemIndex(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CREATE NEW PRODUCT */}
      {showCreateProductModal && (
        <div className="image-viewer" style={{ background: "#000000aa" }}>
          <div style={{ background: "white", color: "var(--text)", width: "90%", maxWidth: "560px", margin: "auto", borderRadius: "12px", padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <h2 style={{ margin: 0, fontSize: "18px" }}>Create New Product</h2>
              <button className="secondary" onClick={() => setShowCreateProductModal(false)}><X size={16} /></button>
            </div>

            <form onSubmit={handleCreateNewProduct}>
              <div className="form-grid">
                <Field name="name" label="Product Name" value={newProductForm.name || ""} onChange={(e: any) => setNewProductForm({ ...newProductForm, name: e.target.value })} required />
                <Field name="manufacturer" label="Manufacturer" value={newProductForm.manufacturer || ""} onChange={(e: any) => setNewProductForm({ ...newProductForm, manufacturer: e.target.value })} />
                <Field name="pack_size" label="Pack Size" value={newProductForm.pack_size || ""} onChange={(e: any) => setNewProductForm({ ...newProductForm, pack_size: e.target.value })} />
                <Field name="hsn_code" label="HSN Code" value={newProductForm.hsn_code || ""} onChange={(e: any) => setNewProductForm({ ...newProductForm, hsn_code: e.target.value })} />
                <Field name="mrp" label="MRP" type="number" value={newProductForm.mrp || 0} onChange={(e: any) => setNewProductForm({ ...newProductForm, mrp: e.target.value })} required />
                <Field name="purchase_rate" label="Purchase Rate" type="number" value={newProductForm.purchase_rate || 0} onChange={(e: any) => setNewProductForm({ ...newProductForm, purchase_rate: e.target.value })} required />
                <Field name="gst_percent" label="GST %" type="number" value={newProductForm.gst_percent || 0} onChange={(e: any) => setNewProductForm({ ...newProductForm, gst_percent: e.target.value })} />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
                <button type="button" className="secondary" onClick={() => setShowCreateProductModal(false)}>Cancel</button>
                <button type="submit" className="primary"><CheckCircle2 size={16} /> Save & Map Product</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
