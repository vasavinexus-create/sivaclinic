"use client";

import React, { useState } from "react";
import { AlertTriangle, Check, Copy, CreditCard, ExternalLink, Pause, RefreshCw, ShieldAlert } from "lucide-react";
import { Organization, Row } from "./types";
import { money } from "./format";

export interface ClinicPaymentConfig {
  upi_id: string;
  payee_name: string;
  amount: number;
  note: string;
}

export interface OwnerPaymentDefaults {
  upi_id: string;
  payee_name: string;
  default_amount: number;
}

const META_DELIMITER = "::SUBMETA::";
const OWNER_DEFAULTS_STORAGE_KEY = "mediflow_owner_payment_defaults_v1";
const CLINIC_PAYMENT_STORAGE_PREFIX = "mediflow_clinic_payment_v1_";

export const DEFAULT_OWNER_PAYMENT: OwnerPaymentDefaults = {
  upi_id: "vasavinexus@upi",
  payee_name: "SivaCare Software",
  default_amount: 0,
};

export function getStoredOwnerPaymentDefaults(ownerOrg?: Row | Organization | null): OwnerPaymentDefaults {
  let result: OwnerPaymentDefaults = { ...DEFAULT_OWNER_PAYMENT };

  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(OWNER_DEFAULTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          result = {
            upi_id: String(parsed.upi_id ?? result.upi_id).trim(),
            payee_name: String(parsed.payee_name ?? result.payee_name).trim(),
            default_amount: Number(parsed.default_amount ?? result.default_amount) || 0,
          };
        }
      }
    } catch {}
  }

  const rawName = String((ownerOrg as any)?.name || "");
  if (rawName.includes(META_DELIMITER)) {
    try {
      const jsonPart = rawName.split(META_DELIMITER)[1];
      const parsed = JSON.parse(jsonPart);
      if (parsed && typeof parsed === "object") {
        result = {
          upi_id: String(parsed.upi_id || result.upi_id).trim(),
          payee_name: String(parsed.payee_name || result.payee_name).trim(),
          default_amount: Number(parsed.default_amount ?? parsed.amount ?? result.default_amount) || 0,
        };
      }
    } catch {}
  }

  return result;
}

export function saveStoredOwnerPaymentDefaults(defaults: OwnerPaymentDefaults): string {
  const clean: OwnerPaymentDefaults = {
    upi_id: String(defaults.upi_id || "").trim(),
    payee_name: String(defaults.payee_name || "SivaCare Software").trim(),
    default_amount: Math.max(0, Number(defaults.default_amount || 0)),
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(OWNER_DEFAULTS_STORAGE_KEY, JSON.stringify(clean));
    } catch {}
  }
  return `SivaCare Software Owner${META_DELIMITER}${JSON.stringify(clean)}`;
}

