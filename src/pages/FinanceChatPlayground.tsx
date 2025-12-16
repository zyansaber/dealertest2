import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { v4 as uuid } from "uuid";
import { Bot, Image as ImageIcon, Loader2, MessageCircle, Send, RefreshCw, Database } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * =========================
 * Config
 * =========================
 */
const RTDB_BASE =
  import.meta.env.VITE_SHOW_RTDB_URL ??
  "https://snowyrivercaravanshow-default-rtdb.asia-southeast1.firebasedatabase.app";

const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL ?? "gemini-1.5-flash-001";
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

/**
 * =========================
 * Types (loose, tolerant)
 * =========================
 */
type ChatRole = "assistant" | "user";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  imageUrl?: string;
  ocrText?: string;
};

type Expense = {
  id: string;
  name?: string;
  category?: string;
  contains?: string;
  glCode?: string;
};

type ShowRecord = {
  id: string;
  name?: string;
  siteLocation?: string;
  startDate?: string;
  finishDate?: string;
};

type InternalSalesOrder = {
  id: string;
  showId?: string; // some data uses showId
  showI?: string;  // some data uses showI
  showName?: string;
  internalSalesOrderNumber?: string;
  orderNumber?: string;
  dealership?: string;
};

type FinanceSnapshot = {
  expenses: Expense[];
  shows: ShowRecord[];
  internalSalesOrders: InternalSalesOrder[];
};

type AttachmentState = {
  file: File;
  previewUrl: string;
  ocrText?: string;
};

type AiPickJson = {
  expense: {
    id?: string;
    name?: string;
    category?: string;
    contains?: string;
    glCode?: string;
    confidence?: number; // 0-1
    why?: string;
  } | null;
  show: {
    id?: string;
    name?: string;
    siteLocation?: string;
    startDate?: string;
    finishDate?: string;
    confidence?: number; // 0-1
    why?: string;
  } | null;
  internalSalesOrderNumber: string | null;
  needsShowInfo: boolean;
  followUpQuestion: string;
};

/**
 * =========================
 * Helpers
 * =========================
 */
const normalizeText = (value: string | null | undefined) => (value ?? "").toString().toLowerCase().trim();

const keywordsFromText = (value: string) =>
  normalizeText(value)
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);

const objectToArray = <T extends { id: string }>(obj: any): T[] => {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj).map(([key, val]) => {
    const v = (val ?? {}) as any;
    const id = (v.id ?? key ?? uuid()).toString();
    return { id, ...v };
  });
};

const fetchRtdbJson = async <T,>(path: string): Promise<T> => {
  const url = `${RTDB_BASE.replace(/\/$/, "")}/${path.replace(/^\//, "")}.json`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`RTDB fetch failed (${res.status}) for ${path}`);
  }
  return (await res.json()) as T;
};

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") return reject(new Error("Image read error"));
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
  } catch {
    // fallback to original
  }

  const dataUrl = await fileToDataUrl(file);
  const base64 = dataUrl.split(",")[1];
  if (!base64) throw new Error("Image encode error");
  return base64;
};

const geminiGenerate = async (apiKey: string, body: any) => {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    GEMINI_MODEL
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    const msg = json?.error?.message ?? `Gemini request failed (${res.status})`;
    throw new Error(msg);
  }

  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p: any) => p?.text ?? "").join("");
  return text.trim();
};

const safeParseJson = (raw: string): any | null => {
  // 1) try direct
  try {
    return JSON.parse(raw);
  } catch {}

  // 2) try extract first {...}
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) {
    const slice = raw.slice(first, last + 1);
    try {
      return JSON.parse(slice);
    } catch {}
  }
  return null;
};

const scoreExpenseRough = (expense: Expense, query: string) => {
  const text = normalizeText(query);
  const tokens = keywordsFromText(`${expense.name ?? ""} ${expense.category ?? ""} ${expense.contains ?? ""}`);
  let score = 0;
  for (const token of tokens) {
    if (!token) continue;
    if (text.includes(token)) score += 3;
  }
  if (expense.name && text.includes(normalizeText(expense.name))) score += 6;
  if (expense.category && text.includes(normalizeText(expense.category))) score += 2;
  return score;
};

