import { useEffect, useMemo, useState } from "react";
import { FileCheck2, ShieldAlert, ShieldCheck } from "lucide-react";
import emailjs from "emailjs-com";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadDeliveryDocument } from "@/lib/firebase";

const POD_EMAIL_TEMPLATE = "template_br5q8b7";
const EMAIL_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || "";
const EMAIL_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || "";

const YardReceive = () => {
  const [chassis, setChassis] = useState("");
  const [podFile, setPodFile] = useState<File | null>(null);
  const [podPreviewUrl, setPodPreviewUrl] = useState<string | null>(null);
  const [podStatus, setPodStatus] = useState<null | { type: "ok" | "err"; msg: string }>(null);
  const [uploadingPod, setUploadingPod] = useState(false);

  const ocrUrl = useMemo(() => "https://dealer-test.onrender.com/ocr", []);

  const getPodFileExtension = (file: File) => {
    const ext = file.name.split(".").pop();
    if (ext) return ext.toLowerCase();
    if (file.type) {
      const subtype = file.type.split("/")[1];
      if (subtype) return subtype.toLowerCase();
    }
    return "pdf";
  };

  const getPodFileTypeLabel = (file: File) => {
    const extension = getPodFileExtension(file);
    return extension ? extension.toUpperCase() : "FILE";
  };

  useEffect(() => {
    if (!podFile) {
      setPodPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(podFile);
    setPodPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [podFile]);

  const handleUploadAndEmail = async () => {
    const trimmedChassis = chassis.trim().toUpperCase();
    if (!trimmedChassis) {
      setPodStatus({ type: "err", msg: "Please enter a chassis number before uploading." });
      return;
    }
    if (!podFile) {
      setPodStatus({ type: "err", msg: "Please upload a signed POD (PDF or image) before submitting." });
      return;
    }

    setUploadingPod(true);
    setPodStatus(null);

    try {
      const podDownloadUrl = await uploadDeliveryDocument(trimmedChassis, podFile);
      toast.success(`Uploaded signed POD for ${trimmedChassis}.`);

      if (EMAIL_SERVICE_ID && EMAIL_PUBLIC_KEY && podDownloadUrl) {
        try {
          const podExtension = getPodFileExtension(podFile);
          const podFileType = getPodFileTypeLabel(podFile);
          const podFileName = podFile.name.includes(".") ? podFile.name : `${trimmedChassis}.${podExtension}`;
          await emailjs.send(
            EMAIL_SERVICE_ID,
            POD_EMAIL_TEMPLATE,
            {
              chassis: trimmedChassis,
              dealer: "Manual POD upload",
              message: `Signed POD for chassis ${trimmedChassis}`,
              pod_link: podDownloadUrl,
              pod_attachment: podDownloadUrl,
              attachment: podDownloadUrl,
              filename: podFileName,
              pod_filename: podFileName,
              pod_filetype: podFileType,
            },
            EMAIL_PUBLIC_KEY
          );
          toast.success("POD emailed via EmailJS.");
          setPodStatus({ type: "ok", msg: "Upload complete and email sent." });
        } catch (emailErr) {
          console.error("Failed to send POD email", emailErr);
          toast.error("Upload complete but failed to send POD email.");
          setPodStatus({ type: "err", msg: "Upload complete but failed to send POD email." });
        }
      } else if (!EMAIL_SERVICE_ID || !EMAIL_PUBLIC_KEY) {
        toast.info("EmailJS configuration missing, skipped sending POD email.");
        setPodStatus({ type: "ok", msg: "Upload complete. Email configuration missing, skipped email." });
      }
    } catch (e) {
      console.error("manual pod upload failed", e);
      setPodStatus({ type: "err", msg: "Upload failed. Please try again." });
    } finally {
      setUploadingPod(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">Yard Receive — Signed POD Upload</h1>
          <p className="text-sm text-slate-600">
            Upload a signed Proof of Delivery without linking to yard inventory. Enter the chassis number manually before submitting.
          </p>
        </header>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <label className="text-sm font-semibold text-slate-800">Chassis number</label>
          <Input
            className="mt-2 max-w-md"
            value={chassis}
            onChange={(e) => setChassis(e.target.value)}
            placeholder="Enter chassis number"
          />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border bg-gradient-to-b from-white to-slate-50 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-base font-semibold text-slate-900">Signed POD upload</p>
                <p className="text-sm text-slate-600">Attach the signed Proof of Delivery as a PDF or image. The file will be stored with the yard record.</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                <FileCheck2 className="h-3.5 w-3.5" /> Required
              </span>
            </div>

            <div className="mt-4 space-y-4">
              <div className="flex flex-col gap-3 rounded-xl border-2 border-dashed border-slate-200 bg-white p-4 shadow-inner">
                <div className="flex items-start gap-2 text-sm text-slate-700">
                  <ShieldAlert className="mt-0.5 h-4 w-4 text-amber-500" />
                  <div>
                    Please confirm the transport damage pre-check is complete <span className="font-semibold">before</span> the POD is signed and uploaded.
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">Upload checklist</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
                    <li>Clear signature and dealership stamp are visible.</li>
                    <li>Chassis number is written on the POD.</li>
                    <li>Transport pre-check is noted on the document if applicable.</li>
                  </ul>
                </div>
                <Input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setPodFile(file);
                    setPodStatus(null);
                  }}
                />
                {podFile && (
                  <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    <span className="font-semibold">{podFile.name}</span>
                    <span className="text-xs uppercase tracking-wide">{getPodFileTypeLabel(podFile)} Selected</span>
                  </div>
                )}
              </div>

              {podPreviewUrl && (
                <div className="rounded-xl border bg-white p-4 shadow-inner">
                  <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                    <span>File preview</span>
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="mt-3 h-64 overflow-hidden rounded-lg border bg-slate-900/5">
                    {podFile?.type.startsWith("image/") ? (
                      <img src={podPreviewUrl} alt="Signed POD preview" className="h-full w-full object-contain" />
                    ) : (
                      <iframe title="Signed POD preview" src={podPreviewUrl} className="h-full w-full" />
                    )}
                  </div>
                  <p className="mt-2 text-xs text-slate-600">Review the document to ensure the signatures and pre-check notes are legible before submitting.</p>
                </div>
              )}

              {podStatus && (
                <div
                  className={`rounded-md border px-3 py-2 text-sm ${
                    podStatus.type === "ok"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {podStatus.msg}
                </div>
              )}
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                onClick={handleUploadAndEmail}
                disabled={uploadingPod}
              >
                {uploadingPod ? "Uploading..." : "Upload signed POD"}
              </Button>
              <p className="text-xs text-slate-600">This upload does not update yard inventory or receive the unit into stock.</p>
            </div>
          </div>

          <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-center space-y-2">
              <p className="text-base font-semibold text-slate-900">Onsite scan option</p>
              <p className="text-sm text-slate-600">Scan the QR to open the OCR page on a mobile device and capture a signed POD.</p>
            </div>
            <div className="rounded-2xl border bg-slate-50 p-4 shadow-inner">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(ocrUrl)}`}
                alt="OCR QR code"
                className="h-56 w-56 object-contain"
              />
            </div>
            <div className="text-center text-sm text-slate-600 space-y-1">
              <p>
                QR destination:
                <a href={ocrUrl} target="_blank" rel="noreferrer" className="font-semibold text-sky-700 underline ml-1">
                  dealer-test.onrender.com/ocr
                </a>
              </p>
            </div>
            <Button variant="outline" className="w-full" asChild>
              <a href={ocrUrl} target="_blank" rel="noreferrer">
                Open OCR page directly
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default YardReceive;
