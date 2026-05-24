"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  TrendingUp,
  LineChart,
  FlaskConical,
  Briefcase,
  Github,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/strategy", label: "Strategy", icon: TrendingUp },
  { href: "/backtest", label: "Backtest", icon: FlaskConical },
  { href: "/positions", label: "当前持仓", icon: Briefcase },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-16 bg-[#0a0c12] border-r border-[#2a2d3a] flex flex-col items-center py-4">
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center">
        <LineChart className="h-7 w-7 text-[#3b82f6]" />
        <span className="text-[9px] font-semibold text-[#8b8fa3] mt-1 tracking-wider">
          TSQ
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col items-center gap-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/" || pathname.startsWith("/stock")
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200",
                isActive
                  ? "bg-[#3b82f6]/15 text-[#3b82f6]"
                  : "text-[#8b8fa3] hover:bg-[#2a2d3a] hover:text-[#e1e4ea]"
              )}
            >
              <item.icon className="h-5 w-5" />
              {/* Tooltip */}
              <span className="absolute left-full ml-3 px-2 py-1 bg-[#1a1d29] border border-[#2a2d3a] text-xs text-[#e1e4ea] rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="mt-auto">
        <a
          href="https://tornsy.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center w-10 h-10 rounded-lg text-[#8b8fa3] hover:bg-[#2a2d3a] hover:text-[#e1e4ea] transition-all"
        >
          <Github className="h-5 w-5" />
        </a>
      </div>
    </aside>
  );
}
