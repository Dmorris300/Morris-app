import { createContext, useContext, useEffect, useState } from "react";
import api from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("morris_token");
    if (!token) { setLoading(false); return; }
    api.get("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => {
        localStorage.removeItem("morris_token");
        localStorage.removeItem("morris_user");
      })
      .finally(() => setLoading(false));
  }, []);

  const persist = (u, token) => {
    if (token) localStorage.setItem("morris_token", token);
    if (u) localStorage.setItem("morris_user", JSON.stringify(u));
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem("morris_token");
    localStorage.removeItem("morris_user");
    setUser(null);
  };

  const refresh = async () => {
    const r = await api.get("/auth/me");
    setUser(r.data);
    localStorage.setItem("morris_user", JSON.stringify(r.data));
    return r.data;
  };

  return (
    <AuthContext.Provider value={{ user, loading, persist, logout, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
