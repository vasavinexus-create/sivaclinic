export function money(value: any) {
  const num = Number(value || 0);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(num);
}

export function fmtDate(value: any) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-IN");
}

export function nextCode(prefix: string) {
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}
