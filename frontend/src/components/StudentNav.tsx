"use client";

import { Award, BookOpen, Dumbbell, HelpCircle, Home } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function StudentNav({ studentId }: { studentId: string }) {
  const pathname = usePathname();
  const base = `/student/${studentId}`;

  const items = [
    { href: base, label: "Home", icon: Home, exact: true },
    { href: `${base}/subjects`, label: "My Subjects", icon: BookOpen },
    { href: `${base}/practice`, label: "Practice", icon: Dumbbell },
    { href: `${base}/badges`, label: "Badge", icon: Award },
    { href: `${base}/help`, label: "Help", icon: HelpCircle },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-purple-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-stretch justify-between px-2">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                active ? "text-purple-600" : "text-zinc-400 hover:text-purple-400"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
