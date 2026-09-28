export function money(n: any) {
  return `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function fmtDate(v: any) {
  return v ? new Date(v).toLocaleDateString("en-IN") : "—";
}
export function nextCode(prefix: string = "") {
  return prefix + Math.floor(10000 + Math.random() * 90000).toString();
}
