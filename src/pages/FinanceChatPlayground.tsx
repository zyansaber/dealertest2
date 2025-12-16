import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  Send,
} from "lucide-react";
import { v4 as uuid } from "uuid";

import {
  fetchFinanceSnapshot,
  type FinanceDataSnapshot,
  type FinanceExpense,
  type FinanceShowRecord,
  type InternalSalesOrderRecord,
} from "@/lib/financeShowApi";
import { GEMINI_MODEL, generateGeminiText } from "@/lib/geminiClient";

type ChatRole = "assistant" | "user" | "system";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  ocrText?: string;
  imageUrl?: string;
};

type AttachmentState = {
  file: File;
  previewUrl: string;
  ocrText?: string;
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

  return fileToDataUrl(file).then((result) => {
    const base64 = result.split(",")[1];
    if (!base64) throw new Error("Image encode error");
    return base64;
  });
};

const normalizeText = (value: string | null | undefined) => (value ?? "").toString().toLowerCase();

const keywordsFromText = (value: string) =>
  normalizeText(value)
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);

const scoreExpense = (expense: FinanceExpense, query: string) => {
  const text = normalizeText(query);
  const tokens = keywordsFromText(`${expense.name} ${expense.category} ${expense.contains}`);
  let score = 0;

  tokens.forEach((token) => {
    if (!token) return;
    if (text.includes(token)) score += 3;
  });

  if (expense.name && text.includes(normalizeText(expense.name))) score += 5;
  if (expense.category && text.includes(normalizeText(expense.category))) score += 2;

  return score;
};