export function parseClinicPaymentConfig(
  org?: Row | Organization | null,
  ownerDefaults?: OwnerPaymentDefaults
): ClinicPaymentConfig {
  const defaults = ownerDefaults || getStoredOwnerPaymentDefaults();
  const clinicName = String(org?.clinic_name || "Clinic").trim();
  const defaultNote = `${clinicName} - Software Charges`;

  let config: ClinicPaymentConfig = {
    upi_id: defaults.upi_id || DEFAULT_OWNER_PAYMENT.upi_id,
    payee_name: defaults.payee_name || DEFAULT_OWNER_PAYMENT.payee_name,
    amount: Number(defaults.default_amount || 0),
    note: defaultNote,
  };

  if (typeof window !== "undefined" && org?.id) {
    try {
      const cached = window.localStorage.getItem(`${CLINIC_PAYMENT_STORAGE_PREFIX}${org.id}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === "object") {
          config = {
            upi_id: String(parsed.upi_id || config.upi_id).trim(),
            payee_name: String(parsed.payee_name || config.payee_name).trim(),
            amount: Number(parsed.amount ?? config.amount) || 0,
            note: String(parsed.note || defaultNote).trim(),
          };
        }
      }
    } catch {}
  }

  // Check direct database columns if present
  if ((org as any)?.upi_id) config.upi_id = String((org as any).upi_id).trim();
  if ((org as any)?.payee_name) config.payee_name = String((org as any).payee_name).trim();
  if ((org as any)?.pending_amount !== undefined && (org as any)?.pending_amount !== null) {
    config.amount = Number((org as any).pending_amount) || 0;
  }
  if ((org as any)?.payment_note) config.note = String((org as any).payment_note).trim();

  const rawName = String((org as any)?.name || "");
  if (rawName.includes(META_DELIMITER)) {
    try {
      const jsonPart = rawName.split(META_DELIMITER)[1];
      const parsed = JSON.parse(jsonPart);
      if (parsed && typeof parsed === "object") {
        config = {
          upi_id: String(parsed.upi_id || config.upi_id).trim(),
          payee_name: String(parsed.payee_name || config.payee_name).trim(),
          amount: Number(parsed.amount ?? config.amount) || 0,
          note: String(parsed.note || defaultNote).trim(),
        };
      }
    } catch {}
  } else if (rawName.trim().startsWith("{") && rawName.trim().endsWith("}")) {
    try {
      const parsed = JSON.parse(rawName);
      if (parsed && typeof parsed === "object") {
        config = {
          upi_id: String(parsed.upi_id || config.upi_id).trim(),
          payee_name: String(parsed.payee_name || config.payee_name).trim(),
          amount: Number(parsed.amount ?? config.amount) || 0,
          note: String(parsed.note || defaultNote).trim(),
        };
      }
    } catch {}
  }

  if (!config.note) {
    config.note = defaultNote;
  } else if (clinicName && !config.note.toLowerCase().includes(clinicName.toLowerCase())) {
    config.note = `${clinicName} - ${config.note}`;
  }

  return config;
}

export function serializeClinicNameWithPayment(
  clinicName: string,
  orgId: string | undefined,
  config: Partial<ClinicPaymentConfig>
): string {
  const cleanClinic = String(clinicName || "Clinic").trim();
  const cleanNote = String(config.note || `${cleanClinic} - Software Charges`).trim();
  const payload: ClinicPaymentConfig = {
    upi_id: String(config.upi_id || DEFAULT_OWNER_PAYMENT.upi_id).trim(),
    payee_name: String(config.payee_name || DEFAULT_OWNER_PAYMENT.payee_name).trim(),
    amount: Math.max(0, Number(config.amount || 0)),
    note: cleanNote.toLowerCase().includes(cleanClinic.toLowerCase())
      ? cleanNote
      : `${cleanClinic} - ${cleanNote}`,
  };

  if (typeof window !== "undefined" && orgId) {
    try {
      window.localStorage.setItem(`${CLINIC_PAYMENT_STORAGE_PREFIX}${orgId}`, JSON.stringify(payload));
    } catch {}
  }

  return `${cleanClinic}${META_DELIMITER}${JSON.stringify(payload)}`;
}

export function buildUpiPaymentUri(config: ClinicPaymentConfig): string {
  const pa = String(config.upi_id || "").trim();
  const pn = String(config.payee_name || "Software Owner").trim();
  const am = Number(config.amount || 0);
  const tn = String(config.note || "Clinic Software Charges").trim();

  const params: string[] = [
    `pa=${encodeURIComponent(pa)}`,
    `pn=${encodeURIComponent(pn)}`,
  ];
  if (am > 0) {
    params.push(`am=${am.toFixed(2)}`);
  }
  params.push("cu=INR");
  if (tn) {
    params.push(`tn=${encodeURIComponent(tn)}`);
  }
  return `upi://pay?${params.join("&")}`;
}

// ─── Pure TypeScript ISO/IEC 18004 QR Code Generator (Versions 1–10, Level L) ──
// Supports up to 271 UTF-8 bytes with 0 external dependencies and 100% offline SVG rendering.

const QR_VERSION_CAPACITY_L = [0, 17, 32, 53, 78, 106, 134, 154, 192, 230, 271];
const QR_EC_CODEWORDS_L = [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18];
const QR_NUM_BLOCKS_L = [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4];
const QR_ALIGNMENT_POS: number[][] = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

function gfMul(x: number, y: number, exp: number[], log: number[]): number {
  if (x === 0 || y === 0) return 0;
  return exp[(log[x] + log[y]) % 255];
}

function computeReedSolomon(data: number[], ecCount: number): number[] {
  const exp = new Array<number>(512);
  const log = new Array<number>(256);
  let v = 1;
  for (let i = 0; i < 255; i++) {
    exp[i] = v;
    log[v] = i;
    v <<= 1;
    if (v & 0x100) v ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];

  let gen = [1];
  for (let i = 0; i < ecCount; i++) {
    const next = new Array<number>(gen.length + 1).fill(0);
    const factor = exp[i];
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= gfMul(gen[j], factor, exp, log);
    }
    gen = next;
  }

  const rem = new Array<number>(ecCount).fill(0);
  for (const b of data) {
    const lead = b ^ rem[0];
    rem.shift();
    rem.push(0);
    if (lead !== 0) {
      for (let j = 0; j < ecCount; j++) {
        rem[j] ^= gfMul(gen[j + 1], lead, exp, log);
      }
    }
  }
  return rem;
}

export function generateQrMatrix(text: string): boolean[][] {
  const utf8 = Array.from(new TextEncoder().encode(text));
  let version = 1;
  while (version <= 10 && utf8.length > QR_VERSION_CAPACITY_L[version]) {
    version++;
  }
  if (version > 10) {
    version = 10;
    utf8.length = QR_VERSION_CAPACITY_L[10];
  }

  const size = version * 4 + 17;
  const totalModules = (() => {
    let total = size * size - 3 * 64 - 2 * (size - 16) - 31;
    const aligns = QR_ALIGNMENT_POS[version];
    if (aligns.length > 0) {
      const count = aligns.length * aligns.length - 3;
      total -= count * 25;
      if (aligns.length > 2) {
        total += (aligns.length - 2) * 10;
      }
    }
    if (version >= 7) total -= 36;
    return total;
  })();

  const totalCodewords = totalModules >> 3;
  const ecPerBlock = QR_EC_CODEWORDS_L[version];
  const numBlocks = QR_NUM_BLOCKS_L[version];
  const totalDataCodewords = totalCodewords - ecPerBlock * numBlocks;

  // Build bit stream: Byte mode (0100)
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(utf8.length, version <= 9 ? 8 : 16);
  for (const b of utf8) pushBits(b, 8);

  const maxDataBits = totalDataCodewords * 8;
  const termLen = Math.min(4, maxDataBits - bits.length);
  pushBits(0, termLen);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataBytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    dataBytes.push(byte);
  }
  let padToggle = true;
  while (dataBytes.length < totalDataCodewords) {
    dataBytes.push(padToggle ? 0xec : 0x11);
    padToggle = !padToggle;
  }

  // Split into blocks & compute Reed-Solomon EC
  const shortBlockLen = Math.floor(totalDataCodewords / numBlocks);
  const numLongBlocks = totalDataCodewords % numBlocks;
  const numShortBlocks = numBlocks - numLongBlocks;

  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;
  for (let b = 0; b < numBlocks; b++) {
    const len = shortBlockLen + (b >= numShortBlocks ? 1 : 0);
    const block = dataBytes.slice(offset, offset + len);
    offset += len;
    dataBlocks.push(block);
    ecBlocks.push(computeReedSolomon(block, ecPerBlock));
  }

  // Interleave data and EC codewords
  const finalBytes: number[] = [];
  const maxBlockLen = shortBlockLen + (numLongBlocks > 0 ? 1 : 0);
  for (let i = 0; i < maxBlockLen; i++) {
    for (let b = 0; b < numBlocks; b++) {
      if (i < dataBlocks[b].length) finalBytes.push(dataBlocks[b][i]);
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (let b = 0; b < numBlocks; b++) {
      finalBytes.push(ecBlocks[b][i]);
    }
  }

  // Initialize matrix
  const modules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const isFunc: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

  const setFunctionModule = (r: number, c: number, dark: boolean) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      modules[r][c] = dark;
      isFunc[r][c] = true;
    }
  };

  // Finder patterns + separators
  const drawFinder = (top: number, left: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = top + r;
        const cc = left + c;
        const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const onBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const inInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setFunctionModule(rr, cc, inOuter && (onBorder || inInner));
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFunctionModule(6, i, i % 2 === 0);
    setFunctionModule(i, 6, i % 2 === 0);
  }

  // Alignment patterns
  const aligns = QR_ALIGNMENT_POS[version];
  for (let i = 0; i < aligns.length; i++) {
    for (let j = 0; j < aligns.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === aligns.length - 1) || (i === aligns.length - 1 && j === 0)) {
        continue;
      }
      const cr = aligns[i];
      const cc = aligns[j];
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const dark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
          setFunctionModule(cr + r, cc + c, dark);
        }
      }
    }
  }

  // Reserve format info & dark module
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      if (!isFunc[8][i]) setFunctionModule(8, i, false);
      if (!isFunc[i][8]) setFunctionModule(i, 8, false);
    }
  }
  for (let i = 0; i < 8; i++) {
    if (!isFunc[8][size - 1 - i]) setFunctionModule(8, size - 1 - i, false);
    if (!isFunc[size - 1 - i][8]) setFunctionModule(size - 1 - i, 8, false);
  }
  setFunctionModule(size - 8, 8, true);

  // Place data bits in zigzag
  let bitIdx = 0;
  const totalBits = finalBytes.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        const upward = ((right + 1) & 2) === 0;
        const r = upward ? size - 1 - vert : vert;
        if (!isFunc[r][c]) {
          let dark = false;
          if (bitIdx < totalBits) {
            dark = ((finalBytes[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1) !== 0;
            bitIdx++;
          }
          // Apply Mask 0: (r + c) % 2 === 0
          if ((r + c) % 2 === 0) dark = !dark;
          modules[r][c] = dark;
        }
      }
    }
  }

  // Write Format Information for Level L (01) and Mask 0 (000) -> 0x77c4
  const formatBits = 0x77c4;
  const getFormatBit = (idx: number) => ((formatBits >> idx) & 1) !== 0;

  for (let i = 0; i <= 5; i++) setFunctionModule(8, i, getFormatBit(14 - i));
  setFunctionModule(8, 7, getFormatBit(8));
  setFunctionModule(8, 8, getFormatBit(7));
  setFunctionModule(7, 8, getFormatBit(6));
  for (let i = 0; i <= 5; i++) setFunctionModule(5 - i, 8, getFormatBit(i));

  for (let i = 0; i < 8; i++) setFunctionModule(8, size - 8 + i, getFormatBit(7 - i));
  for (let i = 0; i < 7; i++) setFunctionModule(size - 7 + i, 8, getFormatBit(14 - i));

  return modules;
}

