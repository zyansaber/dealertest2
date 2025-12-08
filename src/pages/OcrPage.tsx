import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useDropzone } from "react-dropzone";
import {
  AlertCircle,
  Camera,
  Check,
  Cloud,
  Copy,
  Cpu,
  FileText,
  Loader2,
  RotateCw,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

const OCR_LANGUAGE = "eng";
const OCR_LANG_SOURCES = ["/tessdata", "https://tessdata.projectnaptha.com/4.0.0"] as const;
const MAX_WORKING_WIDTH = 2000;
const MIN_DIMENSION = 320;
const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL ?? "gemini-1.5-flash-001";

async function preprocessImage(file: File, rotation: number, applyEnhancement: boolean) {
  const img = document.createElement("img");
  const url = URL.createObjectURL(file);
  img.src = url;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Unable to read this image. Please re-upload."));
  });

  const scale = Math.min(1, MAX_WORKING_WIDTH / img.width);
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  if (Math.min(width, height) < MIN_DIMENSION) {
    URL.revokeObjectURL(url);
    throw new Error("The image is too small or blurry. Please upload a clearer photo or scan.");
  }

  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const canvas = document.createElement("canvas");

  if (normalizedRotation === 90 || normalizedRotation === 270) {
    canvas.width = height;
    canvas.height = width;
  } else {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    URL.revokeObjectURL(url);
    throw new Error("Canvas unsupported in this browser.");
  }

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((normalizedRotation * Math.PI) / 180);
  ctx.drawImage(img, -width / 2, -height / 2, width, height);
  ctx.restore();

  if (applyEnhancement) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const contrast = 1.05;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      const v = Math.min(255, Math.max(0, (gray - 128) * contrast + 128));
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    }

    ctx.putImageData(imageData, 0, 0);
  }

  URL.revokeObjectURL(url);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to process the image. Please try again."));
        return;
      }
      resolve(blob);
    }, "image/png", 1)
  );
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unable to read image for Gemini."));
        return;
      }

      const base64 = result.split(",")[1];
      if (!base64) {
        reject(new Error("Invalid image encoding for Gemini."));
        return;
      }

      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to encode image for Gemini."));
    reader.readAsDataURL(blob);
  });
}

