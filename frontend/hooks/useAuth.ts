"use client";

import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { authApi } from "@/lib/api";
import { useEffect } from "react";

export function useAuth() {
  const { user, token, setAuth, clearAuth, hydrate } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const login = async (username: string, password: string) => {
    const { data } = await authApi.login(username, password);
    const meRes = await authApi.me();
    setAuth(meRes.data, data.access_token);
    return meRes.data;
  };

  const logout = () => {
    clearAuth();
    router.push("/login");
  };

  return { user, token, login, logout, isTeacher: user?.role === "teacher", isStudent: user?.role === "student", isAdmin: user?.role === "admin" };
}
