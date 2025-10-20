import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

interface ProtectedMainRouteProps {
  children: React.ReactNode;
}

export default function ProtectedMainRoute({ children }: ProtectedMainRouteProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAuth = () => {
      const authenticated = localStorage.getItem("mainAuthenticated");
      const loginTime = localStorage.getItem("mainLoginTime");
      
      if (authenticated === "true" && loginTime) {
        const loginDate = new Date(loginTime);
        const now = new Date();
        const hoursDiff = (now.getTime() - loginDate.getTime()) / (1000 * 60 * 60);
        
        // 24小时后需要重新登录
        if (hoursDiff < 24) {
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem("mainAuthenticated");
          localStorage.removeItem("mainLoginTime");
          setIsAuthenticated(false);
        }
      } else {
        setIsAuthenticated(false);
      }
    };

    checkAuth();
  }, []);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}