import { createContext } from "react";

export type UserRole = "student" | "parent" | "teacher" | "admin";

export type AuthUser = {
  id: string;
  email?: string | null;
  role: UserRole;
  fullName?: string | null;
  isDemo?: boolean;
};

export type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  setDemoRole: (role: UserRole) => void;
  clearDemo: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);