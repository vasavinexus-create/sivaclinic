export function normalizeDescription(text: string | null | undefined): string {
  if (!text) return "";
  let s = String(text).trim().toLowerCase();
  // Normalize apostrophes: e.g. 10's, 10 's -> 10s
  s = s.replace(/(\d+)\s*'\s*s/g, "$1s");
  s = s.replace(/'\s*s\b/g, "s");
  // Replace punctuation with spaces except decimal points inside numbers
  s = s.replace(/[^\w\s.]/g, " ");
  // Collapse multiple spaces
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export type CandidateProduct = Record<string, any>;

export interface ExtractedItemSpec {
  supplier_description: string;
  normalized_description: string;
  product_code?: string | null;
  barcode?: string | null;
  manufacturer?: string | null;
  pack?: string | null;
  hsn?: string | null;
}

// Extract strength tokens like 500mg, 650mg, 10ml, 5ml, 250mcg, 100iu
function extractStrengthTokens(str: string): string[] {
  const matches = str.match(/\b\d+(\.\d+)?\s*(mg|g|mcg|ml|l|iu|pct|%)\b/gi) || [];
  return matches.map((m) => m.replace(/\s+/g, "").toLowerCase());
}

// Extract pack tokens like 10s, 20s, 10tab, 10cap
function extractPackTokens(str: string): string[] {
  const matches = str.match(/\b\d+\s*(s|tabs?|caps?|vials?|amps?|puffs?)\b/gi) || [];
  return matches.map((m) => m.replace(/\s+/g, "").toLowerCase());
}

export function scoreProductSuggestion(item: ExtractedItemSpec, product: CandidateProduct): number {
  const normDesc = item.normalized_description || normalizeDescription(item.supplier_description);
  const normProdName = normalizeDescription(product.name);
  const normMfg = normalizeDescription(product.manufacturer || "");
  const normItemMfg = normalizeDescription(item.manufacturer || "");

  // 1. Barcode exact match
  if (item.barcode && product.barcode && item.barcode.trim() === product.barcode.trim()) {
    return 100;
  }

  // 2. Product code exact match
  if (item.product_code && product.product_id && item.product_code.trim().toLowerCase() === product.product_id.trim().toLowerCase()) {
    return 95;
  }

  let score = 0;

  // Tokenize
  const descTokens = normDesc.split(/\s+/).filter((t) => t.length > 1);
  const prodTokens = normProdName.split(/\s+/).filter((t) => t.length > 1);

  if (descTokens.length === 0 || prodTokens.length === 0) return 0;

  // Check token overlap
  let tokenMatches = 0;
  for (const pToken of prodTokens) {
    if (descTokens.includes(pToken)) {
      tokenMatches++;
    } else if (descTokens.some((dToken) => dToken.includes(pToken) || pToken.includes(dToken))) {
      tokenMatches += 0.5;
    }
  }

  const tokenScore = (tokenMatches / Math.max(prodTokens.length, descTokens.length)) * 60;
  score += tokenScore;

  // Exact name substring
  if (normDesc.includes(normProdName) || normProdName.includes(normDesc)) {
    score += 20;
  }

  // Manufacturer match bonus
  if (normMfg && normItemMfg && (normMfg.includes(normItemMfg) || normItemMfg.includes(normMfg))) {
    score += 15;
  }

  // HSN match bonus
  if (item.hsn && product.hsn_code && item.hsn.trim() === product.hsn_code.trim()) {
    score += 10;
  }

  // STRENGTH MISMATCH PENALTY
  const itemStrengths = extractStrengthTokens(normDesc);
  const prodStrengths = extractStrengthTokens(normProdName + " " + (product.strength || ""));

  if (itemStrengths.length > 0 && prodStrengths.length > 0) {
    const hasSharedStrength = itemStrengths.some((s) => prodStrengths.includes(s));
    if (!hasSharedStrength) {
      // Penalty: subtract 50 points if strength tokens differ (e.g. 500mg vs 650mg)
      score -= 50;
    } else {
      score += 15;
    }
  }

  // PACK MISMATCH PENALTY
  const itemPacks = extractPackTokens(normDesc + " " + (item.pack || ""));
  const prodPacks = extractPackTokens(normProdName + " " + (product.pack_size || ""));

  if (itemPacks.length > 0 && prodPacks.length > 0) {
    const hasSharedPack = itemPacks.some((p) => prodPacks.includes(p));
    if (!hasSharedPack) {
      score -= 30;
    } else {
      score += 10;
    }
  }

  return Math.max(0, Math.min(99, Math.round(score)));
}