const rankExpenses = (query: string, expenses: FinanceExpense[]) => {
  const ranked = expenses
    .map((expense) => ({ expense, score: scoreExpense(expense, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.expense);

  if (ranked.length > 0) return ranked;
  return expenses.slice(0, 8);
};

const rankShows = (query: string, shows: FinanceShowRecord[]) => {
  const text = normalizeText(query);
  const ranked = shows
    .map((show) => {
      const matchName = show.name ? text.includes(normalizeText(show.name)) : false;
      const matchLocation = show.siteLocation ? text.includes(normalizeText(show.siteLocation)) : false;
      const score = (matchName ? 4 : 0) + (matchLocation ? 2 : 0);
      return { show, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.show);

  return ranked.length ? ranked : shows.slice(0, 6);
};

const findOrdersForShowIds = (orders: InternalSalesOrderRecord[], showIds: (string | undefined)[]) => {
  const normalizedIds = showIds
    .map((id) => (id ?? "").toString().toLowerCase())
    .filter((value) => Boolean(value.trim()));
  if (!normalizedIds.length) return [] as InternalSalesOrderRecord[];

  return orders.filter((order) => {
    const candidate = `${order.showId || order.showI || ""}`.toLowerCase();
    return candidate && normalizedIds.includes(candidate);
  });
};

const buildAssistantPrompt = (
  analysisInput: string,
  expenses: FinanceExpense[],
  shows: FinanceShowRecord[],
  orders: InternalSalesOrderRecord[],
  ocrText?: string
) => {
  const expenseContext = expenses.map((exp) => ({
    id: exp.id,
    name: exp.name,
    category: exp.category,
    contains: exp.contains,
    glCode: exp.glCode,
  }));

  const showContext = shows.map((show) => ({
    id: show.id,
    name: show.name,
    siteLocation: show.siteLocation,
    startDate: show.startDate,
    finishDate: show.finishDate,
  }));

  const orderContext = orders.map((order) => ({
    id: order.id,
    showId: order.showId || order.showI,
    showName: order.showName,
    internalSalesOrderNumber: order.internalSalesOrderNumber || order.orderNumber,
  }));

  const intro =
    "You are a friendly finance assistant. Use both the user's typed text and any OCR text to find the best finance/expenses item and return its glCode. If glCode is empty, still share the best match and note that glCode is missing.";

  const showInstruction =
    "If the user provides a show name/location/time, use shows + internalSalesOrders to find showId and internalSalesOrderNumber. After you share any glCode, always ask the user which show this belongs to (name or location/time) so you can confirm the internal code.";

  const formatHint =
    "Respond briefly in English with a warm tone: 1) best expense match + glCode (or say glCode missing); 2) internalSalesOrderNumber if show info is clear; 3) always end by asking for show name/location/time so you can confirm the internal code.";

  return [
    intro,
    showInstruction,
    `Model: ${GEMINI_MODEL}`,
    ocrText ? `OCR text: ${ocrText}` : null,
    `User input: ${analysisInput}`,
    `Candidate expenses: ${JSON.stringify(expenseContext, null, 2)}`,
    `Candidate shows: ${JSON.stringify(showContext, null, 2)}`,
    `Matched internalSalesOrders: ${JSON.stringify(orderContext, null, 2)}`,
    formatHint,
  ]
    .filter(Boolean)
    .join("\n\n");
};

const FinanceChatPlayground = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: uuid(),
      role: "assistant",
      content:
        "Hi! I’m your finance assistant. Tell me the expense (or upload an invoice) and I’ll find the best glCode. Then let me know which show (name or location/time) so I can share the internalSalesOrderNumber.",
    },
  ]);
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<AttachmentState | null>(null);
  const [loading, setLoading] = useState(false);
  const [dataStatus, setDataStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [dataError, setDataError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<FinanceDataSnapshot>({
    expenses: [],
    internalSalesOrders: [],
    shows: [],
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  const visibleExpenses = useMemo(() => rankExpenses(input, snapshot.expenses).slice(0, 6), [
    input,
    snapshot.expenses,
  ]);

  const visibleShows = useMemo(() => rankShows(input, snapshot.shows).slice(0, 5), [
    input,
    snapshot.shows,
  ]);

  const matchedOrders = useMemo(
    () => findOrdersForShowIds(snapshot.internalSalesOrders, visibleShows.map((show) => show.id)),
    [snapshot.internalSalesOrders, visibleShows]
  );

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  };

  const loadData = async () => {
    setDataStatus("loading");
    setDataError(null);
    try {
      const data = await fetchFinanceSnapshot();
      setSnapshot(data);
      setDataStatus("ready");
    } catch (error) {
      console.error(error);
      setDataStatus("error");
      setDataError(error instanceof Error ? error.message : "Failed to load data");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const runOcr = async (file: File) => {
    if (!apiKey) throw new Error("Missing VITE_GEMINI_API_KEY");

    const base64 = await toOptimizedBase64(file);
    const ocrPrompt =
      "Extract clear, readable text from this image (invoice/receipt). Return only the raw text content without explanations.";

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
      generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
    };

    return generateGeminiText(apiKey, body);
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
    } catch (error) {
      console.error(error);
      setAttachment((prev) => (prev ? { ...prev, ocrText: undefined } : prev));
      setMessages((prev) => [
        ...prev,
        {
          id: uuid(),
          role: "assistant",
          content: error instanceof Error ? `OCR failed: ${error.message}` : "OCR failed",
        },
      ]);
    } finally {
      event.target.value = "";
      scrollToBottom();
    }
  };

  const handleSend = async () => {
    if (loading) return;
    const content = input.trim();
    const hasContent = Boolean(content) || Boolean(attachment?.ocrText);
    if (!hasContent) return;

    const userMessage: ChatMessage = {
      id: uuid(),
      role: "user",
      content: content || "请分析我的票据",
      ocrText: attachment?.ocrText,
      imageUrl: attachment?.previewUrl,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      if (!apiKey) {
        throw new Error("Missing VITE_GEMINI_API_KEY. Please set it before using Gemini.");
      }

      const analysisInput = [content, attachment?.ocrText ? `OCR: ${attachment.ocrText}` : null]
        .filter(Boolean)
        .join("\n\n");

      const expenseCandidates = rankExpenses(analysisInput, snapshot.expenses).slice(0, 8);
      const showCandidates = rankShows(analysisInput, snapshot.shows).slice(0, 6);
      const orders = findOrdersForShowIds(
        snapshot.internalSalesOrders,
        showCandidates.map((show) => show.id)
      ).slice(0, 6);

      const prompt = buildAssistantPrompt(
        analysisInput,
        expenseCandidates,
        showCandidates,
        orders,
        attachment?.ocrText
      );

      const body = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 512 },
      };

      const aiResponse = await generateGeminiText(apiKey, body);

      setMessages((prev) => [
        ...prev,
        {
          id: uuid(),
          role: "assistant",
              content: aiResponse || "I noted your request. Tell me more details if you need a specific GL code or show.",
            },
          ]);
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        {
          id: uuid(),
          role: "assistant",
          content: error instanceof Error ? error.message : "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
      setAttachment((prev) => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return null;
      });
    }
  };

  const renderMessage = (message: ChatMessage) => {
    const isAssistant = message.role === "assistant";

    return (
      <div key={message.id} className={`flex w-full ${isAssistant ? "justify-start" : "justify-end"}`}>
        {isAssistant && (
          <div className="mr-2 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
            <Bot className="h-4 w-4" />
          </div>
        )}

        <div
          className={`max-w-[78%] space-y-2 rounded-2xl border px-4 py-3 shadow-sm ${
            isAssistant ? "border-slate-100 bg-white text-slate-900" : "border-sky-100 bg-sky-50 text-slate-900"
          }`}
        >
          <div className="text-xs font-semibold text-slate-500">{isAssistant ? "Assistant" : "You"}</div>
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-900">{message.content}</div>

          {message.ocrText && (
            <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 break-words">
              OCR: {message.ocrText}
            </div>
          )}

          {message.imageUrl && (
            <img src={message.imageUrl} alt="attachment" className="max-h-56 w-auto rounded-xl border border-slate-100 object-contain" />
          )}
        </div>

        {!isAssistant && (
          <div className="ml-2 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600 ring-1 ring-sky-200">
            <MessageCircle className="h-4 w-4" />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex h-screen max-w-3xl flex-col gap-4 px-4 py-6">
        <div className="space-y-1">
          <p className="text-lg font-semibold">Finance AI Chat</p>
          <p className="text-sm text-slate-600">
            Describe the expense or upload an invoice. I’ll return the best glCode and then ask for the show so I can provide the internalSalesOrderNumber.
          </p>
        </div>

        <ScrollArea className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div ref={scrollRef} className="flex flex-col gap-4">
            {messages.map((message) => renderMessage(message))}
          </div>
        </ScrollArea>

        {attachment && (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <ImageIcon className="h-4 w-4 text-emerald-600" />
            <div className="flex-1">
              <p className="font-medium">Attached image</p>
              <p className="text-xs text-slate-500">{attachment.file.name}</p>
              {attachment.ocrText && <p className="mt-1 text-xs text-emerald-700">OCR: {attachment.ocrText}</p>}
            </div>
            <img src={attachment.previewUrl} alt="attachment preview" className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
          </div>
        )}

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type the expense description (and show info if known)."
            className="min-h-[120px] resize-none border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"
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
                <ImageIcon className="h-4 w-4" /> Upload image (optional)
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>
            <Button
              type="button"
              className="gap-2 bg-emerald-500 text-white shadow-md shadow-emerald-200 hover:bg-emerald-400"
              onClick={handleSend}
              disabled={loading || (!input.trim() && !attachment?.ocrText)}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
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

export default FinanceChatPlayground;
