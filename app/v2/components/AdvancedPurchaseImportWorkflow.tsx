"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2, FileText, Key, LoaderCircle, Camera,
  PackagePlus, Plus, Search, ShieldAlert, Sparkles, Upload, X, Trash2
} from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { money } from "../lib/format";
import { normalizeDescription, scoreProductSuggestion } from "../lib/normalization";
import { postJournal } from "../lib/accounting";
import { Profile, Row } from "../lib/types";
import { Field } from "./controls";

const GEMINI_MODEL_OPTIONS = [
  { value: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "qwen/qwen3.8-27b", label: "Groq Qwen 3.8 27B Vision" }
];

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
  save_mapping?: boolean;
}

export function AdvancedPurchaseImportWorkflow({ profile, notify }: { profile: Profile; notify: (message: string) => void }) {
  // Workflow step state
  const [viewMode, setViewMode] = useState<"dashboard" | "import">("dashboard");
  const [drafts, setDrafts] = useState<any[]>([]);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  
  const [step, setStep] = useState<"upload" | "extracting" | "review" | "approved">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState("");

  // API Key modal prompt state
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [userGeminiKey, setUserGeminiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("gemini-3.6-flash");
  const modelSelectedByUser = useRef(false);
  const selectGeminiModel = (model: string) => {
    modelSelectedByUser.current = true;
    setGeminiModel(model);
  };
  const [apiKeyError, setApiKeyError] = useState("");
  const [extractionError, setExtractionError] = useState("");
  const [pendingBase64, setPendingBase64] = useState<{ base64: string; mimeType: string } | null>(null);

  // Extracted Invoice & Staging Header
  const [supplierId, setSupplierId] = useState("");
  const [suppliers, setSuppliers] = useState<Row[]>([]);
  const [productsMaster, setProductsMaster] = useState<Row[]>([]);
  const [savedMappings, setSavedMappings] = useState<Row[]>([]);

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [rateIncludesGst, setRateIncludesGst] = useState<boolean>(false);
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

  useEffect(() => {
    if (viewMode === "dashboard" && supabase) {
      supabase
        .from("purchase_imports")
        .select("*, supplier:suppliers(name)")
        .eq("organization_id", profile.organization_id)
        .in("status", ["draft", "extracting"])
        .order("created_at", { ascending: false })
        .then(({ data }) => setDrafts(data || []));
    }
  }, [viewMode, profile.organization_id]);

  const handleDeleteDraft = async (id: string) => {
    if (!supabase) return;
    if (!window.confirm("Are you sure you want to delete this draft?")) return;
    const { error } = await supabase.from("purchase_imports").delete().eq("id", id);
    if (error) {
      notify("Failed to delete draft");
      return;
    }
    setDrafts(drafts.filter(d => d.id !== id));
    notify("Draft deleted");
  };

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase
      .from("organizations")
      .select("gemini_model")
      .eq("id", profile.organization_id)
      .single()
      .then(({ data }) => {
        if (!cancelled && !modelSelectedByUser.current && data?.gemini_model) {
          const isValid = GEMINI_MODEL_OPTIONS.some(o => o.value === data.gemini_model);
          setGeminiModel(isValid ? data.gemini_model : "gemini-3.6-flash");
        }
      });
    return () => { cancelled = true; };
  }, [profile.organization_id]);

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
  const callExtractionApi = async (base64Content: string, mimeType: string, customApiKey?: string, isAppending: boolean = false) => {
    const isGroq = geminiModel.startsWith("qwen");
    const functionName = isGroq ? "extract-purchase-bill-groq" : "extract-purchase-bill";
    setUploadProgress(`Analyzing invoice structure with ${isGroq ? "Groq" : "Gemini"} AI...`);
    setExtractionError("");

    setPendingBase64({ base64: base64Content, mimeType });
    try {
    const payload = {
      file_base64: base64Content,
      mime_type: mimeType,
      organization_id: profile.organization_id,
      gemini_model: isGroq ? undefined : geminiModel,
      groq_model: isGroq ? geminiModel : undefined,
      user_api_key: customApiKey || userGeminiKey || undefined,
      import_id: currentDraftId || undefined
    };

    let responseOk = false;
    let resData: any = {};

    if (!supabase) {
      throw new Error("Supabase is not configured. Configure the Supabase connection before importing an invoice.");
    }
    if (supabase) {
      const { data, error } = await supabase.functions.invoke(functionName, { body: payload });
      if (!error && data) {
        responseOk = true;
        resData = data;
      } else if (error) {
        const context = (error as any).context;
        if (context && typeof context.text === "function") {
          const edgeText = await context.text();
          try {
            resData = edgeText ? JSON.parse(edgeText) : { error: error.message };
          } catch {
            resData = { error: edgeText || error.message };
          }
        } else {
          resData = { error: error.message };
        }
      }
    }

    if (!responseOk || !resData.success) {
      const errMsg = resData.error || `Failed to extract invoice via ${isGroq ? "Groq" : "Gemini"} API`;
      setPendingBase64({ base64: base64Content, mimeType });
      if (/api key is missing|enter your (google gemini|groq) api key|API key is invalid|API key not valid|API_KEY_INVALID|API key expired/i.test(errMsg)) {
        setApiKeyError(errMsg);
        setShowApiKeyModal(true);
      } else {
        setApiKeyError("");
        setExtractionError(errMsg);
        setShowApiKeyModal(false);
      }
      setStep(isAppending ? "review" : "upload");
      notify(errMsg);
      return;
    }

    setApiKeyError("");
    setExtractionError("");
    const ext = resData.extraction;
    if (!ext || !Array.isArray(ext.items) || ext.items.length === 0) {
      throw new Error("No product rows were extracted. Please upload a clearer purchase invoice.");
    }
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

      const expY = raw.expiry_year ? (String(raw.expiry_year).length === 2 ? `20${raw.expiry_year}` : raw.expiry_year) : "";

      expDate = expY && raw.expiry_month ? `${expY}-${expM}-${new Date(Number(expY), Number(expM), 0).getDate()}` : "";


      return {

        line_no: isAppending ? items.length + index + 1 : (raw.line_no || index + 1),

        supplier_description: desc,

        normalized_description: normDesc,

        product_code: raw.product_code || null,

        barcode: raw.barcode || null,

        manufacturer: raw.manufacturer || null,

        pack: raw.pack || null,

        unit: raw.unit || null,

        hsn: raw.hsn || null,

        batch_no: raw.batch_no || "",

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

        requires_review: !raw.batch_no || !expDate

      };

    });


    const finalItems = isAppending ? [...items, ...processedStagingItems] : processedStagingItems;

    let newDraftId = currentDraftId;

    if (!isAppending && !currentDraftId && supabase) {

      const { data } = await supabase.from("purchase_imports").insert({

        organization_id: profile.organization_id,

        supplier_id: ext.supplier?.gstin ? (suppliers.find((s) => s.gst_number && s.gst_number.trim().toLowerCase() === ext.supplier.gstin.trim().toLowerCase())?.id || null) : null,

        invoice_number: ext.invoice?.invoice_number || "",

        invoice_date: ext.invoice?.invoice_date || null,

        file_url: "multiple",

        status: "draft",

        raw_json: { items: finalItems }

      }).select().single();

      if (data) {

        setCurrentDraftId(data.id);

        newDraftId = data.id;

      }

    } else if (currentDraftId && supabase) {

      await supabase.from("purchase_imports").update({

        raw_json: { items: finalItems }

      }).eq("id", currentDraftId);

    }


    runProductMapping(finalItems, savedMappings, productsMaster);
    setStep("review");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to process the invoice. Please retry.";
      setExtractionError(message);
      setStep(isAppending ? "review" : "upload");
      notify(message);
    }
  };

