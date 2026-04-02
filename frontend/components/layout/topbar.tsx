"use client";

import { LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";

export function Topbar() {
  const { user, logout } = useAuth();

  return (
    <header className="h-14 border-b flex items-center justify-between px-4 bg-card sticky top-0 z-10">
      <div />
      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" className="flex items-center gap-2" />}>
            <User className="h-4 w-4" />
            <span className="text-sm font-medium">{user.nickname}</span>
            <Badge variant="secondary" className="text-xs capitalize">
              {user.role}
            </Badge>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>
              <div className="font-medium">{user.nickname}</div>
              <div className="text-xs text-muted-foreground">@{user.username}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive">
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  );
}