const pickTopExpenses = (query: string, all: Expense[], topN = 24) =>
  all
    .map((e) => ({ e, s: scoreExpenseRough(e, query) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, topN)
    .map((x) => x.e);

const scoreShowRough = (show: ShowRecord, query: string) => {
  const text = normalizeText(query);
  const name = normalizeText(show.name);
  const loc = normalizeText(show.siteLocation);
  let score = 0;
  if (name && text.includes(name)) score += 6;
  if (loc && text.includes(loc)) score += 3;

  // soft token match
  const toks = keywordsFromText(`${show.name ?? ""} ${show.siteLocation ?? ""}`);
  for (const t of toks) if (t && text.includes(t)) score += 1;

  return score;
};

const pickTopShows = (query: string, all: ShowRecord[], topN = 24) =>
  all
    .map((s) => ({ s, score: scoreShowRough(s, query) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((x) => x.s);

const findOrdersForShowIds = (orders: InternalSalesOrder[], showIds: (string | undefined)[]) => {
  const ids = showIds
    .map((x) => normalizeText(x))
    .filter(Boolean);

  if (!ids.length) return [];

  return orders.filter((o) => {
    const candidate = normalizeText(o.showId ?? o.showI ?? "");
    return candidate && ids.includes(candidate);
  });
};

/**
 * =========================
 * Prompt builders
 * =========================
 */
const buildMatchPrompt = (args: {
  userText: string;
  ocrText?: string;
  expenseCandidates: Expense[];
  showCandidates: ShowRecord[];
  orderCandidates: InternalSalesOrder[];
}) => {
  const { userText, ocrText, expenseCandidates, showCandidates, orderCandidates } = args;

  const expenseContext = expenseCandidates.map((e) => ({
    id: e.id,
    name: e.name ?? "",
    category: e.category ?? "",
    contains: e.contains ?? "",
    glCode: e.glCode ?? "",
  }));

  const showContext = showCandidates.map((s) => ({
    id: s.id,
    name: s.name ?? "",
    siteLocation: s.siteLocation ?? "",
    startDate: s.startDate ?? "",
    finishDate: s.finishDate ?? "",
  }));

  const orderContext = orderCandidates.map((o) => ({
    id: o.id,
    showId: o.showId ?? o.showI ?? "",
    showName: o.showName ?? "",
    internalSalesOrderNumber: o.internalSalesOrderNumber ?? o.orderNumber ?? "",
  }));

  return `
You are Snowy River's friendly finance assistant (chatty, not stiff).

Goal:
1) Identify the BEST matching expense item from the provided "expenses" candidates using the user's typed text + OCR text (invoice/receipt). This must be a semantic match, not just keyword.
2) If the user provided show info (show name, location, or dates), pick the best matching show from the provided "shows".
3) If a show is confidently identified, pick the matching internalSalesOrderNumber from "internalSalesOrders" (match by showId/showI).
4) If show info is missing/unclear, set needsShowInfo=true and ask ONE short friendly follow-up question.

Return ONLY valid JSON (no markdown, no extra words) with this exact schema:
{
  "expense": { "id": string, "name": string, "category": string, "contains": string, "glCode": string, "confidence": number, "why": string } | null,
  "show": { "id": string, "name": string, "siteLocation": string, "startDate": string, "finishDate": string, "confidence": number, "why": string } | null,
  "internalSalesOrderNumber": string | null,
  "needsShowInfo": boolean,
  "followUpQuestion": string
}

Notes:
- confidence is 0..1.
- If expense.glCode is empty, keep it empty and still choose the best expense.
- If you can't choose an expense, expense=null and ask what the expense is.

Model: ${GEMINI_MODEL}

User typed text:
${userText || ""}

OCR text (if any):
${ocrText || ""}

expenses candidates:
${JSON.stringify(expenseContext)}

shows candidates:
${JSON.stringify(showContext)}

internalSalesOrders candidates:
${JSON.stringify(orderContext)}
`.trim();
};

const FinanceGeminiChatTest = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: uuid(),
      role: "assistant",
      content:
        "Hey! Upload an invoice/receipt (or just type the expense). I’ll match it to an expense and return the GL code — then I’ll confirm which show it belongs to and give you the internal sales order number.",
    },
  ]);

  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<AttachmentState | null>(null);

  const [loading, setLoading] = useState(false);
  const [dataStatus, setDataStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [dataError, setDataError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<FinanceSnapshot>({
    expenses: [],
    shows: [],
    internalSalesOrders: [],
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, attachment?.ocrText]);

  const loadData = async () => {
    setDataStatus("loading");
    setDataError(null);
    try {
      // expenses + internalSalesOrders are under /finance
      const [expensesRaw, ordersRaw] = await Promise.all([
        fetchRtdbJson<any>("/finance/expenses"),
        fetchRtdbJson<any>("/finance/internalSalesOrders"),
      ]);

      // shows may be /shows OR /finance/shows (fallback)
      let showsRaw: any = null;
      try {
        showsRaw = await fetchRtdbJson<any>("/shows");
      } catch {
        showsRaw = await fetchRtdbJson<any>("/finance/shows");
      }

      const expenses = objectToArray<Expense>(expensesRaw);
      const internalSalesOrders = objectToArray<InternalSalesOrder>(ordersRaw);
      const shows = objectToArray<ShowRecord>(showsRaw);

      setSnapshot({ expenses, internalSalesOrders, shows });
      setDataStatus("ready");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load finance data";
      setDataStatus("error");
      setDataError(msg);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runOcr = async (file: File) => {
    if (!GEMINI_API_KEY) throw new Error("Missing VITE_GEMINI_API_KEY");
    const base64 = await toOptimizedBase64(file);

    const ocrPrompt =
      "Extract clear, readable text from this invoice/receipt image. Output ONLY the raw text (preserve line breaks). No explanations.";

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { text: ocrPrompt },
            { inlineData: { data: base64, mimeType: file.type || "image/png" } },
          ],
        },
      ],
      generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
    };

    return geminiGenerate(GEMINI_API_KEY, body);
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);

    const previewUrl = URL.createObjectURL(file);
    setAttachment({ file, previewUrl, ocrText: undefined });

    try {
      const text = await runOcr(file);
      setAttachment((prev) => (prev ? { ...prev, ocrText: text } : prev));
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: uuid(),
          role: "assistant",
          content: `OCR failed: ${e instanceof Error ? e.message : "unknown error"}`,
        },
      ]);
    } finally {
      event.target.value = "";
      scrollToBottom();
    }
  };

  const buildAssistantReply = (pick: AiPickJson) => {
    const lines: string[] = [];

    if (!pick.expense) {
      lines.push("I couldn’t confidently match an expense yet.");
      lines.push(pick.followUpQuestion || "What is this expense for (e.g. flight, accommodation, advertising, repair)?");
      return lines.join("\n");
    }

    const expName = pick.expense.name || "Unknown expense";
    const expCat = pick.expense.category ? ` (${pick.expense.category})` : "";
    const conf = typeof pick.expense.confidence === "number" ? ` — ${(pick.expense.confidence * 100).toFixed(0)}% sure` : "";

    if (pick.expense.glCode) {
      lines.push(`Got it — this looks like: ${expName}${expCat}${conf}.`);
      lines.push(`GL code: ${pick.expense.glCode}`);
    } else {
      lines.push(`Got it — best match is: ${expName}${expCat}${conf}.`);
      lines.push(`GL code is empty in the database for this expense (glCode = "").`);
    }

    if (pick.internalSalesOrderNumber) {
      lines.push(`Internal Sales Order: ${pick.internalSalesOrderNumber}`);
    }

    if (pick.needsShowInfo) {
      lines.push(pick.followUpQuestion || "Which show is this for (name or location + date)?");
    } else if (pick.show?.name || pick.show?.siteLocation) {
      lines.push(
        `Show matched: ${pick.show?.name || "Unknown"}${pick.show?.siteLocation ? ` @ ${pick.show.siteLocation}` : ""}`
      );
    }

    return lines.join("\n");
  };

  const handleSend = async () => {
    if (loading) return;

    const typed = input.trim();
    const hasContent = Boolean(typed) || Boolean(attachment?.ocrText);
    if (!hasContent) return;

    const userMsg: ChatMessage = {
      id: uuid(),
      role: "user",
      content: typed || "Please analyse my invoice/receipt",
      ocrText: attachment?.ocrText,
      imageUrl: attachment?.previewUrl,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      if (!GEMINI_API_KEY) {
        throw new Error("Missing VITE_GEMINI_API_KEY (Gemini cannot run).");
      }
      if (dataStatus !== "ready") {
        throw new Error("Finance data is not ready yet. Please wait or reload data.");
      }

      const analysisInput = [typed, attachment?.ocrText ? `OCR:\n${attachment.ocrText}` : null].filter(Boolean).join("\n\n");

      // Pre-filter candidates to keep prompts light (AI still does the final match)
      const expenseCandidates = pickTopExpenses(analysisInput, snapshot.expenses, 28);
      const showCandidates = pickTopShows(analysisInput, snapshot.shows, 28);
      const orderCandidates = findOrdersForShowIds(
        snapshot.internalSalesOrders,
        showCandidates.map((s) => s.id)
      ).slice(0, 60);

      const prompt = buildMatchPrompt({
        userText: typed,
        ocrText: attachment?.ocrText,
        expenseCandidates,
        showCandidates,
        orderCandidates,
      });

      const body = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.25, maxOutputTokens: 700 },
      };

      const raw = await geminiGenerate(GEMINI_API_KEY, body);
      const parsed = safeParseJson(raw) as AiPickJson | null;

      if (!parsed) {
        // fallback: show raw
        setMessages((prev) => [
          ...prev,
          { id: uuid(), role: "assistant", content: raw || "I got your request — can you share a bit more detail?" },
        ]);
      } else {
        const reply = buildAssistantReply(parsed);
        setMessages((prev) => [...prev, { id: uuid(), role: "assistant", content: reply }]);
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { id: uuid(), role: "assistant", content: e instanceof Error ? e.message : "Something went wrong." },
      ]);
    } finally {
      setLoading(false);
      setAttachment((prev) => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return null;
      });
    }
  };

  const headerHint = useMemo(() => {
    if (dataStatus === "loading") return "Loading finance data from RTDB…";
    if (dataStatus === "error") return `Finance data error: ${dataError ?? ""}`;
    if (dataStatus === "ready")
      return `Loaded: ${snapshot.expenses.length} expenses, ${snapshot.shows.length} shows, ${snapshot.internalSalesOrders.length} internal orders`;
    return "Ready when data loads.";
  }, [dataStatus, dataError, snapshot]);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex h-screen max-w-3xl flex-col gap-4 px-4 py-6">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-lg font-semibold">Finance Gemini Chat (RTDB Test Page)</p>
            <p className="text-sm text-slate-600">
              Chat + OCR + AI matching (expense → glCode → show → internalSalesOrderNumber)
            </p>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              <Database className="h-4 w-4" />
              <span className="truncate">{RTDB_BASE}</span>
              <span className="ml-2">{headerHint}</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="gap-2 border-slate-200"
            onClick={loadData}
            disabled={dataStatus === "loading"}
          >
            <RefreshCw className={`h-4 w-4 ${dataStatus === "loading" ? "animate-spin" : ""}`} />
            Reload
          </Button>
        </div>

        {/* Chat list (NO ScrollArea here => avoids “text not fully visible” issues) */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4"
        >
          <div className="flex flex-col gap-4">
            {messages.map((m) => {
              const isAssistant = m.role === "assistant";
              return (
                <div key={m.id} className={`flex w-full ${isAssistant ? "justify-start" : "justify-end"}`}>
                  {isAssistant && (
                    <div className="mr-2 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}

                  <div
                    className={`min-w-0 max-w-[84%] space-y-2 rounded-2xl border px-4 py-3 shadow-sm ${
                      isAssistant
                        ? "border-slate-100 bg-white text-slate-900"
                        : "border-sky-100 bg-sky-50 text-slate-900"
                    }`}
                  >
                    <div className="text-xs font-semibold text-slate-500">{isAssistant ? "Assistant" : "You"}</div>
                    <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.content}</div>

                    {m.ocrText && (
                      <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 break-words">
                        OCR:
                        <div className="mt-1 whitespace-pre-wrap break-words">{m.ocrText}</div>
                      </div>
                    )}

                    {m.imageUrl && (
                      <img
                        src={m.imageUrl}
                        alt="attachment"
                        className="max-h-56 w-auto rounded-xl border border-slate-100 object-contain"
                      />
                    )}
                  </div>

                  {!isAssistant && (
                    <div className="ml-2 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600 ring-1 ring-sky-200">
                      <MessageCircle className="h-4 w-4" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {attachment && (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <ImageIcon className="h-4 w-4 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Attached image</p>
              <p className="truncate text-xs text-slate-500">{attachment.file.name}</p>
              {attachment.ocrText && (
                <p className="mt-1 line-clamp-2 text-xs text-emerald-700">
                  OCR ready (will be used for AI matching)
                </p>
              )}
            </div>
            <img
              src={attachment.previewUrl}
              alt="attachment preview"
              className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
            />
          </div>
        )}

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='Type the expense + (optional) show info. e.g. "flight ticket to Brisbane for Moreton Bay Expo"'
            className="min-h-[110px] resize-none border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"
            disabled={loading}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Button
                type="button"
                variant="outline"
                className="gap-2 border-slate-200 text-slate-800"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
              >
                <ImageIcon className="h-4 w-4" /> Upload image (OCR)
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              <div className="text-xs text-slate-500">
                {GEMINI_API_KEY ? `Model: ${GEMINI_MODEL}` : "⚠️ Missing VITE_GEMINI_API_KEY"}
              </div>
            </div>

            <Button
              type="button"
              className="gap-2 bg-emerald-500 text-white shadow-md shadow-emerald-200 hover:bg-emerald-400"
              onClick={handleSend}
              disabled={loading || (!input.trim() && !attachment?.ocrText) || dataStatus !== "ready"}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </div>
        </div>

        {dataStatus === "error" && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Failed to load finance data: {dataError}
          </div>
        )}
      </div>
    </div>
  );
};

export default FinanceGeminiChatTest;
