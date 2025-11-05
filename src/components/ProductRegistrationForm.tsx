// src/components/ProductRegistrationForm.tsx
import React, { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { saveHandover } from "@/lib/firebase";

type RegistrationData = {
  chassis: string;
  model?: string | null;
  dealerName?: string | null;
  dealerSlug?: string | null;
  handoverAt: string; // ISO
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: RegistrationData | null;
};

declare global {
  interface Window {
    html2canvas?: any;
    jspdf?: any; // UMD: window.jspdf.jsPDF
    jsPDF?: any; // Fallback: window.jsPDF if present
  }
}

async function ensurePdfLibs(): Promise<{ html2canvas: any; jsPDF: any }> {
  const loadScript = (src: string) =>
    new Promise<void>((resolve, reject) => {
      const existing = Array.from(document.querySelectorAll("script")).find((s) => s.src.includes(src));
      if (existing) return resolve();
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.crossOrigin = "anonymous";
      s.onload = () => resolve();
      s.onerror = (e) => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(s);
    });

  // Load html2canvas if not present
  if (!window.html2canvas) {
    await loadScript("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js");
  }
  // Load jsPDF UMD if not present
  if (!window.jspdf || !window.jspdf.jsPDF) {
    await loadScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
  }

  const html2canvas = window.html2canvas;
  const jsPDF = window.jspdf?.jsPDF || window.jsPDF;
  if (!html2canvas || !jsPDF) {
    throw new Error("PDF libraries not available after loading.");
  }
  return { html2canvas, jsPDF };
}

export default function ProductRegistrationForm({ open, onOpenChange, initial }: Props) {
  const [step, setStep] = useState<"mode" | "assist" | "email">("mode");
  const [inviteEmail, setInviteEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [custEmail, setCustEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const data = useMemo(() => {
    return initial ?? {
      chassis: "",
      model: "",
      dealerName: "",
      dealerSlug: "",
      handoverAt: new Date().toISOString(),
    };
  }, [initial]);

  const handoverDateStr = useMemo(() => {
    try {
      const d = new Date(data.handoverAt);
      return d.toLocaleDateString();
    } catch {
      return data.handoverAt;
    }
  }, [data.handoverAt]);

  const resetStates = () => {
    setStep("mode");
    setInviteEmail("");
    setFirstName("");
    setLastName("");
    setCustEmail("");
    setPhone("");
    setAddress("");
    setSubmitting(false);
    setSubmitMsg(null);
  };
  const resetAndClose = () => {
    resetStates();
    onOpenChange(false);
  };

  const handleDownloadPDF = async () => {
    const el = printRef.current;
    if (!el) return;
    try {
      const { html2canvas, jsPDF } = await ensurePdfLibs();
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "pt", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 32;
      const imgWidth = pageWidth - margin * 2;
@@ -146,59 +146,148 @@ export default function ProductRegistrationForm({ open, onOpenChange, initial }:
        dealerName: data.dealerName || null,
        dealerSlug: data.dealerSlug || null,
        handoverAt: data.handoverAt,
        customer: {
          firstName,
          lastName,
          email: custEmail,
          phone,
          address,
        },
        createdAt: new Date().toISOString(),
        source: "dealer_assist_form" as const,
      };
      await saveHandover((data.dealerSlug || "") as string, data.chassis, handoverData);

      setSubmitMsg("Submitted successfully.");
      setSubmitting(false);
      resetAndClose();
    } catch (e) {
      console.error(e);
      setSubmitMsg("Submit failed. Please try again.");
      setSubmitting(false);
    }
  };

  const handleSubmitEmail = async () => {
    if (!inviteEmail) {
      setSubmitMsg("Please enter the customer's email.");
      return;
    }
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const handoverData = {
        chassis: data.chassis,
        model: data.model || null,
        dealerName: data.dealerName || null,
        dealerSlug: data.dealerSlug || null,
        handoverAt: data.handoverAt,
        createdAt: new Date().toISOString(),
        source: "customer email" as const,
        invite: {
          email: inviteEmail,
        },
      };
      await saveHandover((data.dealerSlug || "") as string, data.chassis, handoverData);

      setSubmitMsg("Email submitted successfully.");
      setSubmitting(false);
      resetAndClose();
    } catch (e) {
      console.error(e);
      setSubmitMsg("Submit failed. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setStep("mode") : resetAndClose())}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-[28px] leading-8 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-blue-700 to-sky-600">
            Professional Handover Form
          </DialogTitle>
        </DialogHeader>

        {step === "mode" && (
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-base font-semibold text-slate-900">How would you like to complete the form?</p>
              {submitMsg && <span className="text-sm text-slate-600">{submitMsg}</span>}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Card
                role="button"
                tabIndex={0}
                className="cursor-pointer border-slate-200 transition hover:border-sky-400"
                onClick={() => {
                  setSubmitMsg(null);
                  setStep("assist");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSubmitMsg(null);
                    setStep("assist");
                  }
                }}
              >
                <CardHeader>
                  <CardTitle>Assist the customer now</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-slate-600">
                  Fill in the customer's information together and submit directly from this form.
                </CardContent>
              </Card>
              <Card
                role="button"
                tabIndex={0}
                className="cursor-pointer border-slate-200 transition hover:border-sky-400"
                onClick={() => {
                  setSubmitMsg(null);
                  setStep("email");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSubmitMsg(null);
                    setStep("email");
                  }
                }}
              >
                <CardHeader>
                  <CardTitle>Let the customer finish later</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-slate-600">
                  Send the form to the customer's email so they can complete it on their own time.
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {step === "assist" && (
          <div className="space-y-6">
            <div ref={printRef} className="rounded-2xl border bg-white/85 p-6 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Dealer</div>
                  <div className="text-sm font-semibold text-slate-900">{data.dealerName || "-"}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Handover Date</div>
                  <div className="text-sm font-semibold text-slate-900">{handoverDateStr}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Chassis</div>
                  <div className="text-sm font-semibold text-slate-900">{data.chassis}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Model</div>
                  <div className="text-sm font-semibold text-slate-900">{data.model || "-"}</div>
                </div>
              </div>

              <div className="mt-5 pt-5 border-t">
                <div className="text-base font-semibold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-blue-700 to-sky-600">
                  Customer Information
@@ -223,41 +312,60 @@ export default function ProductRegistrationForm({ open, onOpenChange, initial }:
                  <div className="md:col-span-2">
                    <Label>Home Address</Label>
                    <Input value={address} onChange={(e) => setAddress(e.target.value)} required />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleDownloadPDF}>
                Download PDF
              </Button>
              <Button
                className="bg-indigo-600 hover:bg-indigo-700"
                disabled={submitting || !canSubmit()}
                onClick={handleSubmitAssist}
              >
                {submitting ? "Submitting..." : "Submit"}
              </Button>
              {submitMsg && <span className="text-sm text-slate-600">{submitMsg}</span>}
            </div>
          </div>
        )}

        {step === "email" && (
          <div className="space-y-6">
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle>Send to customer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="customer-email">Customer Email</Label>
                  <Input
                    id="customer-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                </div>
                {submitMsg && <span className="text-sm text-slate-600">{submitMsg}</span>}
              </CardContent>
            </Card>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => setStep("mode")}>Back</Button>
              <Button
                className="bg-sky-600 hover:bg-sky-700"
                disabled={submitting || !inviteEmail}
                onClick={handleSubmitEmail}
              >
                {submitting ? "Submitting..." : "Send Email"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
