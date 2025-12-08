import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Camera, Check, Loader2, ScanLine, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { receiveChassisToYard } from "@/lib/firebase";

const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL ?? "gemini-2.5-flash";

const inferGeminiApiVersion = (model: string = GEMINI_MODEL): "v1" | "v1beta" => {
  const fromEnv = import.meta.env.VITE_GEMINI_API_VERSION;
  if (fromEnv === "v1" || fromEnv === "v1beta") return fromEnv;
  return /gemini-2(\.|-|$)/i.test(model) ? "v1beta" : "v1";
};

const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("无法读取图片"));
        return;
      }
      const base64 = result.split(",")[1];
      if (!base64) {
        reject(new Error("图片编码失败"));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("图片读取失败"));
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
  const [ocrText, setOcrText] = useState("待扫描…");
  const [bestCode, setBestCode] = useState<string | null>(null);
  const [matches, setMatches] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "scanning">("idle");
  const [error, setError] = useState<string | null>(null);
  const [dealerSlug, setDealerSlug] = useState("");
  const [receiving, setReceiving] = useState(false);
  const [apiVersionUsed, setApiVersionUsed] = useState<"v1" | "v1beta">(inferGeminiApiVersion());

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
      setError("缺少 VITE_GEMINI_API_KEY，无法连接 Gemini");
      return;
    }

    setStatus("scanning");
    setError(null);
    setOcrText("识别中…");
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
          throw new Error(detail || "Gemini 返回 404，请确认模型可用");
        }
      }

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Gemini 识别失败");
      }

      const payload = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };

      const text =
        payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";

      const { best, all } = extractChassis(text);

      setApiVersionUsed(versionUsed);
      setOcrText(text || "未检测到文字");
      setBestCode(best);
      setMatches(all);
      setStatus("idle");
    } catch (err) {
      console.error(err);
      setStatus("idle");
      setError(err instanceof Error ? err.message : "识别失败，请重试");
    }
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const helperChips = useMemo(
    () => ["无复杂选项、直接拍照", "优先 Gemini 云识别", "聚焦 ABC234567 编码", "提取后直接 Receive"],
    []
  );

  const handleReceive = async () => {
    if (!bestCode) {
      toast.error("没有可用的编码");
      return;
    }
    const slug = dealerSlug.trim();
    if (!slug) {
      toast.error("请填写 dealer slug");
      return;
    }

    setReceiving(true);
    try {
      await receiveChassisToYard(slug, bestCode, null);
      toast.success(`${bestCode} 已标记为 Received`);
    } catch (err) {
      console.error(err);
      toast.error("Receive 失败，请检查权限或网络");
    } finally {
      setReceiving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 text-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex items-center gap-3 rounded-3xl bg-slate-800/60 px-4 py-3 backdrop-blur">
          <Wand2 className="h-5 w-5 text-emerald-300" />
          <div>
            <p className="text-sm font-semibold text-emerald-200">Gemini 实时 OCR</p>
            <p className="text-xs text-slate-300">始终连接 Gemini · 专注车架号提取</p>
          </div>
        </div>

        <Card className="border-none bg-white/5 shadow-xl backdrop-blur">
          <CardContent className="space-y-4 p-5 sm:p-6">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-bold text-white">Scan & Receive</h1>
              <p className="text-sm text-slate-200">拍照 / 上传 · 自动识别 ABC234567（首位数字 2 优先）</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {helperChips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-100 ring-1 ring-white/10"
                >
                  {chip}
                </span>
              ))}
            </div>

            <div className="flex flex-col gap-3 rounded-2xl bg-slate-950/40 p-4 ring-1 ring-white/10">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-200">
                  <Sparkles className="h-4 w-4 text-emerald-300" />
                  <span>模型：{GEMINI_MODEL}</span>
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
                    {status === "scanning" ? "扫描中" : "Scan / Photo"}
                  </Button>
                  {previewUrl && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2 border-white/20 text-slate-100 hover:bg-white/5"
                      onClick={handleSelectPhoto}
                    >
                      <ScanLine className="h-4 w-4" /> 重新拍
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
                    拍照或上传图片开始识别
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
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-100">识别结果</p>
                {status === "scanning" && (
                  <span className="flex items-center gap-2 text-xs text-slate-200">
                    <Loader2 className="h-3 w-3 animate-spin" /> 正在连接 Gemini…
                  </span>
                )}
              </div>

              <div className="rounded-xl bg-slate-900/60 p-3 ring-1 ring-white/5">
                <Label htmlFor="ocr-output" className="text-xs uppercase tracking-wide text-slate-400">
                  Raw text
                </Label>
                <Textarea
                  id="ocr-output"
                  value={ocrText}
                  onChange={(e) => setOcrText(e.target.value)}
                  className="mt-1 min-h-[180px] resize-none border-none bg-transparent text-sm text-slate-100 shadow-none focus-visible:ring-0"
                />
              </div>

              <div className="rounded-xl bg-emerald-500/10 p-3 ring-1 ring-emerald-200/30">
                <p className="text-xs uppercase tracking-wide text-emerald-200">匹配的车架号</p>
                {bestCode ? (
                  <div className="mt-2 flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-extrabold text-white">{bestCode}</p>
                      <p className="text-xs text-emerald-100">首位数字为 2 的编码会自动置顶</p>
                    </div>
                    <div className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-100">
                      优先
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-emerald-50">尚未匹配到 ABC234567 结构的编码</p>
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
              <p className="text-sm font-semibold text-slate-100">Receive（与 Yard 页面一致）</p>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-slate-400">Dealer slug</Label>
                <Input
                  value={dealerSlug}
                  onChange={(e) => setDealerSlug(e.target.value)}
                  placeholder="例如 melbourne"
                  className="border-white/10 bg-slate-950/40 text-white placeholder:text-slate-500"
                />
              </div>
              <Button
                type="button"
                disabled={!bestCode || receiving}
                className="w-full gap-2 bg-emerald-500 text-slate-900 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400"
                onClick={handleReceive}
              >
                {receiving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Receive
              </Button>
              <p className="text-xs text-slate-300">调用与 Yard Inventory 相同的 receiveChassisToYard，直接更新车辆状态。</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default OcrPage;
