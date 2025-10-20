import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function AccessRestricted() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Restricted</h1>
          
          <p className="text-slate-600 mb-6">
            This dealer portal link is invalid or has expired. Please contact your administrator for a valid access link.
          </p>
          
          <Button 
            onClick={() => window.location.href = '/'}
            className="w-full"
          >
            Return to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}