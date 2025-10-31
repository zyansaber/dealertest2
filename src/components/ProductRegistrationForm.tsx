// src/components/ProductRegistrationForm.tsx
import React, { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { saveProductRegistration } from "@/lib/firebase";

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
  const [step, setStep] = useState<"choose" | "assist" | "email">("choose");
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
    setStep("choose");
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

  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1000,height=800");
    if (!printWindow) return;
    const styles = `
      <style>
        :root {
          color-scheme: light dark;
        }
        body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; padding: 32px; color: #0f172a; background: #fff; }
        h1 { font-size: 22px; margin: 0 0 12px 0; letter-spacing: 0.2px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; }
        .label { font-size: 12px; color: #475569; letter-spacing: 0.3px; }
        .value { font-size: 14px; font-weight: 600; color: #0f172a; }
        .section { margin-top: 16px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
      </style>
    `;
    printWindow.document.write(`
      <!doctype html><html><head><meta charset="utf-8" />${styles}</head><body>
        ${el.innerHTML}
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  const canSubmit = () => {
    return Boolean(firstName && lastName && custEmail && phone && address);
  };

  const handleSubmitAssist = async () => {
    if (!canSubmit()) {
      setSubmitMsg("Please complete all customer fields before submitting.");
      return;
    }
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      await saveProductRegistration(
        (data.dealerSlug || "") as string,
        data.chassis,
        {
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
          method: "dealer_assist",
        }
      );
      setSubmitMsg("Registration saved to Firebase successfully.");
      setSubmitting(false);
    } catch (e) {
      console.error(e);
      setSubmitMsg("Failed to save registration. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setStep("choose") : resetAndClose())}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-blue-700 to-sky-600">
            Product Registration Form
          </DialogTitle>
        </DialogHeader>

        {step === "choose" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Choose registration method: send an email for customer self-service, or dealer-assisted completion.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card className="hover:shadow-md transition backdrop-blur-sm bg-white/80">
                <CardHeader>
                  <CardTitle className="text-sm">Send Email to Customer</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Label htmlFor="emailTo">Customer Email</Label>
                  <Input id="emailTo" placeholder="customer@example.com" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} />
                  <p className="text-xs text-slate-500">This will send a link for the customer to complete the form.</p>
                  <Button className="bg-sky-600 hover:bg-sky-700" disabled={!emailTo} onClick={() => setStep("email")}>
                    Next
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition backdrop-blur-sm bg-white/80">
                <CardHeader>
                  <CardTitle className="text-sm">Dealer-Assisted Registration</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-slate-500">Complete the registration with the customer on-site.</p>
                  <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setStep("assist")}>Start</Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {step === "email" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Prepared to send registration invite to:</p>
            <div className="text-sm font-medium">{emailTo}</div>
            <p className="text-xs text-slate-500">
              Email sending can be integrated later. You can go back and choose "Dealer-Assisted Registration" to proceed now.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setStep("choose")}>Back</Button>
              <Button className="bg-sky-600 hover:bg-sky-700" onClick={resetAndClose}>Done</Button>
            </div>
          </div>
        )}

        {step === "assist" && (
          <div className="space-y-4">
            <div ref={printRef} className="rounded-lg border bg-white/70 p-4">
              <h1 className="bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-blue-700 to-sky-600">Product Registration</h1>
              <div className="grid">
                <div>
                  <div className="label">Dealer</div>
                  <div className="value">{data.dealerName || "-"}</div>
                </div>
                <div>
                  <div className="label">Handover Date</div>
                  <div className="value">{handoverDateStr}</div>
                </div>
                <div>
                  <div className="label">Chassis</div>
                  <div className="value">{data.chassis}</div>
                </div>
                <div>
                  <div className="label">Model</div>
                  <div className="value">{data.model || "-"}</div>
                </div>
              </div>

              <div className="section">
                <h1 className="bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-blue-700 to-sky-600">Customer Information</h1>
                <div className="grid">
                  <div>
                    <div className="label">First Name</div>
                    <div className="value">{firstName || "-"}</div>
                  </div>
                  <div>
                    <div className="label">Last Name</div>
                    <div className="value">{lastName || "-"}</div>
                  </div>
                  <div>
                    <div className="label">Email</div>
                    <div className="value">{custEmail || "-"}</div>
                  </div>
                  <div>
                    <div className="label">Phone</div>
                    <div className="value">{phone || "-"}</div>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div className="label">Home Address</div>
                    <div className="value">{address || "-"}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={custEmail} onChange={(e) => setCustEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Home Address</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setStep("choose")}>Back</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handlePrint}>Print PDF</Button>
              <Button
                className="bg-indigo-600 hover:bg-indigo-700"
                disabled={submitting || !canSubmit()}
                onClick={handleSubmitAssist}
              >
                {submitting ? "Saving..." : "Save to Firebase"}
              </Button>
              <Button className="bg-sky-600 hover:bg-sky-700" onClick={resetAndClose}>Done</Button>
              {submitMsg && <span className="text-sm text-slate-600">{submitMsg}</span>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
