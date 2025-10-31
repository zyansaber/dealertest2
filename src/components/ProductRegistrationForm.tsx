// src/components/ProductRegistrationForm.tsx
import React, { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

type RegistrationData = {
  chassis: string;
  model?: string | null;
  dealerName?: string | null;
  handoverAt: string; // ISO
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode?: "choose" | "assist" | "email";
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
  const printRef = useRef<HTMLDivElement>(null);

  const data = useMemo(() => {
    return initial ?? {
      chassis: "",
      model: "",
      dealerName: "",
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

  const resetAndClose = () => {
    setStep("choose");
    setEmailTo("");
    setFirstName("");
    setLastName("");
    setCustEmail("");
    setPhone("");
    setAddress("");
    onOpenChange(false);
  };

  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1000,height=800");
    if (!printWindow) return;
    const styles = `
      <style>
        body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; padding: 24px; color: #0f172a; }
        h1 { font-size: 20px; margin: 0 0 12px 0; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
        .label { font-size: 12px; color: #475569; }
        .value { font-size: 14px; font-weight: 600; color: #0f172a; }
        .section { margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
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

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setStep("choose") : resetAndClose())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="bg-clip-text text-transparent bg-gradient-to-r from-slate-800 via-blue-700 to-sky-600">
            Product Registration Form
          </DialogTitle>
        </DialogHeader>

        {step === "choose" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              请选择注册方式：发送邮件让客户自行填写，或由经销商代客户完成。
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card className="hover:shadow-md transition backdrop-blur-sm bg-white/80">
                <CardHeader>
                  <CardTitle className="text-sm">发送邮件给客户</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Label htmlFor="emailTo">Customer Email</Label>
                  <Input id="emailTo" placeholder="customer@example.com" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} />
                  <p className="text-xs text-slate-500">提交后将发送链接，客户可自行填写。</p>
                  <Button className="bg-sky-600 hover:bg-sky-700" disabled={!emailTo} onClick={() => setStep("email")}>
                    下一步
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition backdrop-blur-sm bg-white/80">
                <CardHeader>
                  <CardTitle className="text-sm">经销商协助填写</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-slate-500">由经销商现场协助客户完成登记。</p>
                  <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setStep("assist")}>开始</Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

      <DialogFooter />

        {step === "email" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">已准备发送注册邀请到：</p>
            <div className="text-sm font-medium">{emailTo}</div>
            <p className="text-xs text-slate-500">
              邮件发送功能可后续接入（当前为流程预览）。你可以返回选择“经销商协助填写”继续。
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setStep("choose")}>返回</Button>
              <Button className="bg-sky-600 hover:bg-sky-700" onClick={resetAndClose}>完成</Button>
            </div>
          </div>
        )}

        {step === "assist" && (
          <div className="space-y-4">
            <div ref={printRef}>
              <h1>Product Registration</h1>
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
                <h1>Customer Information</h1>
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

            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setStep("choose")}>返回</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handlePrint}>打印 PDF</Button>
              <Button className="bg-sky-600 hover:bg-sky-700" onClick={resetAndClose}>完成</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
