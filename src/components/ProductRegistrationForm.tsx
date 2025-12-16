// src/components/ProductRegistrationForm.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { app, saveHandover, subscribeDealerConfig } from "@/lib/firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  ALL_DEALERSHIP_OPTIONS,
  AU_STATE,
  COUNTRY,
  EMPTY_STATE,
  NZ_STATE,
  RegionOption,

// Types aligned with Salesforce test bench
export type ProductRegistrationData = {
  First_Name__c?: string;
  Last_Name__c?: string;
  Email__c: string;
  Mobile_Number__c?: string;
  Mobile__c?: string;
  Phone_Number__c?: string;
  Phone__c?: string;
  Street_Address__c?: string;
  Suburb__c?: string;
  Sync_with_SAP__c?: string;
  Country__c?: string;
  Postcode__c?: string;
  State_Region__c?: string;
  Chassis_Number__c: string;
  Brand__c?: string;
  Model__c?: string;
  Dealership_Purchased_From__c?: string;
  Handover_Date__c?: string;
  VIN__c?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  mobileNumber?: string;
  mobile?: string;
  phoneNumber?: string;
  phone?: string;
  streetAddress?: string;
  suburb?: string;
  syncWithSap?: string;
  country?: string;
  postcode?: string;
  stateRegion?: string;
  chassisNumber?: string;
  brand?: string;
  model?: string;
  dealershipPurchasedFrom?: string;
  handoverDate?: string;
  vin?: string;
};

export type SubmitProductRegistrationResult = {
  success: boolean;
  salesforceId?: string;
};

type UploadProofPayload = {
  fileName: string;
  base64Data: string;
  productRegisteredId: string;
};

type UploadProofOfPurchaseResponse = {
  success: boolean;
  contentVersionId?: string;
};

type CustomerDetailsPayload = {
  Email__c: string;
  First_Name__c?: string;
  Last_Name__c?: string;
  Mobile_Number__c?: string;
  Handover_Date__c?: string;
  Model__c?: string;
  Country__c?: string;
  State_AU__c?: string;
  State_NZ__c?: string;
  Postcode__c?: string;
  Dealership_Purchased_From__c?: string;
  Brand?: string;
  Origin_Type?: string;
  Lifecycle_Stage?: string;
  Form_Name_SAP_Sync?: string;
  Forms_Submitted?: string;
  source?: string;
  chassisNumber?: string;
};

type CustomerDetailsJob = {
  jobId: string;
  status: "queued" | "processing" | "success" | "failed";
  attempts?: number;
  updatedAt?: string;
  lastError?: string | null;
  lastHttpStatus?: number | null;
  lastSuccessAt?: string | null;
};

type RegistrationData = {
  chassis: string;
  model?: string | null;
  dealerName?: string | null;
  dealerSlug?: string | null;
  handoverAt: string;
  vinnumber?: string | null;
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
    jspdf?: any;
    jsPDF?: any;
  }
}

const PDF_MARGIN = 32;

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

  if (!window.html2canvas) {
    await loadScript("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js");
  }
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

const isoDateToInput = (value?: string | null) => {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return "";
  }
};

const guessBrand = (model?: string | null) => {
  if (!model) return "";
  const upper = model.toUpperCase();
  if (upper.startsWith("SRC") || upper.startsWith("SRT") || upper.startsWith("SRP") || upper.startsWith("SRL") || upper.startsWith("SRV") || upper.startsWith("SRH")) {
    return "Snowy";
  }
  if (upper.startsWith("NG")) return "Newgen";
  if (upper.startsWith("1") || upper.startsWith("2")) return "Regent";
  return "";
};

const regionOptionsByCountry = (country: string): RegionOption[] => {
  if (country === "AU") return AU_STATE;
  if (country === "NZ") return NZ_STATE;
  return EMPTY_STATE;
};

