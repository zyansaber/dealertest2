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
  const [step, setStep] = useState<"assist" | "email">("assist");
  const [emailTo, setEmailTo] = useState("");
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
    setStep("assist");
    setEmailTo("");
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
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, "PNG", margin, margin, imgWidth, Math.min(imgHeight, pageHeight - margin * 2));
      pdf.save(`handover_${data.chassis}.pdf`);
      setSubmitMsg("PDF downloaded.");
    } catch (err) {
      console.error("PDF generation failed:", err);
      setSubmitMsg("PDF generation failed. Please try again.");
    }
  };

  const canSubmit = () =>
    Boolean(firstName && lastName && custEmail && phone && address && (data.dealerSlug || "") && data.chassis);

  const handleSubmitAssist = async () => {
    if (!canSubmit()) {
      setSubmitMsg("Please complete all required fields.");
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

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setStep("assist") : resetAndClose())}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-[28px] leading-8 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-blue-700 to-sky-600">
            Professional Handover Form
          </DialogTitle>
        </DialogHeader>

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
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 mt-2">
                  <div>
                    <Label>First Name</Label>
                    <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                  </div>
                  <div>
                    <Label>Last Name</Label>
                    <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input type="email" value={custEmail} onChange={(e) => setCustEmail(e.target.value)} required />
                  </div>
                  <div>
                    <Label>Phone Number</Label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
                  </div>
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
          <div className="space-y-3">
            <div className="text-sm font-medium">{emailTo}</div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setStep("assist")}>
                Back
              </Button>
              <Button className="bg-sky-600 hover:bg-sky-700" onClick={resetAndClose}>
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
