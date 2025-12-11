import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent } from "react";
import { Camera, Check, Loader2, PenLine, ScanLine } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { receiveChassisToYard, subscribeToPGIRecords, uploadDeliveryDocument } from "@/lib/firebase";

declare global {
  interface Window {
    jspdf?: any;
    jsPDF?: any;
  }
}

const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL ?? "gemini-2.5-flash";

const inferGeminiApiVersion = (model: string = GEMINI_MODEL): "v1" | "v1beta" => {
  const fromEnv = import.meta.env.VITE_GEMINI_API_VERSION;
  if (fromEnv === "v1" || fromEnv === "v1beta") return fromEnv;
  return /gemini-2(\.|-|$)/i.test(model) ? "v1beta" : "v1";
};

const getGenerativeModel = (ai: { apiKey: string }, { model }: { model: string }) => {
  const apiVersion = inferGeminiApiVersion(model);
  const endpoint = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${ai.apiKey}`;

  return {
    async generateContent(body: any) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "OCR error");
      }

      const payload = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };

      const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";

      return { response: { text: () => text } };
    },
  };
};

const slugifyDealerName = (name?: string | null) =>
  String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const loadScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    const existing = Array.from(document.querySelectorAll("script")).find((s) => s.src.includes(src));
    if (existing) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(s);
  });

const ensureJsPdf = async (): Promise<any> => {
  if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
  if (window.jsPDF) return window.jsPDF;
  await loadScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
  if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
  if (window.jsPDF) return window.jsPDF;
  throw new Error("jsPDF not available after loading");
};

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Image read error"));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Image read error"));
    reader.readAsDataURL(file);
  });

const loadImageElement = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });

const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Image read error"));
        return;
      }
      const base64 = result.split(",")[1];
      if (!base64) {
        reject(new Error("Image encode error"));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Image read error"));
    reader.readAsDataURL(file);
  });

const toOptimizedBase64 = async (file: File) => {
  try {
    const dataUrl = await fileToDataUrl(file);
    const image = await loadImageElement(dataUrl);
    const maxDimension = 1400;
    const largestSide = Math.max(image.width || maxDimension, image.height || maxDimension);
    const scale = Math.min(1, maxDimension / largestSide);

    if (scale < 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext("2d");

      if (ctx) {
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const mimeType = file.type.includes("png") ? "image/png" : "image/jpeg";
        const compressed = canvas.toDataURL(mimeType, mimeType === "image/jpeg" ? 0.82 : undefined);
        const base64 = compressed.split(",")[1];
        if (base64) return base64;
      }
    }
  } catch (error) {
    console.warn("Using original image for OCR", error);
  }

  return toBase64(file);
};

const extractChassis = (text: string) => {
  const regex = /[A-Za-z]{3}[0-9]{6}/g;
  const matches = [...text.matchAll(regex)].map((m) => m[0].toUpperCase());
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const m of matches) {
    if (seen.has(m)) continue;
    seen.add(m);
    unique.push(m);
  }

  const prioritized = unique.sort((a, b) => {
    const aStartsWith2 = a[3] === "2" ? 0 : 1;
    const bStartsWith2 = b[3] === "2" ? 0 : 1;
    if (aStartsWith2 !== bStartsWith2) return aStartsWith2 - bStartsWith2;
    return unique.indexOf(a) - unique.indexOf(b);
  });

  return { best: prioritized[0] ?? null, all: prioritized } as const;
};

const OcrPage = () => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [ocrText, setOcrText] = useState("Ready");
  const [bestCode, setBestCode] = useState<string | null>(null);
  const [matches, setMatches] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "scanning">("idle");
  const [error, setError] = useState<string | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [pgi, setPgi] = useState<Record<string, any>>({});
  const matchedPgi = useMemo(() => (bestCode ? pgi[bestCode] : null), [bestCode, pgi]);
  const matchedDealerSlug = useMemo(() => {
    const slug = matchedPgi ? slugifyDealerName(matchedPgi.dealer) : "";
    return slug || null;
  }, [matchedPgi]);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const signatureRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [hasSignature, setHasSignature] = useState(false);

  const resizeSignatureCanvas = useCallback(() => {
    const canvas = signatureRef.current;
    if (!canvas) return;
    const { width } = canvas.getBoundingClientRect();
    const height = 180;
    const previous = canvas.toDataURL();
    canvas.width = Math.max(width, 320);
    canvas.height = height;
    if (previous) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        img.src = previous;
      }
    }
  }, []);

  const handleSelectPhoto = () => {
    inputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      runScan(file);
    }
    event.target.value = "";
  };

  const getCanvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handleSignatureStart = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(event);
    if (!point || !signatureRef.current) return;
    const ctx = signatureRef.current.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    isDrawingRef.current = true;
    lastPointRef.current = point;
  };

  const handleSignatureMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !signatureRef.current) return;
    const ctx = signatureRef.current.getContext("2d");
    const point = getCanvasPoint(event);
    if (!ctx || !point || !lastPointRef.current) return;
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
    setHasSignature(true);
  };

  const handleSignatureEnd = () => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
  };

  const clearSignature = useCallback(() => {
    const canvas = signatureRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasSignature(false);
  }, []);

  const buildPdf = useCallback(
    async (chassis: string) => {
      if (!capturedFile) throw new Error("No photo captured yet");
      if (!hasSignature || !signatureRef.current) throw new Error("Signature is required");

      const JsPDF = await ensureJsPdf();
      const pdf = new JsPDF("p", "pt", "a4");
      const margin = 32;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const usableWidth = pageWidth - margin * 2;

      const photoDataUrl = await fileToDataUrl(capturedFile);
      const photoImage = await loadImageElement(photoDataUrl);
      const photoFormat = capturedFile.type.includes("png") ? "PNG" : "JPEG";
      const maxPhotoHeight = 320;
      const photoScale = photoImage.width
        ? Math.min(usableWidth / photoImage.width, maxPhotoHeight / photoImage.height, 1)
        : 1;
      const photoWidth = photoImage.width ? photoImage.width * photoScale : usableWidth;
      const photoHeight = photoImage.height ? photoImage.height * photoScale : Math.min(maxPhotoHeight, usableWidth * 0.75);

      pdf.addImage(photoDataUrl, photoFormat, margin, margin, photoWidth, photoHeight);

      let y = margin + photoHeight + 18;
      const timestamp = new Date().toLocaleString();
      pdf.setFontSize(12);
      pdf.text(`Chassis: ${chassis}`, margin, y);
      y += 16;
      pdf.text(`Timestamp: ${timestamp}`, margin, y);
      y += 18;

      const signatureUrl = signatureRef.current.toDataURL("image/png");
      const signatureImage = await loadImageElement(signatureUrl);
      const sigScale = signatureImage.width ? Math.min(usableWidth / signatureImage.width, 1) : 1;
      const sigHeight = signatureImage.height ? signatureImage.height * sigScale : 120;
      pdf.text("Signature", margin, y);
      y += 8;
      pdf.addImage(signatureUrl, "PNG", margin, y, signatureImage.width * sigScale, sigHeight);

      return pdf.output("blob") as Blob;
    },
    [capturedFile, hasSignature]
  );

  const runScan = useCallback(
    async (file: File) => {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        setError("Missing VITE_GEMINI_API_KEY");
        return;
      }

      setStatus("scanning");
      setError(null);
      setOcrText("Preparing optimized scan…");
      setBestCode(null);
      setMatches([]);
      setCapturedFile(file);
      setHasSignature(false);
      clearSignature();

      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });

      try {
        const base64 = await toOptimizedBase64(file);
        const ai = { apiKey };
        const model = getGenerativeModel(ai, { model: GEMINI_MODEL });

        const response = await model.generateContent({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text:
                    "Extract clear text from the photo. Focus on chassis codes like ABC234567 (three letters + six digits, no spaces). Return only the OCR text with no model names, metadata, or explanations.",
                },
                {
                  inlineData: {
                    data: base64,
                    mimeType: file.type || "image/png",
                  },
                },
              ],
            },
          ],
          generationConfig: { temperature: 0, maxOutputTokens: 256 },
        });

        const text = response.response.text().trim();
        const { best, all } = extractChassis(text);

        setOcrText(text || "No text found");
        setBestCode(best);
        setMatches(all);
        setStatus("idle");
      } catch (err) {
        console.error(err);
        setStatus("idle");
        setError(err instanceof Error ? err.message : "Scan failed");
      }
    },
    [clearSignature]
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    resizeSignatureCanvas();
    window.addEventListener("resize", resizeSignatureCanvas);
    return () => window.removeEventListener("resize", resizeSignatureCanvas);
  }, [resizeSignatureCanvas]);

  useEffect(() => {
    const unsub = subscribeToPGIRecords((data) => setPgi(data || {}));
    return () => unsub?.();
  }, []);

  const handleReceive = async () => {
    if (!bestCode) {
      toast.error("No code to receive");
      return;
    }

    if (!capturedFile) {
      toast.error("Please capture a photo first");
      return;
    }

    if (!matchedDealerSlug) {
      toast.error("No matching PGI record");
      return;
    }

    if (!hasSignature) {
      toast.error("Signature is required");
      return;
    }

    setReceiving(true);
    try {
      const pdfBlob = await buildPdf(bestCode);
      await uploadDeliveryDocument(bestCode, pdfBlob);
      await receiveChassisToYard(matchedDealerSlug, bestCode, matchedPgi || null);
      toast.success(`${bestCode} saved & received (${matchedDealerSlug})`);
    } catch (err) {
      console.error(err);
      toast.error("Receive failed");
    } finally {
      setReceiving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#0f172a,_#020617)] text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 pb-8 pt-6 sm:px-6 lg:pt-10">
        <div className="flex items-center justify-between rounded-3xl bg-white/5 px-4 py-3 shadow-lg backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40">
              <PenLine className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-emerald-100">Caravan Receiving</p>
              <p className="text-xs text-slate-200">Scan POD, verify chassis, sign digitally</p>
            </div>
          </div>
          {matchedDealerSlug && (
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-slate-100">
              {matchedDealerSlug}
            </span>
          )}
        </div>

        <Card className="border-none bg-white/5 shadow-2xl backdrop-blur lg:overflow-hidden">
          <CardContent className="p-0">
            <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="flex flex-col gap-4 bg-slate-950/50 p-4 sm:p-6">
              <div className="flex items-center justify-between text-xs text-slate-200">
                <span className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Camera className="h-4 w-4 text-emerald-300" />
                  POD paper
                </span>
                <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] text-slate-200">Guided capture</span>
              </div>

              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 shadow-inner">
                <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1 text-[11px] text-emerald-100 ring-1 ring-emerald-400/30">
                  <ScanLine className="h-3.5 w-3.5" />
                  OCR tuned for POD
                </div>
                {previewUrl ? (
                  <img src={previewUrl} alt="POD preview" className="h-[380px] w-full object-cover" />
                ) : (
                  <div className="flex h-[380px] items-center justify-center px-4 text-center text-sm text-slate-400">
                    Capture the POD paper to begin OCR
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-4 pb-4 pt-10">
                  <div className="flex items-center gap-2 text-xs text-slate-200">
                    <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    {status === "scanning" ? "Optimizing & recognizing…" : previewUrl ? "POD ready" : "Awaiting capture"}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="gap-2 bg-emerald-500 text-slate-900 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400"
                      onClick={handleSelectPhoto}
                      disabled={status === "scanning"}
                    >
                      {status === "scanning" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                      {status === "scanning" ? "Scanning" : previewUrl ? "Retake POD" : "Capture POD"}
                    </Button>
                      <input
                        ref={inputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100 shadow">
                    {error}
                  </div>
                )}

                {matches.length > 1 && (
                  <div className="flex flex-wrap gap-2 text-xs text-emerald-50">
                    {matches.map((code) => (
                      <button
                        key={code}
                        type="button"
                        className={`rounded-full border px-2 py-1 transition ${
                          code === bestCode
                            ? "border-emerald-400/70 bg-emerald-500/20 text-emerald-100"
                            : "border-white/10 bg-white/5 text-slate-100 hover:border-emerald-300/50 hover:text-white"
                        }`}
                        onClick={() => setBestCode(code)}
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-4 bg-white/5 p-4 sm:p-6">
                <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4 shadow-inner">
                  <div className="flex items-center justify-between text-xs text-slate-200">
                    <span className="text-sm font-semibold text-white">OCR review (editable)</span>
                    {status === "scanning" && (
                      <span className="flex items-center gap-2 text-[11px] text-slate-200">
                        <Loader2 className="h-3 w-3 animate-spin" /> Recognizing
                      </span>
                    )}
                  </div>
                  <div className="mt-3 space-y-3">
                    <Textarea
                      value={ocrText}
                      onChange={(e) => setOcrText(e.target.value)}
                      className="min-h-[120px] resize-none bg-slate-950/60 text-sm text-slate-50 ring-1 ring-white/10"
                    />
                    <div className="space-y-2">
                      <p className="text-[11px] uppercase tracking-wide text-emerald-200">Chassis code</p>
                      <Input
                        value={bestCode ?? ""}
                        placeholder="ABC234567"
                        className="bg-slate-950/60 text-lg font-semibold text-white ring-1 ring-white/10"
                        onChange={(e) => {
                          const cleaned = e.target.value.toUpperCase().replace(/\s+/g, "");
                          setBestCode(cleaned || null);
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-100 shadow-inner">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Dealer</p>
                    <p className="mt-1 text-base font-semibold text-white">{matchedPgi?.dealer ?? "-"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Model</p>
                    <p className="mt-1 text-base font-semibold text-white">{matchedPgi?.model ?? "-"}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-inner">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                      <PenLine className="h-4 w-4 text-emerald-300" />
                      Receiver signature (required)
                    </div>
                    <Button variant="ghost" size="sm" className="text-xs text-slate-200 hover:bg-white/5" onClick={clearSignature}>
                      Clear
                    </Button>
                  </div>
                  <div className="mt-3 overflow-hidden rounded-xl bg-white p-2 text-slate-800 shadow-inner">
                    <canvas
                      ref={signatureRef}
                      className="h-36 w-full touch-none bg-white"
                      onPointerDown={handleSignatureStart}
                      onPointerMove={handleSignatureMove}
                      onPointerUp={handleSignatureEnd}
                      onPointerLeave={handleSignatureEnd}
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-300">Please sign in the box before submitting.</p>
                </div>

                <div className="sticky bottom-4 z-10 rounded-2xl border border-emerald-500/40 bg-emerald-500/20 p-3 shadow-lg shadow-emerald-500/30 backdrop-blur">
                  <div className="flex items-center justify-between text-xs text-emerald-50">
                    <span>Save POD & receive</span>
                    <span className="rounded-full bg-white/15 px-2 py-1 text-[11px] text-white">
                      {matchedDealerSlug || "No match"}
                    </span>
                  </div>
                  <Button
                    type="button"
                    disabled={!bestCode || !matchedDealerSlug || receiving || !hasSignature || !capturedFile}
                    className="mt-2 w-full gap-2 bg-emerald-400 text-slate-900 shadow-lg shadow-emerald-400/40 hover:bg-emerald-300"
                    onClick={handleReceive}
                  >
                    {receiving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Submit POD
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default OcrPage;
