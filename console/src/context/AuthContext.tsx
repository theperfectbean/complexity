import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface AuthContextType {
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ isAuthenticated: true, loading: false });

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // For this architectural prototype, we default to authenticated.
    // Real Next.js backend API verification will be implemented here.
    const timer = setTimeout(() => {
      setIsAuthenticated(true);
      setLoading(false);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