export default function ProductRegistrationForm({ open, onOpenChange, initial, onCompleted }: Props) {
  const [dealerConfig, setDealerConfig] = useState<any>(null);
  const [sharedForm, setSharedForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    phone: "",
    handoverDate: isoDateToInput(initial?.handoverAt),
    chassisNumber: initial?.chassis ?? "",
    brand: guessBrand(initial?.model),
    model: initial?.model ?? "",
    country: "AU",
    regionCode: "",
    postcode: "",
    dealershipCode: "",
    streetAddress: "",
    suburb: "",
    vin: initial?.vinnumber ?? "",
  });

  const customerExtras = useMemo(
    () => ({
      originType: "Z01",
      lifecycleStage: "Customer",
      formNameSapSync: "[SNOWYRIVER] Product Registration",
      formsSubmitted: "Product Registration Form",
      source: "webapp",
    }),
    [],
  );

  const [chainedStatus, setChainedStatus] = useState<string>("");

  const [proofPayload, setProofPayload] = useState<UploadProofPayload>({
    fileName: "proof-of-purchase.pdf",
    base64Data: "",
    productRegisteredId: "",
  });
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const functions = useMemo(() => getFunctions(app, "us-central1"), []);

  const submitProductRegistrationFn = useMemo(
    () => httpsCallable<ProductRegistrationData, SubmitProductRegistrationResult>(functions, "submitProductRegistration"),
    [functions],
  );

  const uploadProofOfPurchaseFn = useMemo(
    () => httpsCallable<UploadProofPayload, UploadProofOfPurchaseResponse>(functions, "uploadProofOfPurchase"),
    [functions],
  );

  const enqueueCustomerDetailsFn = useMemo(
    () => httpsCallable<CustomerDetailsPayload, CustomerDetailsJob>(functions, "enqueuePostCustomerDetails"),
    [functions],
  );

  useEffect(() => {
    if (!initial?.dealerSlug) return;
    const unsub = subscribeDealerConfig(initial.dealerSlug, (cfg) => setDealerConfig(cfg));
    return () => unsub();
  }, [initial?.dealerSlug]);

  const preferredDealershipValue = dealerConfig?.productRegistrationDealerName ?? "";

  useEffect(() => {
    setSharedForm((prev) => ({
      ...prev,
      chassisNumber: initial?.chassis ?? prev.chassisNumber,
      model: initial?.model ?? prev.model,
      vin: initial?.vinnumber ?? prev.vin,
      handoverDate: isoDateToInput(initial?.handoverAt) || prev.handoverDate,
      dealershipCode: prev.dealershipCode || preferredDealershipValue,
      brand: prev.brand || guessBrand(initial?.model),
    }));
  }, [initial?.chassis, initial?.model, initial?.vinnumber, initial?.handoverAt, preferredDealershipValue]);

  useEffect(() => {
    const guessed = guessBrand(sharedForm.model);
    setSharedForm((prev) => (guessed && prev.brand !== guessed ? { ...prev, brand: guessed } : prev));
  }, [sharedForm.model]);

  const regionOptions = useMemo(() => regionOptionsByCountry(sharedForm.country), [sharedForm.country]);
  const selectedRegion = useMemo(
    () => regionOptions.find((option) => option.customerValue === sharedForm.regionCode),
    [regionOptions, sharedForm.regionCode],
  );

  const dealershipLabel = useMemo(() => {
    const opt = ALL_DEALERSHIP_OPTIONS.find((o) => o.value === sharedForm.dealershipCode);
    if (opt) return opt.label;
    return sharedForm.dealershipCode || "Not set";
  }, [sharedForm.dealershipCode]);

  const toBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === "string") {
          const base64 = result.split(",")[1];
          resolve(base64 ?? "");
        } else {
          reject(new Error("Unable to read file"));
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });

  const handleSharedChange = (key: keyof typeof sharedForm, value: string) => {
    setSharedForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCountryChange = (value: string) => {
    setSharedForm((prev) => ({ ...prev, country: value, regionCode: "" }));
  };

  const handleProofFileChange = async (file: File | null) => {
    setProofFile(file);
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    if (!file) {
      setFilePreviewUrl(null);
      setProofPayload((prev) => ({ ...prev, base64Data: "" }));
      return;
    }
    const base64Data = await toBase64(file);
    setFilePreviewUrl(URL.createObjectURL(file));
    setProofPayload((prev) => ({ ...prev, base64Data, fileName: file.name }));
  };

  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  const buildProductPayload = (): ProductRegistrationData => ({
    First_Name__c: sharedForm.firstName,
    Last_Name__c: sharedForm.lastName,
    Email__c: sharedForm.email,
    Mobile_Number__c: sharedForm.mobile,
    Mobile__c: sharedForm.mobile,
    Phone_Number__c: sharedForm.phone,
    Phone__c: sharedForm.phone,
    Street_Address__c: sharedForm.streetAddress,
    Suburb__c: sharedForm.suburb,
    Sync_with_SAP__c: "true",
    Country__c: sharedForm.country,
    Postcode__c: sharedForm.postcode,
    State_Region__c: selectedRegion?.productValue ?? "",
    Chassis_Number__c: sharedForm.chassisNumber,
    Brand__c: sharedForm.brand,
    Model__c: sharedForm.model,
    Dealership_Purchased_From__c: sharedForm.dealershipCode,
    Handover_Date__c: sharedForm.handoverDate,
    VIN__c: sharedForm.vin,
    firstName: sharedForm.firstName,
    lastName: sharedForm.lastName,
    email: sharedForm.email,
    mobileNumber: sharedForm.mobile,
    mobile: sharedForm.mobile,
    phoneNumber: sharedForm.phone,
    phone: sharedForm.phone,
    streetAddress: sharedForm.streetAddress,
    suburb: sharedForm.suburb,
    syncWithSap: "true",
    country: sharedForm.country,
    postcode: sharedForm.postcode,
    stateRegion: selectedRegion?.productValue ?? "",
    chassisNumber: sharedForm.chassisNumber,
    brand: sharedForm.brand,
    model: sharedForm.model,
    dealershipPurchasedFrom: sharedForm.dealershipCode,
    handoverDate: sharedForm.handoverDate,
    vin: sharedForm.vin,
  });

  const buildCustomerPayload = (): CustomerDetailsPayload => ({
    Email__c: sharedForm.email,
    First_Name__c: sharedForm.firstName,
    Last_Name__c: sharedForm.lastName,
    Mobile_Number__c: sharedForm.mobile,
    Handover_Date__c: sharedForm.handoverDate,
    Model__c: sharedForm.model,
    Country__c: sharedForm.country,
    State_AU__c: sharedForm.country === "AU" ? selectedRegion?.customerValue ?? "" : "",
    State_NZ__c: sharedForm.country === "NZ" ? selectedRegion?.customerValue ?? "" : "",
    Postcode__c: sharedForm.postcode,
    Dealership_Purchased_From__c: sharedForm.dealershipCode,
    Brand: sharedForm.brand,
    Origin_Type: customerExtras.originType,
    Lifecycle_Stage: customerExtras.lifecycleStage,
    Form_Name_SAP_Sync: customerExtras.formNameSapSync,
    Forms_Submitted: customerExtras.formsSubmitted,
    source: customerExtras.source,
    chassisNumber: sharedForm.chassisNumber,
  });

  const runChainedSubmissionAndUpload = async () => {
    setChainedStatus("Step 1/2: create Product_Registered__c via callable...");
    try {
      const registrationResponse = await submitProductRegistrationFn(buildProductPayload());

      const { success, salesforceId } = registrationResponse.data;
      if (!success || !salesforceId) {
        throw new Error("submitProductRegistration did not return salesforceId");
      }

      setProofPayload((prev) => ({ ...prev, productRegisteredId: salesforceId }));

      const base64Data = proofPayload.base64Data || "";
      if (!base64Data) {
        throw new Error("Please select a proof file");
      }

      const uploadPayload: UploadProofPayload = {
        fileName: proofPayload.fileName || "proof-of-purchase",
        base64Data,
        productRegisteredId: salesforceId,
      };

      setChainedStatus(`Step 2/2: received ${salesforceId}, uploading proof...`);
      await uploadProofOfPurchaseFn(uploadPayload);
      setChainedStatus("Done: Product_Registered__c created and proof uploaded.");
      return { salesforceId };
    } catch (error: any) {
      const code = error?.code ?? "unknown";
      const message = error?.message ?? String(error);
      setChainedStatus(`Flow failed (${code}): ${message}`);
      throw error;
    }
  };

  const submitCustomerDetails = async () => {
    const response = await enqueueCustomerDetailsFn(buildCustomerPayload());
    return response.data;
  };

  const handleCombinedSubmit = async () => {
    setSubmitting(true);
    setSubmitMsg("Submitting registration, proof, and customer details...");
    try {
      await runChainedSubmissionAndUpload();
      const customerResponse = await submitCustomerDetails();
      setSubmitMsg(`All steps completed. Customer job status: ${customerResponse.status}`);
    } catch (error: any) {
      const code = error?.code ?? "unknown";
      const message = error?.message ?? String(error);
      setSubmitMsg(`Submit failed (${code}): ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmitHandover = () => {
    const dealerSlug = (initial?.dealerSlug || "").trim();
    return Boolean(
      sharedForm.firstName.trim() &&
        sharedForm.lastName.trim() &&
        sharedForm.email.trim() &&
        sharedForm.phone.trim() &&
        sharedForm.streetAddress.trim() &&
        sharedForm.suburb.trim() &&
        sharedForm.postcode.trim() &&
        sharedForm.chassisNumber.trim() &&
        dealerSlug &&
        (sharedForm.regionCode || selectedRegion?.customerValue)
    );
  };

  const handleSubmitAssist = async () => {
    if (!canSubmitHandover()) {
      setSubmitMsg("Please complete all required fields.");
      return;
    }
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const dealerSlug = (initial?.dealerSlug || "").trim();
      if (!dealerSlug) {
        throw new Error("Dealer slug missing");
      }
      const handoverData = {
        chassis: sharedForm.chassisNumber,
        model: sharedForm.model || null,
        dealerName: initial?.dealerName || dealerConfig?.name || null,
        dealerSlug,
        handoverAt: initial?.handoverAt || new Date().toISOString(),
        vinnumber: sharedForm.vin || null,
        customer: {
          firstName: sharedForm.firstName.trim(),
          lastName: sharedForm.lastName.trim(),
          email: sharedForm.email.trim(),
          phone: sharedForm.phone.trim(),
          address: {
            street: sharedForm.streetAddress.trim(),
            suburb: sharedForm.suburb.trim(),
            country: sharedForm.country === "AU" ? "Australia" : sharedForm.country === "NZ" ? "New Zealand" : sharedForm.country,
            state: sharedForm.regionCode,
            postcode: sharedForm.postcode.trim(),
          },
        },
        createdAt: new Date().toISOString(),
        source: "dealer_assist_form" as const,
      };
      await saveHandover(dealerSlug, sharedForm.chassisNumber, handoverData);
      try {
        await onCompleted?.({ chassis: sharedForm.chassisNumber, dealerSlug });
      } catch (err) {
        console.error("Post-handover completion failed:", err);
      }
      setSubmitMsg("Submitted successfully.");
      setSubmitting(false);
      onOpenChange(false);
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
      const imgWidth = pageWidth - PDF_MARGIN * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, "PNG", PDF_MARGIN, PDF_MARGIN, imgWidth, Math.min(imgHeight, pageHeight - PDF_MARGIN * 2));
      pdf.save(`handover_${sharedForm.chassisNumber || "chassis"}.pdf`);
      setSubmitMsg("PDF downloaded.");
    } catch (err) {
      console.error("PDF generation failed:", err);
      setSubmitMsg("PDF generation failed. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl w-[1200px] md:max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Product Registration & Handover</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">
            Auto-filled vehicle data with slug-based SAP mapping. Submit once to register the product, upload proof, and queue
            customer details.
          </DialogDescription>
        </DialogHeader>

        <div ref={printRef} className="space-y-5">
          <div className="rounded-lg border p-4 bg-slate-50 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold">Vehicle info (locked)</div>
              <p className="text-xs text-slate-600">Values come from the schedule and the Admin SAP mapping for this slug.</p>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <div>
                <Label>Chassis Number</Label>
                <Input value={sharedForm.chassisNumber} readOnly disabled className="bg-slate-100" />
              </div>
              <div>
                <Label>VIN</Label>
                <Input value={sharedForm.vin} readOnly disabled className="bg-slate-100" />
              </div>
              <div>
                <Label>Model</Label>
                <Input value={sharedForm.model} readOnly disabled className="bg-slate-100" />
              </div>
              <div>
                <Label>Brand (auto)</Label>
                <Input value={sharedForm.brand || "Not set"} readOnly disabled className="bg-slate-100" />
              </div>
              <div>
                <Label>Handover Date</Label>
                <Input type="date" value={sharedForm.handoverDate} readOnly disabled className="bg-slate-100" />
              </div>
              <div>
                <Label>Dealer (SAP code)</Label>
                <Input value={dealershipLabel} readOnly disabled className="bg-slate-100" />
                <p className="text-xs text-slate-500 mt-1">Configured per slug in Admin → Dealer (SAP code).</p>
              </div>
            </div>
          </div>

          <div className="rounded-md border p-4">
            <div className="text-sm font-semibold">Customer Information</div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label>First Name</Label>
                <Input value={sharedForm.firstName} onChange={(e) => handleSharedChange("firstName", e.target.value)} />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input value={sharedForm.lastName} onChange={(e) => handleSharedChange("lastName", e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>Email (required)</Label>
                <Input value={sharedForm.email} onChange={(e) => handleSharedChange("email", e.target.value)} placeholder="john@test.com" />
              </div>
              <div>
                <Label>Mobile</Label>
                <Input value={sharedForm.mobile} onChange={(e) => handleSharedChange("mobile", e.target.value)} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={sharedForm.phone} onChange={(e) => handleSharedChange("phone", e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>Street Address</Label>
                <Input value={sharedForm.streetAddress} onChange={(e) => handleSharedChange("streetAddress", e.target.value)} />
              </div>
              <div>
                <Label>Suburb</Label>
                <Input value={sharedForm.suburb} onChange={(e) => handleSharedChange("suburb", e.target.value)} />
              </div>
              <div>
                <Label>Country</Label>
                <Select value={sharedForm.country} onValueChange={handleCountryChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>State / Region</Label>
                <Select value={sharedForm.regionCode || undefined} onValueChange={(v) => handleSharedChange("regionCode", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select state / region" />
                  </SelectTrigger>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>State / Region</Label>
                <Select value={sharedForm.regionCode || undefined} onValueChange={(v) => handleSharedChange("regionCode", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select state / region" />
                  </SelectTrigger>
                  <SelectContent>
                    {regionOptions.map((option) => (
                      <SelectItem key={`${option.productValue}-${option.customerValue}`} value={option.customerValue}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Postcode</Label>
                <Input value={sharedForm.postcode} onChange={(e) => handleSharedChange("postcode", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-4 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold">Proof of purchase & submission</div>
              <p className="text-xs text-muted-foreground">One click submits registration, proof upload, and customer queue.</p>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-2">
                <Label>Upload proof file</Label>
                <Input type="file" onChange={(e) => handleProofFileChange(e.target.files?.[0] ?? null)} />
                <div className="text-xs text-muted-foreground">{proofFile?.name ?? "No file selected"}</div>
                <p className="text-xs text-slate-500">File name and registration id are handled automatically.</p>
              </div>
              {filePreviewUrl && (
                <div className="rounded border bg-slate-50 p-3">
                  <div className="text-xs font-semibold">File preview</div>
                  {proofFile?.type?.startsWith("image/") ? (
                    <img src={filePreviewUrl} alt="Proof preview" className="mt-2 max-h-48 w-full object-contain rounded" />
                  ) : (
                    <p className="mt-2 text-xs text-slate-600">Preview available after selection (non-image files will download when opened).</p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={submitting} onClick={handleCombinedSubmit} type="button">
                {submitting ? "Submitting..." : "Submit"}
              </Button>
              {submitMsg && <span className="text-xs text-slate-600">{submitMsg}</span>}
            </div>

            {submitMsg && (
              <div className="mt-3 rounded-md border bg-slate-50 p-3 text-xs text-slate-800">
                <div className="font-semibold">Submit status</div>
                <p className="mt-1 whitespace-pre-wrap break-words">{submitMsg}</p>
                {chainedStatus && <p className="mt-1 text-slate-600">{chainedStatus}</p>}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleDownloadPDF} type="button">
              Download PDF
            </Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700" disabled={submitting || !canSubmitHandover()} onClick={handleSubmitAssist} type="button">
              {submitting ? "Submitting..." : "Save handover record"}
            </Button>
            {submitMsg && <span className="text-sm text-slate-600">{submitMsg}</span>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