const OcrPage = () => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeFileName, setActiveFileName] = useState<string | null>(null);
  const [averageConfidence, setAverageConfidence] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0);
  const [engineStatus, setEngineStatus] = useState<"idle" | "warming" | "ready" | "error">("idle");
  const [engineMessage, setEngineMessage] = useState<string | null>(null);
  const [ocrEngine, setOcrEngine] = useState<"tesseract" | "gemini">("tesseract");
  const [patternMatches, setPatternMatches] = useState<string[]>([]);
  const [enhance, setEnhance] = useState(true);
  const [langPath, setLangPath] = useState<string>(OCR_LANG_SOURCES[0]);
  const [langWarning, setLangWarning] = useState<string | null>(null);
  const jobRef = useRef(0);
  const lastFileRef = useRef<File | null>(null);
  const lastProcessedRotationRef = useRef(0);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const geminiReady = Boolean(import.meta.env.VITE_GEMINI_API_KEY);

  const resetState = useCallback(() => {
    setOcrText("");
    setStatus("idle");
    setProgress(0);
    setLastError(null);
    setActiveFileName(null);
    setAverageConfidence(null);
    setCopied(false);
  }, []);

  const performOcr = useCallback(async (file: File) => {
    lastFileRef.current = file;
    lastProcessedRotationRef.current = rotation;
    const nextJobId = jobRef.current + 1;
    jobRef.current = nextJobId;
    resetState();
    setStatus("running");
    setActiveFileName(file.name);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });

    try {
      if (ocrEngine === "tesseract") {
        const tesseract = window.Tesseract;
        if (!tesseract?.recognize) {
          throw new Error("The OCR engine is still loading. Please try again in a second.");
        }

        const processed = await preprocessImage(file, rotation, enhance);

        const { data } = await tesseract.recognize(processed, OCR_LANGUAGE, {
          langPath,
          logger: (message: { status: string; progress?: number }) => {
            if (message.status === "recognizing text" && typeof message.progress === "number") {
              setProgress(Math.round(message.progress * 100));
            }
          },
        });

        if (jobRef.current !== nextJobId) return;

        setOcrText(data?.text?.trim() ?? "");
        setAverageConfidence(
          typeof data?.confidence === "number" ? Math.round(data.confidence) : null
        );
      } else {
        if (!geminiReady) {
          throw new Error("Missing VITE_GEMINI_API_KEY. Add it to use Gemini OCR.");
        }

        const processed = await preprocessImage(file, rotation, enhance);
        const base64 = await blobToBase64(processed);

        setEngineMessage("Sending to Gemini for recognition…");

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text:
                        "Extract all visible text from this image. Preserve line breaks and punctuation. Return plain UTF-8 text only without additional commentary.",
                    },
                    {
                      inlineData: {
                        data: base64,
                        mimeType: "image/png",
                      },
                    },
                  ],
                },
              ],
              generationConfig: { temperature: 0.2 },
            }),
          }
        );

        if (!response.ok) {
          const detail = await response.text();
          const notFoundMessage =
            response.status === 404
              ? "The requested Gemini model is unavailable. Set VITE_GEMINI_MODEL to a supported model (e.g. gemini-1.5-flash-001 or gemini-1.5-flash-latest)."
              : "";
          throw new Error(
            `Gemini OCR failed (${response.status}). ${notFoundMessage || ""}${detail ? ` ${detail}` : ""}`.trim()
          );
        }

        const payload = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };

        if (jobRef.current !== nextJobId) return;

        const text =
          payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ??
          "";

        setOcrText(text);
        setAverageConfidence(null);
        setProgress(100);
      }

      setStatus("idle");
    } catch (error) {
      console.error("OCR failed", error);
      if (jobRef.current !== nextJobId) return;

      setStatus("error");
      setLastError(error instanceof Error ? error.message : "Unable to recognize this image");
    }
  }, [enhance, geminiReady, langPath, ocrEngine, resetState, rotation]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles?.[0];
    if (!file) return;

    performOcr(file);
  }, [performOcr]);

  const handleCameraCapture = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      performOcr(file);
    }
    // reset the input to allow re-uploading the same file after capture
    event.target.value = "";
  };

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      "image/*": [],
    },
    maxFiles: 1,
    multiple: false,
    noClick: true,
  });

  const copyToClipboard = async () => {
    if (!ocrText) return;

    await navigator.clipboard.writeText(ocrText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  useEffect(() => {
    if (ocrEngine === "tesseract") {
      setEngineStatus("idle");
      setEngineMessage("Preparing OCR engine…");
      return;
    }

    setEngineStatus(geminiReady ? "ready" : "error");
    setEngineMessage(
      geminiReady
        ? "Gemini API ready. Upload an image to use cloud OCR."
        : "Add VITE_GEMINI_API_KEY to enable Gemini cloud OCR."
    );
  }, [geminiReady, ocrEngine]);

  useEffect(() => {
    let cancelled = false;

    const resolveLangPath = async () => {
      for (const source of OCR_LANG_SOURCES) {
        try {
          const response = await fetch(`${source}/eng.traineddata.gz`, { method: "HEAD", mode: "no-cors" });
          if (cancelled) return;
          if (response.ok || response.type === "opaque") {
            setLangPath(source);
            setLangWarning(
              source === OCR_LANG_SOURCES[0]
                ? null
                : "Using fallback CDN language data. Host eng.traineddata.gz under /public/tessdata for best stability."
            );
            return;
          }
        } catch (error) {
          console.warn(`Language pack check failed for ${source}`, error);
        }
      }

      if (!cancelled) {
        setLangPath(OCR_LANG_SOURCES[OCR_LANG_SOURCES.length - 1]);
        setLangWarning("English language pack not found locally; falling back to remote source.");
      }
    };

    resolveLangPath();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!ocrText) {
      setPatternMatches([]);
      return;
    }

    const regex = /[A-Za-z]{3}[0-9]{6}/g;
    const matches: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(ocrText)) !== null) {
      matches.push(match[0]);
    }

    const prioritized = matches.filter((value) => value[3] === "2");
    const others = matches.filter((value) => value[3] !== "2");
    const ordered = [...prioritized, ...others];
    const unique: string[] = [];
    const seen = new Set<string>();

    for (const value of ordered) {
      if (seen.has(value)) continue;
      seen.add(value);
      unique.push(value);
    }

    setPatternMatches(unique);
  }, [ocrText]);

  useEffect(() => {
    if (ocrEngine !== "tesseract") return undefined;

    let cancelled = false;
    let warmupStarted = false;
    let pollHandle: number | undefined;

    const stopPolling = () => {
      if (pollHandle) {
        window.clearInterval(pollHandle);
        pollHandle = undefined;
      }
    };

    const warmup = async () => {
      if (warmupStarted) return;
      warmupStarted = true;
      const tesseract = window.Tesseract;
      if (!tesseract?.recognize) return;

      setEngineStatus("warming");
      setEngineMessage("Loading OCR engine…");

      try {
        const canvas = document.createElement("canvas");
        canvas.width = 2;
        canvas.height = 2;
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((b) => {
            if (!b) {
              reject(new Error("Canvas warmup failed"));
              return;
            }
            resolve(b);
          }, "image/png", 1)
        );

        await tesseract.recognize(blob, OCR_LANGUAGE, {
          langPath,
          logger: (message) => {
            if (cancelled) return;
            if (message.status === "recognizing text") {
              setEngineMessage("OCR engine ready");
            } else if (message.status.includes("load")) {
              setEngineMessage("Loading language data…");
            }
          },
        });

        if (!cancelled) {
          setEngineStatus("ready");
          setEngineMessage("Engine warmed up and ready.");
          stopPolling();
        }
     } catch (error) {
        if (!cancelled) {
          console.error("Warmup failed", error);
          setEngineStatus("error");
          setEngineMessage("Unable to warm up OCR engine. It may still work on first run.");
          stopPolling();
        }
      }
    };

    const tryWarmup = () => {
      if (cancelled) return;
      const tesseract = window.Tesseract;
      if (tesseract?.recognize) {
        warmup();
      }
    };

    tryWarmup();
    pollHandle = window.setInterval(tryWarmup, 500);

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [langPath, ocrEngine]);

  useEffect(() => {
    if (!lastFileRef.current) return;
    if (status === "running") return;
    if (rotation === lastProcessedRotationRef.current) return;

    performOcr(lastFileRef.current);
  }, [performOcr, rotation, status]);

  const helperText = useMemo(
    () => [
      "Use clear, non-reflective scans or mobile photos with good lighting.",
      "Keep text horizontal and avoid heavy compression or motion blur.",
      "Rotate or crop so the main text block is upright before recognition.",
      "High-contrast images with ≥320px on the shorter side work best.",
    ],
    []
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-8">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-primary">Standalone OCR (English only)</p>
          <h1 className="text-3xl font-bold leading-tight text-slate-900">Image-to-Text Precision Lab</h1>
          <p className="text-sm text-slate-600 sm:text-base">
            Drop a clear English-alphabet image and get selectable text in a few seconds. Use on-device
            Tesseract.js or opt into Gemini cloud OCR when a VITE_GEMINI_API_KEY is configured.
          </p>
        </header>

        <div
          className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${
            engineStatus === "ready"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : engineStatus === "error"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-slate-200 bg-white text-slate-700"
          }`}
        >
          {engineStatus === "ready" ? (
            <Check className="h-4 w-4 text-emerald-600" />
          ) : (
            <Loader2 className={`h-4 w-4 ${engineStatus === "warming" ? "animate-spin" : ""} text-primary`} />
          )}
          <p className="font-medium">
            {engineMessage ?? "Preparing OCR engine…"}
            {engineStatus === "warming" && " (prefetching language data)"}
          </p>
          {langWarning && <p className="text-xs text-amber-700">{langWarning}</p>}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Upload className="h-5 w-5 text-primary" />
                Upload or drop an image
              </CardTitle>
              <CardDescription>English interface and language pack for crisp alphanumeric recognition.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                {...getRootProps({
                  className:
                    "border-2 border-dashed border-slate-200 rounded-lg bg-white p-6 transition hover:border-primary/60 " +
                    (isDragActive ? "ring-2 ring-primary/40" : ""),
                })}
              >
                <input {...getInputProps()} />
                <div className="flex flex-col items-center justify-center gap-3 text-center text-slate-600">
                  <Upload className="h-10 w-10 text-primary" />
                  {isDragActive ? (
                    <p className="text-base font-medium">Release to start recognition</p>
                  ) : (
                    <p className="text-base font-medium">
                      Drag & drop a JPG/PNG or
                      <button type="button" className="text-primary underline" onClick={open}>
                        browse
                      </button>
                    </p>
                  )}
                  <p className="text-xs text-slate-500">
                    Maximum 1 image at a time. Stays client-side unless Gemini cloud OCR is selected.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                <Button type="button" variant="outline" size="sm" onClick={() => setRotation((r) => r + 90)}>
                  <RotateCw className="h-4 w-4" /> Rotate 90°
                </Button>
                <Button
                  type="button"
                  variant={enhance ? "default" : "outline"}
                  size="sm"
                  className="flex items-center gap-2"
                  onClick={() => setEnhance((value) => !value)}
                >
                  {enhance ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  {enhance ? "Enhanced" : "Raw"} input
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="h-4 w-4" /> Open camera
                </Button>
                <span className="text-xs text-slate-500">Use rotation if the preview looks sideways or upside-down.</span>
              </div>

              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <Cpu className="h-4 w-4 text-primary" /> OCR engine
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={ocrEngine === "tesseract" ? "default" : "outline"}
                      className="flex items-center gap-2"
                      onClick={() => setOcrEngine("tesseract")}
                    >
                      <Cpu className="h-4 w-4" /> On-device (Tesseract)
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={ocrEngine === "gemini" ? "default" : "outline"}
                      className="flex items-center gap-2"
                      disabled={!geminiReady}
                      onClick={() => setOcrEngine("gemini")}
                    >
                      <Cloud className="h-4 w-4" /> Gemini (API)
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-slate-600">
                  {ocrEngine === "gemini"
                    ? "Gemini sends the image to Google for recognition; results depend on network speed."
                    : "Tesseract.js keeps all processing in the browser. Switch to Gemini for higher quality if the API key is set."}
                  {!geminiReady && " Add VITE_GEMINI_API_KEY to enable the cloud option."}
                </p>
              </div>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleCameraCapture}
              />

              {previewUrl && (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-sm">
                    <span className="font-medium text-slate-700">{activeFileName}</span>
                    <span className="text-slate-500">Preview</span>
                  </div>
                  <img
                    src={previewUrl}
                    alt="Uploaded preview"
                    className="max-h-96 w-full object-contain bg-slate-50"
                    style={{ transform: `rotate(${rotation % 360}deg)` }}
                  />
                </div>
              )}

              {status === "running" && (
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <div className="flex-1 space-y-2">
                    <p className="text-sm font-medium text-slate-700">Recognizing text…</p>
                    <Progress value={progress} className="h-2" />
                    <p className="text-xs text-slate-500">Using Tesseract.js ({OCR_LANGUAGE})</p>
                  </div>
                </div>
              )}

              {status === "error" && lastError && (
                <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                  <AlertCircle className="mt-0.5 h-5 w-5" />
                  <div className="space-y-1">
                    <p className="font-semibold">Couldn’t read this image</p>
                    <p className="text-sm leading-relaxed">{lastError}</p>
                  </div>
                </div>
              )}

              {averageConfidence !== null && averageConfidence < 70 && status === "idle" && !lastError && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
                  <AlertCircle className="mt-0.5 h-5 w-5" />
                  <div className="space-y-1">
                    <p className="font-semibold">Low confidence result</p>
                    <p className="text-sm leading-relaxed">
                      Please double-check the text. Try rotating the image, improving lighting/contrast, or uploading a
                      higher resolution photo for a better result.
                    </p>
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <FileText className="h-4 w-4" /> Quality tips
                </p>
                <ul className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                  {helperText.map((tip) => (
                    <li key={tip} className="leading-snug">• {tip}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <FileText className="h-5 w-5 text-primary" />
                OCR result
              </CardTitle>
              <CardDescription>Copy-ready plain text after recognition. Editable if the confidence is low.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5 text-sm text-slate-600">
                  <p>
                    <span className="font-semibold text-slate-800">Engine:</span> {" "}
                    {ocrEngine === "tesseract" ? "Tesseract.js (on-device)" : "Gemini API (cloud)"}
                  </p>
                  {ocrEngine === "tesseract" ? (
                    <p>
                      <span className="font-semibold text-slate-800">Language pack:</span> English ({OCR_LANGUAGE})
                      {langPath && ` via ${langPath}`}
                    </p>
                  ) : (
                    <p>
                      <span className="font-semibold text-slate-800">Model:</span> {GEMINI_MODEL}
                    </p>
                  )}
                  {averageConfidence !== null && ocrEngine === "tesseract" && (
                    <p>
                      <span className="font-semibold text-slate-800">Avg confidence:</span> {averageConfidence}%
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                  disabled={!ocrText}
                  onClick={copyToClipboard}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy text"}
                </Button>
              </div>

              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <p className="flex items-center gap-2 font-semibold">
                  <FileText className="h-4 w-4 text-primary" /> Detected codes (AAA + 6 digits)
                </p>
                {patternMatches.length > 0 ? (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {patternMatches.map((code) => (
                      <li
                        key={code}
                        className="flex items-center justify-between rounded border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <span className="font-mono text-base font-semibold text-slate-900">{code}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            code[3] === "2"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {code[3] === "2" ? "Starts with 2" : "Check first digit"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500">No matches yet. Upload or edit text to find codes like ABC234567.</p>
                )}
              </div>

              <div className="relative">
                <Label htmlFor="ocr-output" className="mb-2 block text-sm font-semibold text-slate-700">
                  Extracted text
                </Label>
                <Textarea
                  id="ocr-output"
                  value={ocrText}
                  placeholder="Upload an image to see the recognized text here."
                  className="min-h-[280px] resize-none border-slate-200 bg-slate-50 text-sm shadow-inner"
                  onChange={(event) => setOcrText(event.target.value)}
                />
              </div>

              <div className="space-y-1 text-xs text-slate-500">
                <p>
                  You can correct the text above if something looks wrong. Very low confidence (&lt;70%) usually means the
                  image needs better lighting, contrast, or rotation.
                </p>
                <p>
                  On-device mode keeps processing in the browser. Gemini mode will upload the image to Google for
                  recognition. Refresh the page to start fresh if the OCR engine stalls.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default OcrPage;
