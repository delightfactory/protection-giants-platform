"use client";

import { useEffect, useState } from "react";

export function CopyTransferIdButton({ transferCode }: { transferCode: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(transferCode);
      setCopied(true);
    } catch {
      const input = document.createElement("textarea");
      input.value = transferCode;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      document.execCommand("copy");
      input.remove();
      setCopied(true);
    }
  }

  return (
    <button type="button" className="button" onClick={copy} aria-live="polite">
      {copied ? "تم النسخ" : "نسخ Transfer ID"}
    </button>
  );
}
