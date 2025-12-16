// src/components/ProductRegistrationForm.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { app, saveHandover, subscribeDealerConfig } from "@/lib/firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  AU_STATE,
  BRAND_OPTIONS,
  COUNTRY,
  DEALERSHIP_PURCHASED_FROM,
  DEALERSHIP_PURCHASED_FROM_NEWGEN,
  DEALERSHIP_PURCHASED_FROM_REGENT,
  DEALERSHIP_PURCHASED_FROM_SNOWY,
  EMPTY_STATE,
  NEWGEN_MODEL,
  RegionOption,
  REGENT_MODEL,
  SNOWY_MODEL,
  ALL_DEALERSHIP_OPTIONS,
} from "@/constants/productRegistrationOptions";

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
  if (upper.startsWith("RD") || upper.startsWith("RC")) return "Regent";
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

  const [customerExtras, setCustomerExtras] = useState({
    originType: "Z01",
    lifecycleStage: "Customer",
    formNameSapSync: "[SNOWYRIVER] Product Registration",
    formsSubmitted: "Product Registration Form",
    source: "webapp",
  });

  const [callableResult, setCallableResult] = useState<string>("");
  const [callableUploadResult, setCallableUploadResult] = useState<string>("");
  const [chainedStatus, setChainedStatus] = useState<string>("");
  const [customerDetailsResult, setCustomerDetailsResult] = useState<string>("");
  const [customerJobId, setCustomerJobId] = useState<string>("");
  const [customerJobStatus, setCustomerJobStatus] = useState<string>("");

  const [proofPayload, setProofPayload] = useState<UploadProofPayload>({
    fileName: "proof-of-purchase.pdf",
    base64Data: "",
    productRegisteredId: "",
  });
  const [proofFile, setProofFile] = useState<File | null>(null);

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

  const getCustomerDetailsJobFn = useMemo(
    () => httpsCallable<{ jobId: string }, CustomerDetailsJob>(functions, "getPostCustomerDetailsJob"),
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

  const regionOptions = useMemo(() => regionOptionsByCountry(sharedForm.country), [sharedForm.country]);
  const selectedRegion = useMemo(
    () => regionOptions.find((option) => option.customerValue === sharedForm.regionCode),
    [regionOptions, sharedForm.regionCode],
  );

  const modelOptions = useMemo(() => {
    const opts = (() => {
      switch (sharedForm.brand) {
        case "Snowy":
          return SNOWY_MODEL;
        case "Newgen":
          return NEWGEN_MODEL;
        case "Regent":
          return REGENT_MODEL;
        default:
          return [{ label: "Select", value: "" }];
      }
    })();
    if (sharedForm.model && !opts.some((o) => o.value === sharedForm.model)) {
      return [{ label: sharedForm.model, value: sharedForm.model }, ...opts];
    }
    return opts;
  }, [sharedForm.brand, sharedForm.model]);

  const dealershipOptions = useMemo(() => {
    const base = (() => {
      switch (sharedForm.brand) {
        case "Snowy":
          return DEALERSHIP_PURCHASED_FROM_SNOWY;
        case "Newgen":
          return DEALERSHIP_PURCHASED_FROM_NEWGEN;
        case "Regent":
          return DEALERSHIP_PURCHASED_FROM_REGENT;
        default:
          return DEALERSHIP_PURCHASED_FROM;
      }
    })();
    if (sharedForm.dealershipCode && !base.some((o) => o.value === sharedForm.dealershipCode)) {
      const fallback = ALL_DEALERSHIP_OPTIONS.find((o) => o.value === sharedForm.dealershipCode);
      if (fallback) return [fallback, ...base];
      return [{ label: sharedForm.dealershipCode, value: sharedForm.dealershipCode }, ...base];
    }
    return base;
  }, [sharedForm.brand, sharedForm.dealershipCode]);

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

  const handleBrandChange = (value: string) => {
    setSharedForm((prev) => ({ ...prev, brand: value, model: "", dealershipCode: preferredDealershipValue || "" }));
  };

  const handleProofFileChange = async (file: File | null) => {
    setProofFile(file);
    if (!file) return;
    const base64Data = await toBase64(file);
    setProofPayload((prev) => ({ ...prev, base64Data, fileName: file.name }));
  };

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

  const runCallableSubmission = async () => {
    setCallableResult("Submitting via Firebase Function...");
    try {
      const response = await submitProductRegistrationFn(buildProductPayload());
      setCallableResult(JSON.stringify(response.data, null, 2));
      if (response.data.salesforceId) {
        setProofPayload((prev) => ({ ...prev, productRegisteredId: response.data.salesforceId ?? "" }));
      }
    } catch (error: any) {
      const code = error?.code ?? "unknown";
      const message = error?.message ?? String(error);
      setCallableResult(`Error (${code}): ${message}`);
    }
  };

  const runCallableUpload = async () => {
    setCallableUploadResult("Uploading via Firebase Function...");
    try {
      const response = await uploadProofOfPurchaseFn(proofPayload);
      setCallableUploadResult(JSON.stringify(response.data, null, 2));
    } catch (error: any) {
      const code = error?.code ?? "unknown";
      const message = error?.message ?? String(error);
      setCallableUploadResult(`Error (${code}): ${message}`);
    }
  };

  const runChainedSubmissionAndUpload = async () => {
    setChainedStatus("步骤 1/2：通过 Callable 创建 Product_Registered__c...");
    setCallableResult("");
    setCallableUploadResult("");
    try {
      const registrationResponse = await submitProductRegistrationFn(buildProductPayload());
      setCallableResult(JSON.stringify(registrationResponse.data, null, 2));

      const { success, salesforceId } = registrationResponse.data;
      if (!success || !salesforceId) {
        throw new Error("submitProductRegistration 未返回 salesforceId");
      }

      setProofPayload((prev) => ({ ...prev, productRegisteredId: salesforceId }));

      const base64Data = proofPayload.base64Data || "";
      if (!base64Data) {
        throw new Error("请先选择购买凭证文件或填写 base64 内容");
      }

      const uploadPayload: UploadProofPayload = {
        fileName: proofPayload.fileName || "proof-of-purchase",
        base64Data,
        productRegisteredId: salesforceId,
      };

      setChainedStatus(`步骤 2/2：已获得 ${salesforceId}，准备上传购买凭证...`);
      const uploadResponse = await uploadProofOfPurchaseFn(uploadPayload);
      setCallableUploadResult(JSON.stringify(uploadResponse.data, null, 2));
      setChainedStatus("完成：已创建 Product_Registered__c 并上传购买凭证。");
    } catch (error: any) {
      const code = error?.code ?? "unknown";
      const message = error?.message ?? String(error);
      setChainedStatus(`流程失败 (${code}): ${message}`);
    }
  };

  const submitCustomerDetails = async () => {
    setCustomerDetailsResult("Submitting to Firebase queue...");
    try {
      const response = await enqueueCustomerDetailsFn(buildCustomerPayload());
      const { jobId, status } = response.data;
      setCustomerDetailsResult(JSON.stringify(response.data, null, 2));
      setCustomerJobId(jobId);
      setCustomerJobStatus(status);
    } catch (error: any) {
      const code = error?.code ?? "unknown";
      const message = error?.message ?? String(error);
      setCustomerDetailsResult(`Error (${code}): ${message}`);
    }
  };

  const refreshCustomerJobStatus = async () => {
    if (!customerJobId) {
      setCustomerJobStatus("请先提交以获得 jobId");
      return;
    }
    setCustomerJobStatus("Checking status...");
    try {
      const response = await getCustomerDetailsJobFn({ jobId: customerJobId });
      setCustomerJobStatus(JSON.stringify(response.data, null, 2));
    } catch (error: any) {
      const code = error?.code ?? "unknown";
      const message = error?.message ?? String(error);
      setCustomerJobStatus(`Error (${code}): ${message}`);
    }
  };

  const phoneOnlyPayload = useMemo(
    () => ({
      Phone_Number__c: sharedForm.phone,
      Phone__c: sharedForm.phone,
      phoneNumber: sharedForm.phone,
      phone: sharedForm.phone,
    }),
    [sharedForm.phone],
  );

  const mobileOnlyPayload = useMemo(
    () => ({
      Mobile_Number__c: sharedForm.mobile,
      Mobile__c: sharedForm.mobile,
      mobileNumber: sharedForm.mobile,
      mobile: sharedForm.mobile,
    }),
    [sharedForm.mobile],
  );

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
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Product Registration & Handover</DialogTitle>
        </DialogHeader>

        <div ref={printRef} className="space-y-6">
          <div className="rounded-md border p-4 bg-slate-50">
            <div className="text-sm font-semibold">Vehicle Info (自动填充)</div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
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
                <Label>Handover Date</Label>
                <Input type="date" value={sharedForm.handoverDate} readOnly disabled className="bg-slate-100" />
              </div>
              <div>
                <Label>Dealer (SAP code)</Label>
                <Select
                  value={sharedForm.dealershipCode}
                  onValueChange={(v) => handleSharedChange("dealershipCode", v)}
                  disabled={!preferredDealershipValue}
                >
                  <SelectTrigger className="bg-slate-100">
                    <SelectValue placeholder="Select dealership" />
                  </SelectTrigger>
                  <SelectContent>
                    {dealershipOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!preferredDealershipValue && (
                  <p className="text-xs text-amber-600 mt-1">Admin 未设置 SAP code 时允许手动选择。</p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-md border p-4">
            <div className="text-sm font-semibold">客户信息</div>
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
                <Label>Email（必填）</Label>
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
                <Select value={sharedForm.regionCode} onValueChange={(v) => handleSharedChange("regionCode", v)}>
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

          <div className="rounded-md border p-4">
            <div className="text-sm font-semibold">品牌与经销商</div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label>Brand</Label>
                <Select value={sharedForm.brand} onValueChange={handleBrandChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select brand" />
                  </SelectTrigger>
                  <SelectContent>
                    {BRAND_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Model</Label>
                <Select value={sharedForm.model} onValueChange={(v) => handleSharedChange("model", v)} disabled>
                  <SelectTrigger className="bg-slate-100">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {modelOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500 mt-1">Model 由库存自动填充。</p>
              </div>
              <div>
                <Label>Dealership（SAP code）</Label>
                <Select
                  value={sharedForm.dealershipCode}
                  onValueChange={(v) => handleSharedChange("dealershipCode", v)}
                  disabled={Boolean(preferredDealershipValue)}
                >
                  <SelectTrigger className={preferredDealershipValue ? "bg-slate-100" : undefined}>
                    <SelectValue placeholder="Select dealership" />
                  </SelectTrigger>
                  <SelectContent>
                    {dealershipOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500 mt-1">
                  {preferredDealershipValue
                    ? "Admin 已指定默认经销商，可直接使用"
                    : "Admin 未指定时可手动选择"}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-md border p-4 bg-white">
            <div className="text-sm font-semibold">Firebase Callable：Product Registration & Proof Upload</div>
            <p className="text-xs text-muted-foreground mt-1">
              使用当前表单生成 payload；State/Region 自动匹配 Salesforce 需要的前缀，购买凭证上传会使用返回的 Product_Registered__c Id。
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label>Product_Registered__c Id（自动填充）</Label>
                <Input
                  value={proofPayload.productRegisteredId}
                  onChange={(e) => setProofPayload((prev) => ({ ...prev, productRegisteredId: e.target.value }))}
                  placeholder="来自 submitProductRegistration 的 salesforceId"
                />
              </div>
              <div>
                <Label>凭证文件名</Label>
                <Input
                  value={proofPayload.fileName}
                  onChange={(e) => setProofPayload((prev) => ({ ...prev, fileName: e.target.value }))}
                />
              </div>
              <div>
                <Label>选择凭证文件（会转 base64）</Label>
                <Input type="file" onChange={(e) => handleProofFileChange(e.target.files?.[0] ?? null)} />
                <span className="text-xs text-muted-foreground">{proofFile?.name ?? "No file selected"}</span>
              </div>
              <div>
                <Label>或直接粘贴 base64</Label>
                <Textarea
                  rows={3}
                  value={proofPayload.base64Data}
                  onChange={(e) => setProofPayload((prev) => ({ ...prev, base64Data: e.target.value }))}
                />
              </div>
            </div>

            <div className="mt-3 rounded-md border bg-slate-50 p-3 text-sm">
              <div className="font-semibold">电话字段检查</div>
              <pre className="mt-2 whitespace-pre-wrap break-words text-xs">{JSON.stringify(phoneOnlyPayload, null, 2)}</pre>
            </div>
            <div className="mt-3 rounded-md border bg-slate-50 p-3 text-sm">
              <div className="font-semibold">手机字段检查</div>
              <pre className="mt-2 whitespace-pre-wrap break-words text-xs">{JSON.stringify(mobileOnlyPayload, null, 2)}</pre>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={runCallableSubmission} type="button">
                仅提交 Product_Registered__c
              </Button>
              <Button className="bg-purple-600 hover:bg-purple-700" onClick={runCallableUpload} type="button">
                仅上传购买凭证
              </Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={runChainedSubmissionAndUpload} type="button">
                提交注册并上传凭证（串联）
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="text-sm font-semibold">submitProductRegistration 返回</div>
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-100 p-3 text-xs text-slate-800">{callableResult || "等待提交"}</pre>
              </div>
              <div>
                <div className="text-sm font-semibold">uploadProofOfPurchase 返回</div>
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-100 p-3 text-xs text-slate-800">{callableUploadResult || "等待上传"}</pre>
                {chainedStatus && <p className="mt-2 text-xs text-slate-700">{chainedStatus}</p>}
              </div>
            </div>
          </div>

          <div className="rounded-md border p-4 bg-white">
            <div className="text-sm font-semibold">Customer Details → Firebase Callable + Cloud Tasks</div>
            <p className="text-xs text-muted-foreground mt-1">使用同一套字段；State_AU__c / State_NZ__c 使用无前缀的值。</p>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label>Origin_Type</Label>
                <Input value={customerExtras.originType} onChange={(e) => setCustomerExtras((prev) => ({ ...prev, originType: e.target.value }))} />
              </div>
              <div>
                <Label>Lifecycle_Stage</Label>
                <Input value={customerExtras.lifecycleStage} onChange={(e) => setCustomerExtras((prev) => ({ ...prev, lifecycleStage: e.target.value }))} />
              </div>
              <div>
                <Label>Form_Name_SAP_Sync</Label>
                <Input value={customerExtras.formNameSapSync} onChange={(e) => setCustomerExtras((prev) => ({ ...prev, formNameSapSync: e.target.value }))} />
              </div>
              <div>
                <Label>Forms_Submitted</Label>
                <Input value={customerExtras.formsSubmitted} onChange={(e) => setCustomerExtras((prev) => ({ ...prev, formsSubmitted: e.target.value }))} />
              </div>
              <div>
                <Label>source</Label>
                <Input value={customerExtras.source} onChange={(e) => setCustomerExtras((prev) => ({ ...prev, source: e.target.value }))} />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <Button className="bg-blue-600 hover:bg-blue-700" onClick={submitCustomerDetails} type="button">
                提交 Customer Details
              </Button>
              <Button className="bg-slate-700 hover:bg-slate-800" onClick={refreshCustomerJobStatus} type="button">
                查询队列状态
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="text-sm font-semibold">enqueuePostCustomerDetails 返回</div>
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-100 p-3 text-xs text-slate-800">{customerDetailsResult || "等待提交"}</pre>
              </div>
              <div>
                <div className="text-sm font-semibold">getPostCustomerDetailsJob 返回</div>
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-100 p-3 text-xs text-slate-800">{customerJobStatus || "等待查询"}</pre>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleDownloadPDF} type="button">
              Download PDF
            </Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700" disabled={submitting || !canSubmitHandover()} onClick={handleSubmitAssist} type="button">
              {submitting ? "Submitting..." : "保存 Handover 记录"}
            </Button>
            {submitMsg && <span className="text-sm text-slate-600">{submitMsg}</span>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
