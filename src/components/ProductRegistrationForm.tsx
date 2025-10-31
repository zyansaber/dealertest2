// src/components/ProductRegistrationForm.tsx
import React, { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { saveHandover } from "@/lib/firebase";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

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
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "pt", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth - 48; // 24px margin each side
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(imgData, "PNG", 24, 24, imgWidth, Math.min(imgHeight, pageHeight - 48));
    pdf.save(`handover_${data.chassis}.pdf`);
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
          <DialogTitle className="text-2xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-blue-700 to-sky-600">
            Professional Handover Form
          </DialogTitle>
        </DialogHeader>

        {step === "assist" && (
          <div className="space-y-5">
            <div ref={printRef} className="rounded-xl border bg-white/80 p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
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

              <div className="mt-4 pt-4 border-t">
                <div className="text-base font-semibold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-blue-700 to-sky-600">
                  Customer Information
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mt-2">
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
