"use client";

import { useState } from "react";

// `unbounded` and `value` are independent so "not yet touched" (both false/
// null) reads differently from "explicitly marked unbounded" — overloading
// value===null for both looked, and was, identical to an already-filled-in
// "unbounded on both sides" answer before the student did anything.
export type NumberLineBound = { value: number | null; unbounded: boolean; inclusive: boolean };
export type NumberLineValue = { lower: NumberLineBound; upper: NumberLineBound };

export const EMPTY_NUMBER_LINE_VALUE: NumberLineValue = {
  lower: { value: null, unbounded: false, inclusive: false },
  upper: { value: null, unbounded: false, inclusive: false },
};

export function hasNumberLineAnswer(value: NumberLineValue): boolean {
  return value.lower.unbounded || value.lower.value !== null || value.upper.unbounded || value.upper.value !== null;
}

// Matches the backend's {"intervals": [{"lower", "lower_inclusive", "upper",
// "upper_inclusive"}]} shape (ai-engine/pipeline.py's number_line_answer) —
// submitted via the existing generic `submitted_answer: str` field, same way
// free-response answers already reuse it for plain text. A bound left
// untouched serializes the same as an explicitly unbounded one (both null) —
// harmless since submission is blocked until at least one side is set.
export function serializeNumberLineAnswer(value: NumberLineValue): string {
  const encode = (b: NumberLineBound) =>
    b.unbounded || b.value === null
      ? { value: null, inclusive: null }
      : { value: b.value, inclusive: b.inclusive };
  const lower = encode(value.lower);
  const upper = encode(value.upper);
  return JSON.stringify({
    intervals: [
      { lower: lower.value, lower_inclusive: lower.inclusive, upper: upper.value, upper_inclusive: upper.inclusive },
    ],
  });
}

// Sizes the visible range from numbers already in the question text — never
// from the correct answer, so the widget's own layout can't leak it.
function computeRange(promptText: string): { min: number; max: number; step: number } {
  const matches = promptText.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  const nums = matches.length ? matches : [0, 10];
  let lo = Math.min(...nums, 0);
  let hi = Math.max(...nums, 0);
  if (lo === hi) {
    lo -= 5;
    hi += 5;
  }
  const pad = Math.max(2, (hi - lo) * 0.3);
  lo = Math.floor(lo - pad);
  hi = Math.ceil(hi + pad);
  const span = hi - lo;
  const step = span <= 12 ? 1 : span <= 30 ? 2 : span <= 60 ? 5 : Math.ceil(span / 120) * 10;
  return { min: lo, max: hi, step };
}

