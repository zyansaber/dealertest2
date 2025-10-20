import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Calendar, FileText, Download, CheckCircle, Clock, AlertCircle, Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateDDMMYYYY } from "@/lib/firebase";
import { saveSubscription, checkSubscription, removeSubscription } from "@/lib/subscriptions";
import type { ScheduleItem, SpecPlanItem, DateTrackItem, TimelineStage } from "@/types";

interface OrderDetailsProps {
  order: ScheduleItem;
  specPlan?: SpecPlanItem;
  dateTrack?: DateTrackItem;
  isStock: boolean;
}

export default function OrderDetails({ order, specPlan, dateTrack, isStock }: OrderDetailsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSubscribeDialogOpen, setIsSubscribeDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Check subscription status on component mount
  useEffect(() => {
    const checkSub = async () => {
      const subscribed = await checkSubscription(order.Chassis);
      setIsSubscribed(subscribed);
    };
    checkSub();
  }, [order.Chassis]);

  const getStatusBadge = (status: string | undefined) => {
    if (!status || status.toLowerCase() === 'unknown') {
      return null; // Don't show unknown status
    }
    
    switch (status.toLowerCase()) {
      case "finished":
      case "completed":
        return <Badge className="bg-green-500 hover:bg-green-600 text-white">Finished</Badge>;
      case "in production":
      case "production":
        return <Badge className="bg-blue-500 hover:bg-blue-600 text-white">In Production</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white">Pending</Badge>;
      case "delayed":
        return <Badge className="bg-red-500 hover:bg-red-600 text-white">Delayed</Badge>;
      case "shipped":
        return <Badge className="bg-purple-500 hover:bg-purple-600 text-white">Shipped</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Calculate days between dates
  const calculateDays = (startDate: string | null, endDate: string | null): number => {
    if (!startDate) return 0;
    
    const start = parseDate(startDate);
    const end = endDate ? parseDate(endDate) : new Date();
    
    if (!start) return 0;
    
    const diffTime = end.getTime() - start.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const parseDate = (dateStr: string | null): Date | null => {
    if (!dateStr) return null;
    
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1;
      const year = parseInt(parts[2]);
      return new Date(year, month, day);
    }
    return null;
  };

  // Calculate days elapsed from Purchase Order Sent
  const getDaysElapsed = () => {
    const purchaseOrderDate = order["Purchase Order Sent"];
    if (!purchaseOrderDate) return null;
    
    return calculateDays(purchaseOrderDate, null); // to today
  };

  const daysElapsed = getDaysElapsed();

  const getTimelineStages = (): TimelineStage[] => {
    const stages: TimelineStage[] = [
      {
        name: "Order Received",
        date: order["Order Received Date"],
        status: order["Order Received Date"] ? "completed" : "pending"
      },
      {
        name: "Signed Plans Received",
        date: order["Signed Plans Received"],
        status: order["Signed Plans Received"] ? "completed" : "pending"
      },
      {
        name: "Purchase Order Sent",
        date: order["Purchase Order Sent"],
        status: order["Purchase Order Sent"] ? "completed" : "pending"
      }
    ];

    if (dateTrack) {
      stages.push(
        {
          name: "Left Port",
          date: dateTrack["Left Port"],
          status: dateTrack["Left Port"] ? "completed" : "pending"
        },
        {
          name: "Received in Melbourne",
          date: dateTrack["Received in Melbourne"],
          status: dateTrack["Received in Melbourne"] ? "completed" : "pending"
        },
        {
          name: "Dispatched from Factory",
          date: dateTrack["Dispatched from Factory"],
          status: dateTrack["Dispatched from Factory"] ? "completed" : "pending"
        }
      );
    } else {
      stages.push(
        {
          name: "Left Port",
          date: null,
          status: "pending"
        },
        {
          name: "Received in Melbourne",
          date: null,
          status: "pending"
        },
        {
          name: "Dispatched from Factory",
          date: null,
          status: "pending"
        }
      );
    }

    return stages;
  };

  const timelineStages = getTimelineStages();

  const handleDownload = (type: 'plan' | 'spec') => {
    if (specPlan) {
      const url = type === 'plan' ? specPlan.plan : specPlan.spec;
      if (url) {
        window.open(url, '_blank');
      }
    }
  };

  const formatShipment = (shipment: string | undefined) => {
    if (!shipment) return "";
    if (shipment.toLowerCase() === "received" && shipment.charAt(0) === '0') {
      return shipment.substring(1);
    }
    return shipment;
  };

  const handleSubscribe = async () => {
    if (!email.trim()) return;
    
    setIsLoading(true);
    try {
      await saveSubscription({
        chassis: order.Chassis,
        email: email.trim(),
        status: order["Regent Production"] || "Unknown",
        subscribedAt: new Date().toISOString()
      });
      
      setIsSubscribed(true);
      setIsSubscribeDialogOpen(false);
      setEmail("");
    } catch (error) {
      console.error('Failed to subscribe:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    setIsLoading(true);
    try {
      await removeSubscription(order.Chassis);
      setIsSubscribed(false);
    } catch (error) {
      console.error('Failed to unsubscribe:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Check if signed plans are received
  const isSignedPlansReceived = order["Signed Plans Received"] && order["Signed Plans Received"].toLowerCase() !== 'no';

  // Row background and border - only show blue bar for customers (not stock)
  const rowClassName = !isStock 
    ? "grid grid-cols-12 gap-2 p-4 hover:bg-slate-50 cursor-pointer items-center border-l-4 border-blue-400"
    : "grid grid-cols-12 gap-2 p-4 hover:bg-blue-50 cursor-pointer items-center bg-blue-25";

  return (
    <div className="border border-slate-200 rounded-lg">
      {/* Main Row - Fixed column layout */}
      <div 
        className={rowClassName}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="col-span-2 flex items-center gap-2">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span className="font-medium text-slate-900 truncate">{order.Chassis}</span>
          {isStock && <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs">Stock</Badge>}
        </div>
        <div className="col-span-2 text-slate-700 truncate">{order.Customer}</div>
        <div className="col-span-2 text-slate-700 truncate">{order.Model}</div>
        <div className="col-span-1 text-slate-700">{order["Model Year"]}</div>
        <div className="col-span-2 text-slate-700">{formatDateDDMMYYYY(order["Forecast Production Date"])}</div>
        <div className="col-span-2">
          {!isSignedPlansReceived ? (
            <Badge className="bg-orange-500 hover:bg-orange-600 text-white">Not Signed Yet</Badge>
          ) : (
            getStatusBadge(order["Regent Production"])
          )}
        </div>
        <div className="col-span-1 flex justify-end">
          {isSubscribed ? (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleUnsubscribe();
              }}
              disabled={isLoading}
            >
              <BellOff className="w-3 h-3 mr-1" />
              Unsub
            </Button>
          ) : (
            <Dialog open={isSubscribeDialogOpen} onOpenChange={setIsSubscribeDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsSubscribeDialogOpen(true);
                  }}
                  disabled={isLoading}
                >
                  <Bell className="w-3 h-3 mr-1" />
                  Sub
                </Button>
              </DialogTrigger>
              <DialogContent onClick={(e) => e.stopPropagation()}>
                <DialogHeader>
                  <DialogTitle>Subscribe to Order Updates</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">
                    Enter your email to receive notifications when the status of chassis {order.Chassis} changes.
                  </p>
                  <div>
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsSubscribeDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSubscribe} disabled={!email.trim() || isLoading}>
                      {isLoading ? "Subscribing..." : "Subscribe"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t border-slate-200 p-6 bg-slate-50">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Order Information */}
            <Card>
              <CardContent className="p-4">
                <h4 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Order Information
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Chassis:</span>
                    <span className="font-medium">{order.Chassis}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Customer:</span>
                    <span>{order.Customer}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Model:</span>
                    <span>{order.Model} ({order["Model Year"]})</span>
                  </div>
                  {order.Shipment && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Shipment:</span>
                      <span>{formatShipment(order.Shipment)}</span>
                    </div>
                  )}
                  {order["Price Date"] && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Price Date:</span>
                      <span>{formatDateDDMMYYYY(order["Price Date"])}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-600">Request Delivery Date:</span>
                    <span>{order["Request Delivery Date"] ? formatDateDDMMYYYY(order["Request Delivery Date"]) : "ASAP"}</span>
                  </div>
                  {daysElapsed !== null && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Days Elapsed:</span>
                      <span className={daysElapsed > 138 ? 'text-red-500 font-medium' : 'text-slate-900'}>
                        {daysElapsed} days
                        {daysElapsed > 138 && ` (${daysElapsed - 138} days over standard)`}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card>
              <CardContent className="p-4">
                <h4 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Order Timeline
                </h4>
                <div className="space-y-3">
                  {timelineStages.map((stage, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <div className="flex-shrink-0">
                        {stage.status === "completed" ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : stage.status === "in-progress" ? (
                          <Clock className="w-4 h-4 text-blue-600" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900">{stage.name}</div>
                        <div className="text-xs text-slate-500">
                          {formatDateDDMMYYYY(stage.date)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Files Section */}
          {specPlan && (specPlan.plan || specPlan.spec) && (
            <>
              <Separator className="my-4" />
              <div>
                <h4 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  Available Files
                </h4>
                <div className="flex gap-2">
                  {specPlan.plan && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleDownload('plan')}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download Plan
                    </Button>
                  )}
                  {specPlan.spec && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleDownload('spec')}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download Spec
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}