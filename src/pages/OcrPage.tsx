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

const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL ?? "gemini-1.5-pro";

const inferGeminiApiVersion = (model: string = GEMINI_MODEL): "v1" | "v1beta" => {
  const fromEnv = import.meta.env.VITE_GEMINI_API_VERSION;
  if (fromEnv === "v1" || fromEnv === "v1beta") return fromEnv;
  return /gemini-2(\.|-|$)/i.test(model) ? "v1beta" : "v1";
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
      const photoScale = photoImage.width ? Math.min(usableWidth / photoImage.width, 1) : 1;
      const photoHeight = photoImage.height ? photoImage.height * photoScale : usableWidth * 0.75;

      pdf.addImage(photoDataUrl, photoFormat, margin, margin, usableWidth, photoHeight);

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
      if (!import.meta.env.VITE_GEMINI_API_KEY) {
        setError("Missing VITE_GEMINI_API_KEY");
        return;
      }

    setStatus("scanning");
    setError(null);
    setOcrText("Scanning…");
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
      const base64 = await toBase64(file);
      const requestBody = {
        contents: [
          {
            parts: [
              {
                text:
                  "Extract clear text from the photo. Focus on chassis codes like ABC234567 (three letters + six digits, no spaces). Return only the OCR text with no model names, metadata, or explanations.",
              },
              {
                inline_data: {
                  data: base64,
                  mime_type: file.type || "image/png",
                },
              },
            ],
          },
        ],
        generation_config: { temperature: 0 },
      };

      const apiVersion = inferGeminiApiVersion();
      const send = (version: "v1" | "v1beta") =>
        fetch(
          `https://generativelanguage.googleapis.com/${version}/models/${GEMINI_MODEL}:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          }
        );

      let response = await send(apiVersion);

      if (!response.ok && response.status === 404) {
        const fallback = apiVersion === "v1" ? "v1beta" : "v1";
        const fallbackResp = await send(fallback);
        if (fallbackResp.ok) {
          response = fallbackResp;
        } else {
          const detail = await fallbackResp.text();
          throw new Error(detail || "Model not found — check OCR model name");
        }
      }

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "OCR error");
      }

      const payload = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };

      const text =
        payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";

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
      toast.error("请先拍照再提交");
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
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 text-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex items-center gap-3 rounded-3xl bg-slate-800/60 px-4 py-3 backdrop-blur">
          <PenLine className="h-5 w-5 text-emerald-300" />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-emerald-200">OCR capture</p>
            <p className="text-xs text-slate-300">ABC + 6 digits · no spaces</p>
          </div>
        </div>

        <Card className="border-none bg-white/5 shadow-xl backdrop-blur">
          <CardContent className="space-y-6 p-5 sm:p-6">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="flex flex-col gap-3 rounded-2xl bg-slate-950/40 p-4 ring-1 ring-white/10">
                <div className="flex items-center justify-between text-sm text-slate-200">
                  <span>Capture photo</span>
                  <span className="text-xs text-slate-400">Keep plate clear</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="gap-2 bg-emerald-500 text-slate-900 hover:bg-emerald-400"
                    onClick={handleSelectPhoto}
                    disabled={status === "scanning"}
                  >
                    {status === "scanning" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    {status === "scanning" ? "Scanning" : "Scan"}
                  </Button>
                  {previewUrl && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2 border-white/20 text-slate-100 hover:bg-white/5"
                      onClick={handleSelectPhoto}
                    >
                      <ScanLine className="h-4 w-4" /> Rescan
                    </Button>
                  )}
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>

                <div className="overflow-hidden rounded-xl bg-black/30 ring-1 ring-white/5">
                  {previewUrl ? (
                    <img src={previewUrl} alt="preview" className="h-64 w-full object-cover" />
                  ) : (
                    <div className="flex h-64 items-center justify-center text-sm text-slate-400">
                      Tap Scan to start
                    </div>
                  )}
                </div>

                {error && (
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                    {error}
                  </div>
                )}
              </div>

              <div className="space-y-3 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <div className="flex items-center justify-between text-xs text-slate-200">
                  <span>OCR result (editable)</span>
                  {status === "scanning" && (
                    <span className="flex items-center gap-2 text-xs text-slate-200">
                      <Loader2 className="h-3 w-3 animate-spin" /> Scanning
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Text</p>
                  <Textarea
                    value={ocrText}
                    onChange={(e) => setOcrText(e.target.value)}
                    className="min-h-[120px] bg-slate-900/60 text-sm text-slate-50"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wide text-emerald-200">Chassis code</p>
                  <Input
                    value={bestCode ?? ""}
                    placeholder="ABC234567"
                    className="bg-slate-900/60 text-lg font-semibold text-white"
                    onChange={(e) => {
                      const cleaned = e.target.value.toUpperCase().replace(/\s+/g, "");
                      setBestCode(cleaned || null);
                    }}
                  />
                  {matches.length > 1 && (
                    <div className="flex flex-wrap gap-2 text-xs text-emerald-50">
                      {matches.slice(1).map((code) => (
                        <button
                          key={code}
                          type="button"
                          className="rounded-full bg-white/10 px-2 py-1 transition hover:bg-white/20"
                          onClick={() => setBestCode(code)}
                        >
                          {code}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-900/60 p-3 text-sm text-slate-100 ring-1 ring-white/5">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Dealer</p>
                    <p className="mt-1 font-semibold">{matchedPgi?.dealer ?? "-"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Model</p>
                    <p className="mt-1 font-semibold">{matchedPgi?.model ?? "-"}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  <PenLine className="h-4 w-4 text-emerald-300" />
                  Signature (required)
                </div>
                <Button variant="outline" size="sm" className="border-white/20 text-slate-100" onClick={clearSignature}>
                  Clear
                </Button>
              </div>
              <div className="overflow-hidden rounded-xl bg-white p-2 text-slate-800 shadow-inner">
                <canvas
                  ref={signatureRef}
                  className="h-40 w-full touch-none bg-white"
                  onPointerDown={handleSignatureStart}
                  onPointerMove={handleSignatureMove}
                  onPointerUp={handleSignatureEnd}
                  onPointerLeave={handleSignatureEnd}
                />
              </div>
              <p className="text-xs text-slate-300">Please sign inside the box before receiving.</p>
            </div>

            <div className="space-y-3 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Receive</span>
                <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] text-slate-200">
                  {matchedDealerSlug || "No PGI match"}
                </span>
              </div>
              <Button
                type="button"
                disabled={!bestCode || !matchedDealerSlug || receiving || !hasSignature || !capturedFile}
                className="w-full gap-2 bg-emerald-500 text-slate-900 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400"
                onClick={handleReceive}
              >
                {receiving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Receive & Upload PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default OcrPage;
