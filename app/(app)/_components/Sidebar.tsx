"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", icon: "⬡", label: "Agent" },
  { href: "/dashboard/marketing-agents", icon: "📣", label: "Marketing" },
  { href: "/content-pipeline", icon: "✦", label: "Content" },
  { href: "/settings", icon: "⚙", label: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="flex flex-col w-52 h-full bg-[#0D0F14] border-r border-white/[0.07] shrink-0"
      style={{ viewTransitionName: "sidebar" }}
    >
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/[0.07]">
        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-[#C9A84C] to-[#8B6914] flex items-center justify-center text-sm font-bold text-black">
          ⬡
        </div>
        <div>
          <div className="text-sm font-bold tracking-wide text-white">VULNAGUARD</div>
          <div className="text-[10px] text-[#C9A84C] tracking-[0.15em] uppercase">SEO Agent</div>
        </div>
      </div>

      <nav aria-label="Main navigation" className="flex flex-col gap-1 p-3 flex-1">
        {NAV.map(({ href, icon, label }) => {
          const active =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href + "/"));
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                active
                  ? "border-l-2 border-[#C9A84C] text-white bg-white/[0.04] pl-[10px]"
                  : "text-gray-400 hover:text-white hover:bg-white/[0.03]"
              }`}
            >
              <span className="text-base leading-none">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
