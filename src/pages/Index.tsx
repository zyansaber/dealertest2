import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import Sidebar from "@/components/Sidebar";
import OrderList from "@/components/OrderList";
import { subscribeToSchedule, sortOrders } from "@/lib/firebase";
import type { ScheduleItem } from "@/types";

export default function Index() {
  const [orders, setOrders] = useState<ScheduleItem[]>([]);
  const [selectedDealer, setSelectedDealer] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeSchedule = subscribeToSchedule((data) => {
      setOrders(sortOrders(data));
      setLoading(false);
    });

    return () => {
      unsubscribeSchedule();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-500">Loading dealer portal...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50 relative">
      {/* Admin Access Button */}
      <Link
        to="/admin-login"
        className="fixed top-4 right-4 z-50"
      >
        <Button variant="outline" size="sm" className="bg-white shadow-md">
          <Settings className="w-4 h-4 mr-2" />
          Admin
        </Button>
      </Link>

      <Sidebar 
        orders={orders}
        selectedDealer={selectedDealer}
        onDealerSelect={setSelectedDealer}
      />
      <OrderList selectedDealer={selectedDealer} />
    </div>
  );
}