const stitchImages = async (files: File[]): Promise<string> => {
  const images = await Promise.all(
    files.map(
      (file) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = e.target?.result as string;
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        })
    )
  );

  const maxWidth = Math.max(...images.map((img) => img.width));
  const totalHeight = images.reduce((sum, img) => sum + img.height, 0);

  const canvas = document.createElement("canvas");
  canvas.width = maxWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context");

  let yOffset = 0;
  for (const img of images) {
    ctx.drawImage(img, 0, yOffset);
    yOffset += img.height;
  }

  return canvas.toDataURL("image/jpeg", 0.7);
};

  // Handle File Upload and AI Extraction
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const validTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"];
    for (const f of files) {
      if (!validTypes.includes(f.type)) {
        notify("Please upload a valid PDF, JPG, or PNG invoice file.");
        return;
      }
      if (f.size === 0) {
        notify("Please upload non-empty invoice files.");
        return;
      }
    }

    if (files.length > 1 && files.some(f => f.type === "application/pdf")) {
      notify("Please upload only 1 PDF at a time, or upload multiple images.");
      return;
    }
    
    if (geminiModel.startsWith("qwen") && files.some(f => f.type === "application/pdf")) {
      notify("Groq does not support PDFs. Please select a Gemini model to upload PDFs, or upload an image instead.");
      return;
    }

    setFile(files[0]);
    setStep("extracting");
    setUploadProgress("Uploading file to secure storage...");
    setExtractionError("");

    try {
      let finalBase64 = "";
      let finalMimeType = "image/jpeg";

      if (files.length > 1) {
        setUploadProgress("Stitching multiple images...");
        const dataUrl = await stitchImages(files);
        finalBase64 = dataUrl.split(",")[1];
      } else {
        const selectedFile = files[0];
        finalMimeType = selectedFile.type;
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
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Could not read the invoice file. Please select it again."));
          reader.onabort = () => reject(new Error("Invoice file reading was cancelled."));
          reader.readAsDataURL(selectedFile);
        });
        finalBase64 = dataUrl.split(",")[1];
      }
      
      await callExtractionApi(finalBase64, finalMimeType);
    } catch (err: any) {
      setStep("upload");
      setExtractionError(err.message || "Failed to process uploaded file");
      notify(err.message || "Failed to process uploaded file");
    }
  };

  // Handle saving user API key and retrying extraction
    const handleAppendUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    const validTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"];
    for (const f of files) {
      if (!validTypes.includes(f.type)) {
        notify("Please upload a valid PDF, JPG, or PNG invoice file.");
        return;
      }
    }
    setUploadProgress("Appending new pages...");
    setExtractionError("");
    try {
      let finalBase64 = "";
      let finalMimeType = "image/jpeg";
      if (files.length > 1) {
        setUploadProgress("Stitching multiple images...");
        const dataUrl = await stitchImages(files);
        finalBase64 = dataUrl.split(",")[1];
      } else {
        const selectedFile = files[0];
        finalMimeType = selectedFile.type;
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Could not read the invoice file."));
          reader.onabort = () => reject(new Error("Cancelled."));
          reader.readAsDataURL(selectedFile);
        });
        finalBase64 = dataUrl.split(",")[1];
      }
      await callExtractionApi(finalBase64, finalMimeType, undefined, true);
    } catch (err: any) {
      setExtractionError(err.message || "Failed to process appended file");
      notify(err.message || "Failed to process appended file");
    }
  };

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
        .map((prod) => {
          let bestScore = scoreProductSuggestion(item, prod);
          
          // Compare against saved mappings for this product to catch OCR variations
          const prodMappings = mappings.filter(m => m.product_id === prod.id);
          for (const m of prodMappings) {
            if (!m.supplier_description) continue;
            const fauxProduct = { ...prod, name: m.supplier_description };
            const mappingScore = scoreProductSuggestion(item, fauxProduct);
            if (mappingScore > bestScore) bestScore = mappingScore;
          }
          
          return { product: prod, score: bestScore };
        })
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
    // Removed setEditingItemIndex(null) so user can see mapping and adjust units
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
    if (items.length === 0 || items.some((item) => !item.batch_no.trim() || !item.expiry_date)) {
      notify("Enter the missing batch number and expiry date for every invoice row before approval.");
      return;
    }
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
            selling_rate: (Number(item.selling_rate) > 0 ? Number(item.selling_rate) : Number(item.mrp || 0)) / unitsPerPurchaseUnit,
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
        if (item.supplier_description && item.mapped_product_id && item.save_mapping !== false) {
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
      if (currentDraftId) await supabase.from("purchase_imports").delete().eq("id", currentDraftId);
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

      
      {viewMode === "dashboard" && (
        <div className="panel" style={{ padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <h2 style={{ margin: 0 }}>Pending Conversions (Drafts)</h2>
            <button className="primary" onClick={() => {
              setCurrentDraftId(null);
              setItems([]);
              setInvoiceNumber("");
              setInvoiceDate("");
              setSupplierId("");
              setStep("upload");
              setViewMode("import");
            }}>
              <Plus size={16} /> New Import
            </button>
          </div>
          
          {drafts.length === 0 ? (
            <div className="empty-state" style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>
              No saved drafts found. Click "New Import" to start extracting a purchase bill.
            </div>
          ) : (
            <div className="crud-table-wrap" style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date Started</th>
                  <th>Supplier</th>
                  <th>Invoice No</th>
                  <th>Status</th><th>Del</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((d: any) => (
                  <tr key={d.id}>
                    <td>{new Date(d.created_at).toLocaleDateString()}</td>
                    <td>{d.supplier?.name || "Unknown Supplier"}</td>
                    <td>{d.invoice_number || "-"}</td>
                    <td><span className={`badge ${d.status}`}>{d.status}</span></td>
                    <td>
                      <button className="secondary" onClick={() => {
                        setCurrentDraftId(d.id);
                        setSupplierId(d.supplier_id || "");
                        setInvoiceNumber(d.invoice_number || "");
                        setInvoiceDate(d.invoice_date || "");
                        setItems(d.raw_json?.items || []);
                        setStep("review");
                        setViewMode("import");
                      }} style={{ marginRight: "8px" }}>Resume Mapping</button>
                      <button className="danger-btn" onClick={() => handleDeleteDraft(d.id)} style={{ padding: "4px 8px" }} title="Delete Draft">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>)}
        </div>
      )}

      {viewMode === "import" && step === "upload" && (

      
        <div className="panel">
          <div className="v2-pending" style={{ textAlign: "center", alignItems: "center", padding: "40px 20px" }}>
            <Upload size={48} className="text-green" />
            <h2>Upload Purchase Invoice</h2>
            <p>
              Support for single/multi-page PDF, JPG, or PNG files. Gemini AI will extract invoice totals, batch info, and item lines securely.
            </p>

            <label className="field" style={{ width: "100%", maxWidth: "360px", marginTop: "12px", textAlign: "left" }}>
              <span>Gemini model</span>
              <select value={geminiModel || "gemini-2.5-pro"} onChange={(event) => selectGeminiModel(event.currentTarget.value)}>
                {GEMINI_MODEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center", marginTop: "16px" }}>
              <label className="primary" style={{ cursor: "pointer", width: "100%", maxWidth: "300px" }}>
                <FileText size={18} /> Select Files (PDF / JPG / PNG)
                <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFileUpload} style={{ display: "none" }} />
              </label>
              
              <label className="secondary" style={{ cursor: "pointer", width: "100%", maxWidth: "300px" }}>
                <Camera size={18} /> Take Camera Photos
                <input type="file" multiple accept="image/*" capture="environment" onChange={handleFileUpload} style={{ display: "none" }} />
              </label>
            </div>

            {extractionError && (
              <div style={{ width: "100%", maxWidth: "620px", marginTop: "16px", background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: "8px", padding: "12px 14px", textAlign: "left", fontSize: "12px", lineHeight: 1.5 }}>
                <strong style={{ display: "block", marginBottom: "6px" }}>{geminiModel.startsWith("qwen") ? "Groq" : "Gemini"} extraction failed</strong>
                {extractionError}
                {pendingBase64 && (
                  <div style={{ marginTop: "10px" }}>
                    <button className="secondary" onClick={() => { setStep("extracting"); callExtractionApi(pendingBase64.base64, pendingBase64.mimeType); }}>
                      Retry with selected model
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: EXTRACTING PROGRESS */}
      {viewMode === "import" && step === "extracting" && (
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
      {viewMode === "import" && step === "review" && (
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
                <select value={supplierId || ""} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">-- Select Supplier --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.gst_number ? `(GST: ${s.gst_number})` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field"><span>Tax Mode</span><select value={rateIncludesGst ? "included" : "excluded"} onChange={(e) => setRateIncludesGst(e.target.value === "included")}><option value="excluded">Rate Excludes GST (Rate * Qty + GST)</option><option value="included">Rate Includes GST (Rate * Qty = Total)</option></select></label>
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
              <table className="data-table tight-table">
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
                    <th>Status</th><th>Del</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, idx) => {
                    const originalIndex = items.findIndex((i) => i === item);

                    return (
                      <tr key={idx} style={{ background: !item.mapped_product_id ? "#fef2f2" : undefined }}>
                        <td>{item.line_no}</td>
                        <td>
                          <input aria-label="Description" value={item.supplier_description} placeholder="Description" style={{ width: "200px", fontWeight: "bold" }} onChange={(e) => setItems(rows => rows.map((r, i) => i === originalIndex ? { ...r, supplier_description: e.target.value } : r))} />
                          {item.product_code && <div style={{ fontSize: "11px", color: "var(--muted)" }}>Code: {item.product_code}</div>}
                        </td>
                        <td>
                          <div style={{ fontSize: "11px" }}>
                            {item.manufacturer || "-"} | {item.pack || "-"} | HSN: {item.hsn || "-"}
                          </div>
                        </td>
                        <td>
                          <input aria-label={`Batch number for row ${item.line_no}`} value={item.batch_no} placeholder="Batch number" style={{ width: "145px" }} onChange={(event) => {
                            const value = event.currentTarget.value;
                            setItems((rows) => rows.map((row, index) => index === originalIndex ? { ...row, batch_no: value } : row));
                          }}/>
                          <input aria-label={`Expiry date for row ${item.line_no}`} type="date" value={item.expiry_date} style={{ width: "145px" }} onChange={(event) => {
                            const value = event.currentTarget.value;
                            setItems((rows) => rows.map((row, index) => index === originalIndex ? { ...row, expiry_date: value, expiry_month: value ? Number(value.slice(5, 7)) : undefined, expiry_year: value ? Number(value.slice(0, 4)) : undefined } : row));
                          }}/>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "4px", width: "120px" }}>
                            <input type="number" aria-label="Qty" value={item.quantity || ""} placeholder="Qty" style={{ width: "50%" }} onChange={(e) => setItems(rows => rows.map((r, i) => i === originalIndex ? { ...r, quantity: Number(e.target.value) } : r))} />
                            <input type="number" aria-label="Free Qty" value={item.free_quantity || ""} placeholder="Free" style={{ width: "50%" }} onChange={(e) => setItems(rows => rows.map((r, i) => i === originalIndex ? { ...r, free_quantity: Number(e.target.value) } : r))} />
                          </div>
                        </td>
                        <td><input type="number" step="0.01" aria-label="Rate" value={item.rate || ""} style={{ width: "70px" }} onChange={(e) => setItems(rows => rows.map((r, i) => i === originalIndex ? { ...r, rate: Number(e.target.value) } : r))} /></td>
                        <td><input type="number" step="0.01" aria-label="MRP" value={item.mrp || ""} style={{ width: "70px" }} onChange={(e) => setItems(rows => rows.map((r, i) => i === originalIndex ? { ...r, mrp: Number(e.target.value), selling_rate: Number(e.target.value) } : r))} /></td>
                        <td><input type="number" aria-label="GST %" value={item.gst_percent || ""} style={{ width: "50px" }} onChange={(e) => setItems(rows => rows.map((r, i) => i === originalIndex ? { ...r, gst_percent: Number(e.target.value) } : r))} /></td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <input type="number" step="0.01" aria-label="Line Total" value={item.line_total || ""} style={{ width: "85px", fontWeight: "bold", border: Math.abs(((item.quantity * item.rate - item.discount_amount) * (rateIncludesGst ? 1 : (1 + item.gst_percent / 100))) - item.line_total) > 1 ? "1px solid #dc2626" : undefined }} onChange={(e) => setItems(rows => rows.map((r, i) => i === originalIndex ? { ...r, line_total: Number(e.target.value) } : r))} />
                            {Math.abs(((item.quantity * item.rate - item.discount_amount) * (rateIncludesGst ? 1 : (1 + item.gst_percent / 100))) - item.line_total) > 1 && (
                              <span style={{ fontSize: "10px", color: "#dc2626" }}>Expected: {money(((item.quantity * item.rate - item.discount_amount) * (rateIncludesGst ? 1 : (1 + item.gst_percent / 100))))}</span>
                            )}
                          </div>
                        </td>

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
                        <td><button className="table-edit danger-btn" onClick={() => setItems(rows => rows.filter((_, i) => i !== originalIndex))}><Trash2 size={14}/></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bottom Actions */}
            <div className="checkout" style={{ marginTop: "20px" }}>
              <div>
                <strong style={{ color: printedTotal > 0 && Math.abs(calculatedGrandTotal - printedTotal) > 1 ? "#dc2626" : undefined }}>
                  Invoice Total: {money(calculatedGrandTotal)} {printedTotal > 0 && Math.abs(calculatedGrandTotal - printedTotal) > 1 ? `(Expected: ${money(printedTotal)})` : ""}
                </strong>
                {counts.unmapped > 0 && (
                  <div style={{ fontSize: "12px", color: "#dc2626" }}>
                    ⚠ {counts.unmapped} items need product mapping before approval.
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: "10px", alignItems: "center", width: "100%" }}>
                <label className="secondary" style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px" }}>
                    <Plus size={16} /> File
                    <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleAppendUpload} style={{ display: "none" }} />
                  </label>
                  <label className="secondary" style={{ cursor: "pointer", marginRight: "auto", display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px" }}>
                    <Camera size={16} /> Camera
                    <input type="file" multiple accept="image/*" capture="environment" onChange={handleAppendUpload} style={{ display: "none" }} />
                  </label>
                  <button className="secondary" onClick={() => {
                    setItems([...items, {
                      line_no: items.length + 1,
                      supplier_description: "",
                      normalized_description: "",
                      batch_no: "",
                      expiry_date: "",
                      quantity: 1,
                      free_quantity: 0,
                      purchase_unit: "unit",
                      sale_unit: "unit",
                      units_per_purchase_unit: 1,
                      rate: 0,
                      purchase_rate_per_unit: 0,
                      mrp: 0,
                      selling_rate: 0,
                      discount_percent: 0,
                      discount_amount: 0,
                      gst_percent: 0,
                      line_total: 0,
                      mapped_product_id: null,
                      mapping_source: "unmapped",
                      mapping_status: "unmapped",
                      requires_review: true
                    }]);
                  }}>
                    <Plus size={16} /> Add Item Manually
                  </button>

                <button className="secondary" onClick={async () => {
                  if (currentDraftId && supabase) {
                     await supabase.from("purchase_imports").update({
                        supplier_id: supplierId || null,
                        invoice_number: invoiceNumber || null,
                        raw_json: { items }
                     }).eq("id", currentDraftId);
                  }
                  setStep("upload");
                  setViewMode("dashboard");
                }}>
                  Save Draft & Exit
                </button>

                <button className="primary" disabled={savingApproval || counts.unmapped > 0} onClick={handleApprovePurchase}>
                  {savingApproval ? <LoaderCircle className="spin" /> : <CheckCircle2 size={16} />} Approve Purchase & Post Stock
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: APPROVED SUCCESS SCREEN */}
      {viewMode === "import" && step === "approved" && (
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

            <div style={{ marginBottom: "16px", color: "#64748b", fontSize: "14px", lineHeight: "1.5" }}>
              Provide your {geminiModel.startsWith("qwen") ? "Groq" : "Google Gemini"} API key to use AI invoice extraction.
              {apiKeyError && <div style={{ marginTop: "10px", color: "#dc2626", background: "#fef2f2", padding: "10px", borderRadius: "6px", fontSize: "13px" }}><strong>Error:</strong> {apiKeyError}</div>}
            </div>

            {/* Step-by-step instructions */}
            <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "8px", padding: "12px 14px", marginBottom: "16px", fontSize: "12px", color: "#0c4a6e", lineHeight: 1.7 }}>
              <strong style={{ display: "block", marginBottom: "6px" }}>📋 How to get your free {geminiModel.startsWith("qwen") ? "Groq" : "Gemini"} API key:</strong>
              <ol style={{ margin: 0, paddingLeft: "18px" }}>
                {geminiModel.startsWith("qwen") ? (
                  <>
                    <li>Open <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" style={{ color: "#0284c7", fontWeight: 600 }}>console.groq.com/keys</a></li>
                    <li>Create or copy your API key</li>
                  </>
                ) : (
                  <>
                    <li>Open <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: "#0284c7", fontWeight: 600 }}>aistudio.google.com/app/apikey</a></li>
                    <li>Find a key listed under <strong>"API Keys"</strong></li>
                    <li>Click <strong>"Copy key"</strong> button</li>
                  </>
                )}
                <li>Paste the copied key below.</li>
              </ol>
            </div>

            <form onSubmit={handleSaveApiKeyAndRetry}>
              <div className="field" style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px", color: "#1e293b" }}>
                  {geminiModel.startsWith("qwen") ? "Groq API Key" : "Gemini API Key"} <b style={{ color: "#dc2626" }}>*</b>
                </label>
                <input
                  name="user_gemini_key"
                  type="text"
                  placeholder={`Paste your ${geminiModel.startsWith("qwen") ? "Groq" : "Gemini"} API key`}
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
                  Use the full key exactly as copied from the console.
                </div>
              </div>

              <div className="field" style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px", color: "#1e293b" }}>
                  AI Model
                </label>
                <select
                  name="gemini_model"
                  value={geminiModel || "gemini-2.5-pro"}
                  onChange={(event) => selectGeminiModel(event.currentTarget.value)}
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
                >
                  {GEMINI_MODEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
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
          <div style={{ background: "white", color: "#0f172a", width: "90%", maxWidth: "680px", margin: "auto", borderRadius: "12px", padding: "20px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <h2 style={{ margin: 0, fontSize: "18px" }}>Map Item #{items[editingItemIndex].line_no}</h2>
              <button className="secondary" onClick={() => setEditingItemIndex(null)}><X size={16} /></button>
            </div>

            <div style={{ background: "#f8fafc", padding: "10px 12px", borderRadius: "8px", marginBottom: "14px", fontSize: "12px", color: "#334155" }}>
              <strong style={{ color: "#0f172a" }}>Supplier Invoice Description:</strong> {items[editingItemIndex].supplier_description}
              <div>Mfg: {items[editingItemIndex].manufacturer || "-"} | Pack: {items[editingItemIndex].pack || "-"} | Rate: {money(items[editingItemIndex].rate)} | MRP: {money(items[editingItemIndex].mrp)}</div>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px", background: "#f0fdf4", padding: "10px", borderRadius: "8px", marginBottom: "14px", border: "1px solid #bbf7d0" }}><input type="checkbox" checked={items[editingItemIndex].save_mapping !== false} onChange={(e) => { const checked = e.target.checked; setItems(rows => { const copy = [...rows]; copy[editingItemIndex].save_mapping = checked; return copy; }); }} /> Save this description to Product Mappings for future auto-mapping</label>
            {/* If Mapped, show the unit settings panel */}
            {items[editingItemIndex].mapped_product && (
              <div style={{ marginBottom: "20px", padding: "16px", border: "1px solid #cbd5e1", borderRadius: "8px", background: "#f8fafc" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                  <div>
                    <div style={{ fontSize: "11px", fontWeight: "bold", color: "#16a34a", marginBottom: "4px" }}>MAPPED PRODUCT</div>
                    <strong style={{ fontSize: "14px", color: "#0f172a" }}>{items[editingItemIndex].mapped_product!.name}</strong>
                    <div style={{ fontSize: "11px", color: "var(--muted)" }}>Code: {items[editingItemIndex].mapped_product!.product_id}</div>
                  </div>
                </div>

                <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "12px" }}>
                  &middot; Unit settings &middot; Retail count: <strong>{items[editingItemIndex].units_per_purchase_unit}</strong> &middot; Pack unit: <strong>{items[editingItemIndex].purchase_unit}</strong> &middot; Sale unit: <strong>{items[editingItemIndex].sale_unit}</strong>
                </div>

                <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "6px" }}>Retail count (units / pack)</label>
                    <input type="number" min="1" value={items[editingItemIndex].units_per_purchase_unit || ""} onChange={(e) => {
                      const units = Number(e.target.value) || 1;
                      setItems(rows => { const copy = [...rows]; copy[editingItemIndex].units_per_purchase_unit = units; copy[editingItemIndex].purchase_rate_per_unit = copy[editingItemIndex].rate / units; return copy; });
                    }} style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "4px", background: "white" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "6px" }}>Purchase unit</label>
                    <select value={items[editingItemIndex].purchase_unit || ""} onChange={(e) => {
                      const val = e.target.value;
                      setItems(rows => { const copy = [...rows]; copy[editingItemIndex].purchase_unit = val; return copy; });
                    }} style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "4px", background: "white" }}>
                      <option value="strip">strip</option>
                      <option value="box">box</option>
                      <option value="bottle">bottle</option>
                      <option value="vial">vial</option>
                      <option value="unit">unit</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "6px" }}>Sale unit</label>
                    <select value={items[editingItemIndex].sale_unit || ""} onChange={(e) => {
                      const val = e.target.value;
                      setItems(rows => { const copy = [...rows]; copy[editingItemIndex].sale_unit = val; return copy; });
                    }} style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "4px", background: "white" }}>
                      <option value="tablet">tablet</option>
                      <option value="capsule">capsule</option>
                      <option value="ml">ml</option>
                      <option value="piece">piece</option>
                      <option value="unit">unit</option>
                    </select>
                  </div>
                </div>

                <div style={{ background: "#f1f5f9", padding: "10px", borderRadius: "6px", fontSize: "12px", color: "#334155" }}>
                  Stock added: <strong>{(items[editingItemIndex].quantity + (items[editingItemIndex].free_quantity || 0)) * (items[editingItemIndex].units_per_purchase_unit || 1)} {items[editingItemIndex].sale_unit}</strong> &middot; Sales GST setting: <strong>Price + GST (Rate includes GST)</strong>
                </div>
              </div>
            )}


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
              <div className="search-box" style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "8px" }}>
                <Search size={16} color="#64748b" />
                <input type="text" placeholder="Search product name, code, barcode..." value={productSearchQuery} onChange={(e) => setProductSearchQuery(e.target.value)} style={{ color: "#0f172a", background: "transparent" }} />
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
          <div style={{ background: "white", color: "#0f172a", width: "90%", maxWidth: "560px", margin: "auto", borderRadius: "12px", padding: "20px" }}>
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
