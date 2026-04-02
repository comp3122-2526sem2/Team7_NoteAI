"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutDashboard,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: ("student" | "teacher" | "admin")[];
}

const navItems: NavItem[] = [
  { label: "Courses", href: "/courses", icon: LayoutDashboard, roles: ["student", "teacher", "admin"] },
  { label: "Lesson Plans", href: "/lesson-plans", icon: BookOpen, roles: ["teacher", "admin"] },
  { label: "Documents", href: "/documents", icon: FileText, roles: ["teacher", "admin"] },
  { label: "Assignments", href: "/assignments", icon: ClipboardList, roles: ["student", "teacher", "admin"] },
  { label: "My Progress", href: "/progress", icon: TrendingUp, roles: ["student"] },
  { label: "Progress Tracker", href: "/progress", icon: GraduationCap, roles: ["teacher", "admin"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const filtered = navItems.filter((item) =>
    user ? item.roles.includes(user.role) : false
  );

  return (
    <aside className="hidden md:flex flex-col w-60 border-r bg-card h-screen sticky top-0">
      <div className="p-5 border-b">
        <Link href="/courses" className="flex items-center gap-2 font-bold text-lg">
          <BookOpen className="h-5 w-5 text-primary" />
          NoteAI
        </Link>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {filtered.map((item) => (
          <Link
            key={item.href + item.label}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              pathname.startsWith(item.href)
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
