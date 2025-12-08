import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Camera, Check, Loader2, ScanLine, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { receiveChassisToYard, subscribeToPGIRecords } from "@/lib/firebase";

const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL ?? "gemini-2.5-flash";

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
  const [ocrText, setOcrText] = useState("Ready");
  const [bestCode, setBestCode] = useState<string | null>(null);
  const [matches, setMatches] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "scanning">("idle");
  const [error, setError] = useState<string | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [apiVersionUsed, setApiVersionUsed] = useState<"v1" | "v1beta">(inferGeminiApiVersion());
  const [pgi, setPgi] = useState<Record<string, any>>({});
  const matchedPgi = useMemo(() => (bestCode ? pgi[bestCode] : null), [bestCode, pgi]);
  const matchedDealerSlug = useMemo(() => {
    const slug = matchedPgi ? slugifyDealerName(matchedPgi.dealer) : "";
    return slug || null;
  }, [matchedPgi]);

  const inputRef = useRef<HTMLInputElement | null>(null);

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

  const runScan = useCallback(async (file: File) => {
    if (!import.meta.env.VITE_GEMINI_API_KEY) {
      setError("Missing VITE_GEMINI_API_KEY");
      return;
    }

    setStatus("scanning");
    setError(null);
    setOcrText("Scanning…");
    setBestCode(null);
    setMatches([]);

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
                  "Extract clear text from the photo. If a chassis code like ABC234567 (three letters + six digits, no spaces) exists, keep it intact. Return plain text only.",
              },
              {
                inline_data: {
                  data: base64,
                  mime_type: "image/png",
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
      let versionUsed: "v1" | "v1beta" = apiVersion;

      if (!response.ok && response.status === 404) {
        const fallback = apiVersion === "v1" ? "v1beta" : "v1";
        const fallbackResp = await send(fallback);
        if (fallbackResp.ok) {
          response = fallbackResp;
          versionUsed = fallback;
        } else {
          const detail = await fallbackResp.text();
          throw new Error(detail || "Gemini 404 — check model");
        }
      }

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Gemini OCR error");
      }

      const payload = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };

      const text =
        payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";

      const { best, all } = extractChassis(text);

      setApiVersionUsed(versionUsed);
      setOcrText(text || "No text found");
      setBestCode(best);
      setMatches(all);
      setStatus("idle");
    } catch (err) {
      console.error(err);
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Scan failed");
    }
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    const unsub = subscribeToPGIRecords((data) => setPgi(data || {}));
    return () => unsub?.();
  }, []);

  const handleReceive = async () => {
    if (!bestCode) {
      toast.error("No code to receive");
      return;
    }

    if (!matchedDealerSlug) {
      toast.error("No matching PGI record");
      return;
    }

    setReceiving(true);
    try {
      await receiveChassisToYard(matchedDealerSlug, bestCode, matchedPgi || null);
      toast.success(`${bestCode} received (${matchedDealerSlug})`);
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
          <Wand2 className="h-5 w-5 text-emerald-300" />
          <p className="text-sm font-semibold text-emerald-200">Gemini OCR</p>
        </div>

        <Card className="border-none bg-white/5 shadow-xl backdrop-blur">
          <CardContent className="space-y-4 p-5 sm:p-6">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-bold text-white">Scan & Receive</h1>
              <p className="text-xs text-slate-300">ABC + 6 digits · no spaces</p>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl bg-slate-950/40 p-4 ring-1 ring-white/10">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-300">
                  <Sparkles className="h-4 w-4 text-emerald-300" />
                  <span>{GEMINI_MODEL}</span>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-200">{apiVersionUsed}</span>
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
                <span>Result</span>
                {status === "scanning" && (
                  <span className="flex items-center gap-2 text-xs text-slate-200">
                    <Loader2 className="h-3 w-3 animate-spin" /> Gemini
                  </span>
                )}
              </div>

              <div className="rounded-xl bg-slate-900/60 p-3 ring-1 ring-white/5">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Text</p>
                <p className="mt-1 text-sm text-slate-100 whitespace-pre-line">{ocrText}</p>
              </div>

              <div className="rounded-xl bg-emerald-500/10 p-3 ring-1 ring-emerald-200/30">
                <p className="text-[11px] uppercase tracking-wide text-emerald-200">Code</p>
                {bestCode ? (
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-2xl font-extrabold text-white">{bestCode}</p>
                    <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-[11px] font-semibold text-emerald-100">top</span>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-emerald-50">No match yet</p>
                )}

                {matches.length > 1 && (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-emerald-50">
                    {matches.slice(1).map((code) => (
                      <span key={code} className="rounded-full bg-white/10 px-2 py-1">
                        {code}
                      </span>
                    ))}
                  </div>
                )}
              </div>
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
                disabled={!bestCode || !matchedDealerSlug || receiving}
                className="w-full gap-2 bg-emerald-500 text-slate-900 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400"
                onClick={handleReceive}
              >
                {receiving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Receive
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default OcrPage;