export function UpiQrCodeSvg({ value, size = 210 }: { value: string; size?: number }) {
  const matrix = React.useMemo(() => generateQrMatrix(value), [value]);
  const quietZone = 4;
  const total = matrix.length + quietZone * 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${total} ${total}`}
      shapeRendering="crispEdges"
      style={{
        display: "block",
        margin: "0 auto",
        background: "#ffffff",
        borderRadius: "10px",
        border: "1px solid #e2e8f0",
        boxShadow: "0 2px 10px rgba(15, 23, 42, 0.06)",
      }}
      role="img"
      aria-label="UPI Payment QR Code"
    >
      <rect width={total} height={total} fill="#ffffff" />
      {matrix.map((row, r) =>
        row.map((cell, c) =>
          cell ? <rect key={`${r}-${c}`} x={c + quietZone} y={r + quietZone} width={1} height={1} fill="#0f172a" /> : null
        )
      )}
    </svg>
  );
}

export function PausedClinicPaymentScreen({
  organization,
  onRefreshStatus,
  onSignOut,
}: {
  organization?: Organization | Row | null;
  onRefreshStatus?: () => Promise<void> | void;
  onSignOut: () => void;
}) {
  const [copiedField, setCopiedField] = useState<string>("");
  const [checking, setChecking] = useState(false);

  const clinicName = organization?.clinic_name || "Your Clinic";
  const paymentConfig = parseClinicPaymentConfig(organization);
  const upiUri = buildUpiPaymentUri(paymentConfig);

  const copyValue = (key: string, text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedField(key);
      setTimeout(() => setCopiedField(""), 2000);
    }
  };

  const handleRefresh = async () => {
    if (!onRefreshStatus) return;
    setChecking(true);
    try {
      await onRefreshStatus();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div
      className="auth-page"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f0f4f2",
        padding: "20px",
      }}
    >
      <div
        className="auth-card"
        style={{
          background: "#ffffff",
          padding: "32px",
          borderRadius: "16px",
          boxShadow: "0 10px 30px rgba(15, 23, 42, 0.1)",
          width: "100%",
          maxWidth: "520px",
          border: "1px solid #fecaca",
        }}
      >
        {/* Paused State Header */}
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 14px",
              borderRadius: "999px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#dc2626",
              fontWeight: 800,
              fontSize: "12px",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              marginBottom: "12px",
            }}
          >
            <Pause size={14} /> CLINIC LOGIN PAUSED
          </div>
          <h2 style={{ color: "#0f172a", margin: "0 0 8px 0", fontSize: "22px", fontWeight: 800 }}>
            {clinicName}
          </h2>
          <p style={{ color: "#475569", margin: 0, fontSize: "14px", lineHeight: 1.5 }}>
            Logins for <strong>{clinicName}</strong> are currently paused due to pending software charges. Scan the QR code below to complete payment and restore clinic access.
          </p>
        </div>

        {/* QR Code + Prefilled Payment Section */}
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "20px",
            marginBottom: "20px",
          }}
        >
          {paymentConfig.upi_id ? (
            <>
              <div style={{ textAlign: "center", marginBottom: "16px" }}>
                <UpiQrCodeSvg value={upiUri} size={200} />
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "8px", fontWeight: 600 }}>
                  Scan with GPay, PhonePe, Paytm, or any UPI App
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: "10px",
                  background: "#ffffff",
                  padding: "14px",
                  borderRadius: "10px",
                  border: "1px solid #e2e8f0",
                  fontSize: "13px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px dashed #e2e8f0", paddingBottom: "8px" }}>
                  <span style={{ color: "#64748b", fontWeight: 600 }}>Pending Amount</span>
                  <span style={{ fontSize: "18px", fontWeight: 800, color: "#0f766e" }}>
                    {paymentConfig.amount > 0 ? money(paymentConfig.amount) : "As billed by Software Owner"}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                  <span style={{ color: "#64748b", fontWeight: 600 }}>Payee Name</span>
                  <strong style={{ color: "#0f172a" }}>{paymentConfig.payee_name}</strong>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                  <span style={{ color: "#64748b", fontWeight: 600 }}>UPI ID</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px", fontWeight: 700, color: "#0f172a" }}>
                      {paymentConfig.upi_id}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyValue("upi", paymentConfig.upi_id)}
                      style={{
                        border: "1px solid #cbd5e1",
                        background: "#fff",
                        borderRadius: "6px",
                        padding: "3px 7px",
                        fontSize: "11px",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      {copiedField === "upi" ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                    </button>
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", borderTop: "1px dashed #e2e8f0", paddingTop: "8px" }}>
                  <span style={{ color: "#64748b", fontWeight: 600 }}>Payment Note (Prefilled)</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <strong style={{ color: "#0f172a" }}>{paymentConfig.note}</strong>
                    <button
                      type="button"
                      onClick={() => copyValue("note", paymentConfig.note)}
                      style={{
                        border: "1px solid #cbd5e1",
                        background: "#fff",
                        borderRadius: "6px",
                        padding: "3px 7px",
                        fontSize: "11px",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      {copiedField === "note" ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                    </button>
                  </span>
                </div>
              </div>

              <div style={{ marginTop: "12px", textAlign: "center" }}>
                <a
                  href={upiUri}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    width: "100%",
                    padding: "11px 16px",
                    background: "#0f766e",
                    color: "#ffffff",
                    borderRadius: "8px",
                    fontWeight: 700,
                    fontSize: "14px",
                    textDecoration: "none",
                    boxSizing: "border-box",
                  }}
                >
                  <CreditCard size={16} /> Pay {paymentConfig.amount > 0 ? money(paymentConfig.amount) : "Now"} via UPI App <ExternalLink size={14} />
                </a>
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "12px", color: "#475569", fontSize: "14px" }}>
              Please contact the software owner to complete pending software charges for <strong>{clinicName}</strong>.
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {onRefreshStatus && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={checking}
              style={{
                flex: 1,
                padding: "12px 16px",
                backgroundColor: "#f1f5f9",
                color: "#0f172a",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 700,
                cursor: checking ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              <RefreshCw size={15} className={checking ? "spin" : ""} />
              {checking ? "Checking..." : "Check Release Status"}
            </button>
          )}
          <button
            type="button"
            onClick={onSignOut}
            style={{
              flex: 1,
              padding: "12px 16px",
              backgroundColor: "#126b5a",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Back to Sign In
          </button>
        </div>
      </div>
    </div>
  );
}
