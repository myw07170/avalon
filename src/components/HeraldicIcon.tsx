import { cn } from "@/lib/utils";

export function CrownIcon({ className }: { className?: string }) {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 32 32" className={cn("text-brass", className)} fill="currentColor">
    <path d="M16 2 19 8 16 10 13 8Zm-12 8 4-3 3 10 5-7 5 7 3-10 4 3-4 14H8ZM9 26h14v3H9Z" />
    <path d="M3 12 5 24 8 29l8 2 8-2 3-5 2-12-3 3-2 11-8 3-8-3-2-11Z" />
    <path d="m16 17 3 4-3 3-3-3Z" fill="#071421" />
  </svg>;
}

type SymbolKind = "ai" | "dice" | "watch" | "history" | "book" | "key";
const SYMBOLS: Record<SymbolKind, string> = {
  ai: "M11 3h2v3h5a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3h5Zm-4 7v4h3v-4Zm7 0v4h3v-4ZM8 17v1h8v-1Z",
  dice: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm1 3v3h3V6Zm9 0v3h3V6Zm-5 5v3h3v-3Zm-4 5v3h3v-3Zm9 0v3h3v-3Z",
  watch: "M3 5h18v14H3Zm7 3v8l7-4ZM9 21h6v1H9Z",
  history: "M5 3h12l4 4v14H5Zm11 1v5h5ZM8 12v2h10v-2Zm0 5v2h10v-2Z",
  book: "M2 4c4-1 7 0 9 2v15c-3-2-6-3-9-2Zm20 0c-4-1-7 0-9 2v15c3-2 6-3 9-2Z",
  key: "M9 3a6 6 0 1 0 3 11l3 3h3v3h4v-4l-7-7a6 6 0 0 0-6-6ZM6 7a2 2 0 1 1 4 0 2 2 0 0 1-4 0Z",
};

export function MetalIcon({ kind, className }: { kind: SymbolKind; className?: string }) {
  return <span aria-hidden="true" className={cn("metal-badge inline-grid size-8 shrink-0 place-items-center rounded-full text-brass", className)}>
    <svg viewBox="0 0 24 24" className="size-[60%]" fill="currentColor" fillRule="evenodd"><path d={SYMBOLS[kind]} /></svg>
  </span>;
}
