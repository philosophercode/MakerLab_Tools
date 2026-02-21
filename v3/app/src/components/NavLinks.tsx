"use client";

import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Browse" },
  { href: "/scan", label: "Scan" },
  { href: "/chat", label: "Chat" },
  { href: "/report", label: "Report Issue" },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-6 text-sm">
      {links.map(({ href, label }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <a
            key={href}
            href={href}
            className={`transition-colors ${
              active
                ? "font-semibold text-foreground"
                : "text-muted hover:text-foreground"
            }`}
            {...(active ? { "aria-current": "page" as const } : {})}
          >
            {label}
          </a>
        );
      })}
    </div>
  );
}
