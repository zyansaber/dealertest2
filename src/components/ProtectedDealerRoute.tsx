import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

interface ProtectedDealerRouteProps {
  children: React.ReactNode;
}

export default function ProtectedDealerRoute({ children }: ProtectedDealerRouteProps) {
  const { dealerSlug } = useParams<{ dealerSlug: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!dealerSlug) {
      navigate("/", { replace: true });
      return;
    }

    // Check if the dealerSlug contains the required code format (dealerName-code)
    const hasValidFormat = /^.+-[a-z0-9]{6}$/.test(dealerSlug);
    
    if (!hasValidFormat) {
      // Redirect to access denied or home page if format is invalid
      navigate("/access-restricted", { replace: true });
      return;
    }
  }, [dealerSlug, navigate]);

  // Only render children if dealerSlug has valid format
  const hasValidFormat = dealerSlug && /^.+-[a-z0-9]{6}$/.test(dealerSlug);
  
  if (!hasValidFormat) {
    return null; // Don't render anything while redirecting
  }

  return <>{children}</>;
}