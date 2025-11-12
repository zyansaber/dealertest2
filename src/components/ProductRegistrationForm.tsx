// src/components/ProductRegistrationForm.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  onCompleted?: (handover: { chassis: string; dealerSlug?: string | null }) => void | Promise<void>;
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
const AU_STATES = [
  { value: "ACT", label: "Australian Capital Territory" },
  { value: "NSW", label: "New South Wales" },
  { value: "NT", label: "Northern Territory" },
  { value: "QLD", label: "Queensland" },
  { value: "SA", label: "South Australia" },
  { value: "TAS", label: "Tasmania" },
  { value: "VIC", label: "Victoria" },
  { value: "WA", label: "Western Australia" },
] as const;

const NZ_REGIONS = [
  { value: "Auckland", label: "Auckland" },
  { value: "Bay of Plenty", label: "Bay of Plenty" },
  { value: "Canterbury", label: "Canterbury" },
  { value: "Gisborne", label: "Gisborne" },
  { value: "Hawke's Bay", label: "Hawke's Bay" },
  { value: "Manawatu-Whanganui", label: "Manawatu-Whanganui" },
  { value: "Marlborough", label: "Marlborough" },
  { value: "Nelson", label: "Nelson" },
  { value: "Northland", label: "Northland" },
  { value: "Otago", label: "Otago" },
  { value: "Southland", label: "Southland" },
  { value: "Taranaki", label: "Taranaki" },
  { value: "Tasman", label: "Tasman" },
  { value: "Waikato", label: "Waikato" },
  { value: "Wellington", label: "Wellington" },
  { value: "West Coast", label: "West Coast" },
] as const;

type SupportedCountry = "Australia" | "New Zealand";

const stateOptionsByCountry: Record<SupportedCountry, readonly { value: string; label: string }[]> = {
  Australia: AU_STATES,
  "New Zealand": NZ_REGIONS,
};

export default function ProductRegistrationForm({ open, onOpenChange, initial, onCompleted }: Props) {
  const [country, setCountry] = useState<SupportedCountry>("Australia");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [custEmail, setCustEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [suburb, setSuburb] = useState("");
  const [stateRegion, setStateRegion] = useState("");
  const [postcode, setPostcode] = useState("");
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

  useEffect(() => {
    setStateRegion("");
  }, [country]);

  const resetStates = () => {
    setCountry("Australia");
    setFirstName("");
    setLastName("");
    setCustEmail("");
    setPhone("");
    setStreet("");
    setSuburb("");
    setStateRegion("");
    setPostcode("");
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

  const canSubmit = () => {
    const dealerSlug = (data.dealerSlug || "").trim();
    return Boolean(
      firstName.trim() &&
        lastName.trim() &&
        custEmail.trim() &&
        phone.trim() &&
        street.trim() &&
        suburb.trim() &&
        stateRegion &&
        postcode.trim() &&
        dealerSlug &&
        data.chassis
    );
  };

  const handleSubmitAssist = async () => {
    if (!canSubmit()) {
      setSubmitMsg("Please complete all required fields.");
      return;
    }
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const dealerSlug = (data.dealerSlug || "").trim();
      if (!dealerSlug) {
        throw new Error("Dealer slug missing");
      }
      const trimmedFirstName = firstName.trim();
      const trimmedLastName = lastName.trim();
      const trimmedEmail = custEmail.trim();
      const trimmedPhone = phone.trim();
      const trimmedStreet = street.trim();
      const trimmedSuburb = suburb.trim();
      const trimmedPostcode = postcode.trim();
      const handoverData = {
        chassis: data.chassis,
        model: data.model || null,
        dealerName: data.dealerName || null,
        dealerSlug,
        handoverAt: data.handoverAt,
        customer: {
          firstName: trimmedFirstName,
          lastName: trimmedLastName,
          email: trimmedEmail,
          phone: trimmedPhone,
          address: {
            street: trimmedStreet,
            suburb: trimmedSuburb,
            country,
            state: stateRegion,
            postcode: trimmedPostcode,
          },
        },
        createdAt: new Date().toISOString(),
        source: "dealer_assist_form" as const,
      };
      await saveHandover(dealerSlug, data.chassis, handoverData);
      try {
        await onCompleted?.({ chassis: data.chassis, dealerSlug: data.dealerSlug ?? dealerSlug });
      } catch (err) {
        console.error("Post-handover completion failed:", err);
      }

      setSubmitMsg("Submitted successfully.");
      setSubmitting(false);
      resetAndClose();
    } catch (e) {
      console.error(e);
      const message =
        e instanceof Error && e.message === "Dealer slug missing"
          ? "Dealer information is missing. Please reopen the handover form."
          : "Submit failed. Please try again.";
      setSubmitMsg(message);
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          resetStates();
        }
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-[28px] leading-8 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-blue-700 to-sky-600">
            Product Registration Form
          </DialogTitle>
        </DialogHeader>
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
                  <Label>Street Address</Label>
                  <Input value={street} onChange={(e) => setStreet(e.target.value)} required />
                </div>
                <div>
                  <Label>Suburb</Label>
                  <Input value={suburb} onChange={(e) => setSuburb(e.target.value)} required />
                </div>
                <div>
                  <Label>Country</Label>
                  <Select value={country} onValueChange={(value) => setCountry(value as SupportedCountry)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Australia">Australia</SelectItem>
                      <SelectItem value="New Zealand">New Zealand</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{country === "Australia" ? "State / Territory" : "Region"}</Label>
                  <Select value={stateRegion} onValueChange={(value) => setStateRegion(value)}>
                    <SelectTrigger>
                      <SelectValue placeholder={`Select ${country === "Australia" ? "state or territory" : "region"}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {stateOptionsByCountry[country].map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Postcode</Label>
                  <Input value={postcode} onChange={(e) => setPostcode(e.target.value)} required />
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
      </DialogContent>
    </Dialog>
  );
}
