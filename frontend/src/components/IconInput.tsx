import type { LucideIcon } from "lucide-react";
import type { InputHTMLAttributes } from "react";

export default function IconInput({
  icon: Icon,
  className = "",
  ...props
}: { icon: LucideIcon } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <Icon
        className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-zinc-400"
        strokeWidth={2}
      />
      <input
        {...props}
        className={`w-full rounded-lg border border-zinc-300 py-2.5 pr-3 pl-10 text-sm transition outline-none ${className}`}
      />
    </div>
  );
}
