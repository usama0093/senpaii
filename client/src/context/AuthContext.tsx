import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import api from "../api/axios";

interface Host {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
}

interface AuthContextType {
  host: Host | null;
  loading: boolean;
  login: (token: string, host: Host) => void;
  logout: () => void;
  // Patches the logged-in host's local info (e.g. after Settings saves a profile
  // change) so the rest of the app reflects it immediately, without a reload.
  updateHost: (patch: Partial<Host>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<Host | null>(null);
  const [loading, setLoading] = useState(true);

  // On first load (e.g. page refresh), check if a token already exists
  // and, if so, ask the server who it belongs to.
  useEffect(() => {
    const token = localStorage.getItem("senpaii_token");
    if (!token) {
      setLoading(false);
      return;
    }

    api
      .get("/auth/me")
      .then((res) => setHost(res.data.data))
      .catch(() => localStorage.removeItem("senpaii_token"))
      .finally(() => setLoading(false));
  }, []);

  const login = (token: string, hostData: Host) => {
    localStorage.setItem("senpaii_token", token);
    setHost(hostData);
  };

  const logout = () => {
    localStorage.removeItem("senpaii_token");
    setHost(null);
  };

  const updateHost = (patch: Partial<Host>) => {
    setHost((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  return (
    <AuthContext.Provider value={{ host, loading, login, logout, updateHost }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}