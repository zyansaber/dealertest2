import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface ProtectedAdminRouteProps {
  children: React.ReactNode;
}

export default function ProtectedAdminRoute({ children }: ProtectedAdminRouteProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = () => {
      const authenticated = localStorage.getItem("adminAuthenticated");
      const loginTime = localStorage.getItem("adminLoginTime");
      
      if (authenticated === "true" && loginTime) {
        const currentTime = Date.now();
        const loginTimestamp = parseInt(loginTime);
        const sessionDuration = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        
        // Check if session is still valid (24 hours)
        if (currentTime - loginTimestamp < sessionDuration) {
          setIsAuthenticated(true);
        } else {
          // Session expired, clear auth
          localStorage.removeItem("adminAuthenticated");
          localStorage.removeItem("adminLoginTime");
          navigate("/admin-login");
        }
      } else {
        navigate("/admin-login");
      }
      
      setIsLoading(false);
    };

    checkAuth();
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-500">Verifying access...</div>
      </div>
    );
  }

  return isAuthenticated ? <>{children}</> : null;
}