export default function NumberLineInput({
  promptText,
  value,
  onChange,
  disabled,
}: {
  promptText: string;
  value: NumberLineValue;
  onChange: (value: NumberLineValue) => void;
  disabled?: boolean;
}) {
  const [activeBound, setActiveBound] = useState<"lower" | "upper">("lower");
  const { min, max, step } = computeRange(promptText);
  const width = 600;
  const height = 90;
  const padding = 30;
  const toX = (v: number) => padding + ((v - min) / (max - min)) * (width - 2 * padding);

  const ticks: number[] = [];
  for (let t = min; t <= max + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100);

  function setBoundValue(bound: "lower" | "upper", raw: number) {
    if (Number.isNaN(raw)) return;
    const clamped = Math.max(min, Math.min(max, raw));
    onChange({ ...value, [bound]: { ...value[bound], value: clamped, unbounded: false } });
  }

  function setBoundUnbounded(bound: "lower" | "upper", unbounded: boolean) {
    onChange({ ...value, [bound]: { value: null, unbounded, inclusive: false } });
  }

  function handleLineClick(e: React.MouseEvent<SVGSVGElement>) {
    if (disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    const raw = min + ((x - padding) / (width - 2 * padding)) * (max - min);
    const snapped = Math.round(raw / (step / 2)) * (step / 2);
    setBoundValue(activeBound, snapped);
  }

  const { lower, upper } = value;
  const lowerPlaced = lower.value !== null;
  const upperPlaced = upper.value !== null;

  return (
    <div className="rounded-xl border-2 border-zinc-200 p-4">
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setActiveBound("lower")}
          className={`flex-1 rounded-lg py-2 text-sm font-bold transition disabled:cursor-not-allowed ${
            activeBound === "lower" ? "bg-sky-600 text-white" : "bg-zinc-100 text-zinc-600"
          }`}
        >
          Set left bound
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setActiveBound("upper")}
          className={`flex-1 rounded-lg py-2 text-sm font-bold transition disabled:cursor-not-allowed ${
            activeBound === "upper" ? "bg-sky-600 text-white" : "bg-zinc-100 text-zinc-600"
          }`}
        >
          Set right bound
        </button>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={`w-full ${disabled ? "" : "cursor-pointer"}`}
        onClick={handleLineClick}
      >
        <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="#a1a1aa" strokeWidth={2} />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={toX(t)} y1={height / 2 - 6} x2={toX(t)} y2={height / 2 + 6} stroke="#a1a1aa" strokeWidth={1.5} />
            <text x={toX(t)} y={height / 2 + 22} textAnchor="middle" fontSize={11} fill="#71717a">
              {t}
            </text>
          </g>
        ))}

        {(lowerPlaced || upperPlaced || lower.unbounded || upper.unbounded) && (
          <line
            x1={lowerPlaced ? toX(lower.value as number) : padding - 12}
            y1={height / 2}
            x2={upperPlaced ? toX(upper.value as number) : width - padding + 12}
            y2={height / 2}
            stroke="#0284c7"
            strokeWidth={5}
            strokeLinecap="round"
          />
        )}
        {lower.unbounded && (
          <polygon
            points={`${padding - 12},${height / 2} ${padding + 4},${height / 2 - 6} ${padding + 4},${height / 2 + 6}`}
            fill="#0284c7"
          />
        )}
        {upper.unbounded && (
          <polygon
            points={`${width - padding + 12},${height / 2} ${width - padding - 4},${height / 2 - 6} ${width - padding - 4},${height / 2 + 6}`}
            fill="#0284c7"
          />
        )}

        {lowerPlaced && (
          <circle
            cx={toX(lower.value as number)}
            cy={height / 2}
            r={7}
            fill={lower.inclusive ? "#0284c7" : "white"}
            stroke="#0284c7"
            strokeWidth={2.5}
            className={disabled ? "" : "cursor-pointer"}
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled) onChange({ ...value, lower: { ...lower, inclusive: !lower.inclusive } });
            }}
          />
        )}
        {upperPlaced && (
          <circle
            cx={toX(upper.value as number)}
            cy={height / 2}
            r={7}
            fill={upper.inclusive ? "#0284c7" : "white"}
            stroke="#0284c7"
            strokeWidth={2.5}
            className={disabled ? "" : "cursor-pointer"}
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled) onChange({ ...value, upper: { ...upper, inclusive: !upper.inclusive } });
            }}
          />
        )}
      </svg>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <label className="mb-1 block font-semibold text-zinc-600">Left bound</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="any"
              disabled={disabled || lower.unbounded}
              value={lower.value ?? ""}
              onChange={(e) => setBoundValue("lower", Number(e.target.value))}
              placeholder="—"
              className="w-20 rounded-lg border border-zinc-200 px-2 py-1 disabled:opacity-50"
            />
            <label className="flex items-center gap-1 text-xs text-zinc-500">
              <input
                type="checkbox"
                disabled={disabled}
                checked={lower.unbounded}
                onChange={(e) => setBoundUnbounded("lower", e.target.checked)}
              />
              Unbounded
            </label>
          </div>
        </div>
        <div>
          <label className="mb-1 block font-semibold text-zinc-600">Right bound</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="any"
              disabled={disabled || upper.unbounded}
              value={upper.value ?? ""}
              onChange={(e) => setBoundValue("upper", Number(e.target.value))}
              placeholder="—"
              className="w-20 rounded-lg border border-zinc-200 px-2 py-1 disabled:opacity-50"
            />
            <label className="flex items-center gap-1 text-xs text-zinc-500">
              <input
                type="checkbox"
                disabled={disabled}
                checked={upper.unbounded}
                onChange={(e) => setBoundUnbounded("upper", e.target.checked)}
              />
              Unbounded
            </label>
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        Click the number line to place the active bound, then click its circle to toggle open/closed (○
        = not included, ● = included).
      </p>
    </div>
  );
}
