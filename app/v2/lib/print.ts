"use client";

export function triggerUniversalPrint() {
  if (typeof window === "undefined") return;
  try {
    if ((window as any).AndroidPrinter && typeof (window as any).AndroidPrinter.print === "function") {
      (window as any).AndroidPrinter.print();
      return;
    }
  } catch (err) {
    console.error("AndroidPrinter failed, falling back to window.print", err);
  }

  try {
    window.print();
  } catch (err) {
    console.error("window.print failed", err);
  }
}

if (typeof window !== "undefined") {
  const nativePrint = window.print;
  window.print = function () {
    try {
      if ((window as any).AndroidPrinter && typeof (window as any).AndroidPrinter.print === "function") {
        (window as any).AndroidPrinter.print();
        return;
      }
    } catch {}
    if (nativePrint) {
      nativePrint.call(window);
    }
  };
}
