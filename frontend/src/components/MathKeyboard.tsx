"use client";

import { useState } from "react";
import { Calculator, ChevronDown, ChevronUp } from "lucide-react";

export type MathToken = {
  label: string;
  insert: string;
  cursorOffset?: number;
  replace?: boolean;
  wide?: boolean;
};

const BASIC_TOKENS: MathToken[] = [
  { label: "×", insert: "×" },
  { label: "÷", insert: "÷" },
  { label: "±", insert: "±" },
  { label: "·", insert: "·" },
  { label: "≤", insert: "≤" },
  { label: "≥", insert: "≥" },
  { label: "≠", insert: "≠" },
  { label: "°", insert: "°" },
  { label: "√x", insert: "√()", cursorOffset: 2 },
  { label: "∛x", insert: "∛()", cursorOffset: 2 },
  { label: "xⁿ", insert: "^" },
  { label: "x²", insert: "²" },
  { label: "x³", insert: "³" },
  { label: "|x|", insert: "||", cursorOffset: 1 },
  { label: "a⁄b", insert: "/" },
  { label: "ln(x)", insert: "ln()", cursorOffset: 3 },
  { label: "log(x)", insert: "log()", cursorOffset: 4 },
  { label: "logₐ(x)", insert: "logₐ()", cursorOffset: 5 },
  { label: "π", insert: "π" },
  { label: "e", insert: "e" },
  { label: "∞", insert: "∞" },
  { label: "∈", insert: "∈" },
  { label: "∉", insert: "∉" },
  { label: "∅", insert: "∅" },
  { label: "ℝ", insert: "ℝ" },
  { label: "ℚ", insert: "ℚ" },
  { label: "ℤ", insert: "ℤ" },
  { label: "∪", insert: "∪" },
  { label: "∩", insert: "∩" },
  { label: "(a,b)", insert: "(,)", cursorOffset: 1 },
  { label: "[a,b]", insert: "[,]", cursorOffset: 1 },
  { label: "(a,b]", insert: "(,]", cursorOffset: 1 },
  { label: "[a,b)", insert: "[,)", cursorOffset: 1 },
  { label: "→", insert: "→" },
  { label: "{ }", insert: "{}", cursorOffset: 1 },
  { label: "No Solution", insert: "No Solution", replace: true, wide: true },
  { label: "All Real Numbers", insert: "All Real Numbers", replace: true, wide: true },
  { label: "Undefined", insert: "Undefined", replace: true, wide: true },
  { label: "Infinitely Many Solutions", insert: "Infinitely Many Solutions", replace: true, wide: true },
];

const TRIG_TOKENS: MathToken[] = [
  { label: "sin(x)", insert: "sin()", cursorOffset: 4 },
  { label: "cos(x)", insert: "cos()", cursorOffset: 4 },
  { label: "tan(x)", insert: "tan()", cursorOffset: 4 },
  { label: "csc(x)", insert: "csc()", cursorOffset: 4 },
  { label: "sec(x)", insert: "sec()", cursorOffset: 4 },
  { label: "cot(x)", insert: "cot()", cursorOffset: 4 },
  { label: "sin⁻¹(x)", insert: "sin⁻¹()", cursorOffset: 6 },
  { label: "cos⁻¹(x)", insert: "cos⁻¹()", cursorOffset: 6 },
  { label: "tan⁻¹(x)", insert: "tan⁻¹()", cursorOffset: 6 },
  { label: "θ", insert: "θ" },
  { label: "φ", insert: "φ" },
  { label: "°", insert: "°" },
  { label: "π", insert: "π" },
  { label: "√x", insert: "√()", cursorOffset: 2 },
  { label: "x²", insert: "²" },
  { label: "∞", insert: "∞" },
];

export default function MathKeyboard({ onInsert }: { onInsert: (token: MathToken) => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"basic" | "trig">("basic");

  const tokens = tab === "basic" ? BASIC_TOKENS : TRIG_TOKENS;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-sm font-semibold text-purple-500 hover:text-purple-700"
      >
        <Calculator className="h-4 w-4" />
        Math symbols
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="mt-2 rounded-xl border-2 border-purple-100 bg-purple-50/60 p-3">
          <div className="mb-2 flex gap-4 border-b border-purple-200 text-sm font-bold">
            <button
              type="button"
              onClick={() => setTab("basic")}
              className={`pb-1.5 ${tab === "basic" ? "border-b-2 border-purple-600 text-purple-700" : "text-zinc-400"}`}
            >
              BASIC
            </button>
            <button
              type="button"
              onClick={() => setTab("trig")}
              className={`pb-1.5 ${tab === "trig" ? "border-b-2 border-purple-600 text-purple-700" : "text-zinc-400"}`}
            >
              TRIG
            </button>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {tokens.map((token) => (
              <button
                key={token.label}
                type="button"
                onClick={() => onInsert(token)}
                className={`rounded-lg bg-white py-2 text-sm font-medium text-zinc-700 shadow-sm ring-1 ring-purple-100 hover:bg-purple-100 ${
                  token.wide ? "col-span-3" : ""
                }`}
              >
                {token.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
