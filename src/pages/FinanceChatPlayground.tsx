import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot,
  Database,
  FileText,
  Image as ImageIcon,
  Loader2,
  MapPin,
  MessageCircle,
  RefreshCcw,
  Send,
  Sparkles,
} from "lucide-react";
import { v4 as uuid } from "uuid";

import {
  fetchFinanceSnapshot,
  financeDataSummary,
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

const normalizeText = (value: string) => value.toLowerCase();

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

const findOrdersForShowIds = (orders: InternalSalesOrderRecord[], showIds: string[]) => {
  const normalizedIds = showIds.map((id) => id.toLowerCase()).filter(Boolean);
  if (!normalizedIds.length) return [] as InternalSalesOrderRecord[];

  return orders.filter((order) => {
    const candidate = (order.showId || order.showI || "").toLowerCase();
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

  const intro = `你是一个财务助手，帮助用户把费用描述或票据内容映射到 finance/expenses 里的条目，并返回 glCode。如果 glCode 为空，说明需要人工补充，仍然返回最佳匹配项并提示缺少 glCode。`;

  const showInstruction =
    "如果用户提供了 show 名称/地点/时间，利用 shows 数据和 internalSalesOrders 数据找到对应的 showId，并返回 internalSalesOrderNumber；若没有足够信息，先明确询问 show 名称或地点时间。";

  const formatHint =
    "用简短的中文回复：1) 当前理解/识别的费用名称 + glCode；2) 如果已推断 show，给出 internalSalesOrderNumber；3) 如果信息不足，提出具体问题（例如需要 show 名称或明确的费用分类）。";

  return [
    intro,
    showInstruction,
    `模型: ${GEMINI_MODEL}`,
    ocrText ? `OCR 内容: ${ocrText}` : null,
    `用户输入: ${analysisInput}`,
    `候选费用 (精简): ${JSON.stringify(expenseContext, null, 2)}`,
    `候选展会: ${JSON.stringify(showContext, null, 2)}`,
    `匹配到的 internalSalesOrders: ${JSON.stringify(orderContext, null, 2)}`,
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
        "你好，我是 Show 财务 AI 测试助手。告诉我费用用途或者上传票据，我会在 finance/expenses 中找到最接近的条目并给出 glCode。如需对接展会，请告诉我 show 名称、地点或时间。",
    },
  ]);
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<AttachmentState | null>(null);
  const [loading, setLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<"idle" | "scanning" | "error">("idle");
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

  const summary = useMemo(() => financeDataSummary(snapshot), [snapshot]);

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
      setDataError(error instanceof Error ? error.message : "加载失败");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const runOcr = async (file: File) => {
    if (!apiKey) throw new Error("缺少 VITE_GEMINI_API_KEY");

    const base64 = await toOptimizedBase64(file);
    const ocrPrompt =
      "请从图片中提取清晰可读的中文或英文文本，返回单行或多行原文，不要加入解释或格式化。若为票据/发票，保留金额与品类关键字。";

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
    setAttachment({ file, previewUrl, ocrText: "正在识别 OCR…" });
    setOcrStatus("scanning");

    try {
      const text = await runOcr(file);
      setAttachment((prev) => (prev ? { ...prev, ocrText: text } : prev));
      setOcrStatus("idle");
    } catch (error) {
      console.error(error);
      setAttachment((prev) => (prev ? { ...prev, ocrText: undefined } : prev));
      setOcrStatus("error");
      setMessages((prev) => [
        ...prev,
        {
          id: uuid(),
          role: "assistant",
          content: error instanceof Error ? `OCR 失败：${error.message}` : "OCR 失败",
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
        throw new Error("缺少 VITE_GEMINI_API_KEY，无法调用 Gemini。请在环境变量中配置。");
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
          content: aiResponse || "我已记录你的需求，如需更详细的信息请告诉我。",
        },
      ]);
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        {
          id: uuid(),
          role: "assistant",
          content: error instanceof Error ? error.message : "处理失败，请稍后重试",
        },
      ]);
    } finally {
      setLoading(false);
      setAttachment((prev) => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return null;
      });
      setOcrStatus("idle");
    }
  };

  const handleQuickFill = (text: string) => setInput(text);

  const renderMessage = (message: ChatMessage) => (
    <div
      key={message.id}
      className={`flex flex-col gap-2 rounded-2xl border border-white/5 px-3 py-2 shadow-sm backdrop-blur ${
        message.role === "assistant" ? "bg-white/5" : "bg-emerald-500/10"
      }`}
    >
      <div className="flex items-center gap-2 text-xs text-slate-300">
        {message.role === "assistant" ? (
          <Bot className="h-4 w-4 text-emerald-300" />
        ) : (
          <MessageCircle className="h-4 w-4 text-sky-300" />
        )}
        <span>{message.role === "assistant" ? "财务 AI" : "你"}</span>
      </div>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-50">{message.content}</div>
      {message.ocrText && (
        <div className="rounded-xl border border-dashed border-emerald-400/40 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-100">
          OCR: {message.ocrText}
        </div>
      )}
      {message.imageUrl && (
        <img
          src={message.imageUrl}
          alt="attachment"
          className="max-h-52 w-auto rounded-xl border border-white/10 object-contain"
        />
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#0b1224,_#020617)] text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-12 pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/5 bg-white/5 px-4 py-3 shadow-lg backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Finance AI Playground</p>
              <p className="text-xs text-slate-200">
                独立测试页 · 使用 Gemini + OCR 连接 Snowy River Show finance 数据库
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="border-emerald-400/60 text-emerald-100">
              数据: {summary.expenses} 费用 / {summary.internalSalesOrders} internalSalesOrders / {summary.shows} shows
            </Badge>
            <Badge
              variant="outline"
              className={`border-white/20 ${apiKey ? "text-white" : "border-red-500/50 text-red-100"}`}
            >
              {apiKey ? "Gemini 已配置" : "缺少 VITE_GEMINI_API_KEY"}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 border-white/20 text-white"
              onClick={loadData}
              disabled={dataStatus === "loading"}
            >
              {dataStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              刷新数据
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <Card className="border-white/5 bg-white/5 shadow-2xl backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg text-white">
                <Bot className="h-5 w-5 text-emerald-300" /> 聊天区
              </CardTitle>
            </CardHeader>
            <CardContent className="flex h-[70vh] flex-col gap-3">
              <ScrollArea className="h-full rounded-2xl border border-white/5 bg-slate-950/40 p-3">
                <div ref={scrollRef} className="flex max-h-full flex-col gap-3 overflow-y-auto pr-2">
                  {messages.map((message) => renderMessage(message))}
                </div>
              </ScrollArea>

              {attachment && (
                <div className="flex items-start gap-3 rounded-2xl border border-dashed border-emerald-400/40 bg-emerald-500/10 p-3 text-sm text-emerald-50">
                  <ImageIcon className="mt-1 h-4 w-4" />
                  <div className="flex-1 space-y-1">
                    <p className="font-medium">已附加的票据/照片</p>
                    <p className="text-xs text-emerald-100">{attachment.file.name}</p>
                    {attachment.ocrText && (
                      <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs text-white">
                        OCR: {attachment.ocrText}
                      </div>
                    )}
                    {ocrStatus === "scanning" && (
                      <div className="flex items-center gap-2 text-xs text-emerald-100">
                        <Loader2 className="h-3 w-3 animate-spin" /> OCR 处理中…
                      </div>
                    )}
                  </div>
                  <img
                    src={attachment.previewUrl}
                    alt="attachment preview"
                    className="h-20 w-20 rounded-lg border border-white/10 object-cover"
                  />
                </div>
              )}

              <div className="space-y-3 rounded-2xl border border-white/5 bg-slate-950/50 p-3 shadow-inner">
                <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                  <span className="font-semibold text-white">快捷示例:</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 rounded-full bg-white/10 text-xs text-white"
                    onClick={() =>
                      handleQuickFill("我在展会租赁摊位和广告，需要报销，请帮我找对应 glCode 并标注 internalSalesOrderNumber")
                    }
                  >
                    展会摊位 & 广告
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 rounded-full bg-white/10 text-xs text-white"
                    onClick={() =>
                      handleQuickFill("我拍了一张维修服务的发票，帮我归类费用并告诉我需要哪个 show 的 internalSalesOrderNumber")
                    }
                  >
                    维修服务发票
                  </Button>
                </div>

                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="描述用户需求，或者上传票据后直接发送"
                  className="min-h-[110px] resize-none border-white/10 bg-slate-900/60 text-white placeholder:text-slate-400"
                  disabled={loading}
                />

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-slate-200">
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2 border-white/20 text-white"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={loading}
                    >
                      <ImageIcon className="h-4 w-4" /> 上传票据/照片
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <div className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-[11px] text-slate-200">
                      <Database className="h-3.5 w-3.5" /> finance 数据来自 show Firebase
                    </div>
                  </div>
                  <Button
                    type="button"
                    className="gap-2 bg-emerald-500 text-slate-900 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400"
                    onClick={handleSend}
                    disabled={loading || (!input.trim() && !attachment?.ocrText)}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} 提交给 AI
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Card className="border-white/5 bg-white/5 shadow-xl backdrop-blur">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-white">
                  <Database className="h-4 w-4 text-emerald-300" /> 数据概览
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-100">
                <div className="flex flex-wrap gap-2 text-xs text-slate-200">
                  <Badge variant="secondary" className="bg-white/10 text-white">
                    费用: {summary.expenses}
                  </Badge>
                  <Badge variant="secondary" className="bg-white/10 text-white">
                    internalSalesOrders: {summary.internalSalesOrders}
                  </Badge>
                  <Badge variant="secondary" className="bg-white/10 text-white">
                    shows: {summary.shows}
                  </Badge>
                  {dataStatus === "loading" && (
                    <span className="flex items-center gap-2 text-emerald-100">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> 数据同步中…
                    </span>
                  )}
                  {dataStatus === "error" && (
                    <span className="text-red-200">数据加载失败：{dataError}</span>
                  )}
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                  <p className="mb-2 text-xs font-semibold text-white">Top 费用匹配</p>
                  {visibleExpenses.length ? (
                    <div className="space-y-2">
                      {visibleExpenses.map((expense) => (
                        <div
                          key={expense.id}
                          className="rounded-xl border border-white/5 bg-white/5 p-2 text-xs text-slate-100"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-white">{expense.name || "未命名"}</span>
                            {expense.glCode ? (
                              <Badge className="bg-emerald-600 text-xs">glCode: {expense.glCode}</Badge>
                            ) : (
                              <Badge variant="outline" className="border-amber-400/60 text-amber-100">
                                glCode 未填写
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-300">{expense.category}</p>
                          <p className="text-[11px] text-slate-400">{expense.contains || "无关键词"}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">输入一些描述以查看推荐费用。</p>
                  )}
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                  <p className="mb-2 text-xs font-semibold text-white">可能的展会 / Internal Sales Orders</p>
                  {visibleShows.length ? (
                    <div className="space-y-2">
                      {visibleShows.map((show) => (
                        <div
                          key={show.id}
                          className="rounded-xl border border-white/5 bg-white/5 p-2 text-xs text-slate-100"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-white">{show.name || "未命名 show"}</span>
                            <Badge variant="outline" className="border-emerald-300/60 text-emerald-100">
                              showId: {show.id}
                            </Badge>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-300">
                            {show.siteLocation && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                                <MapPin className="h-3 w-3" /> {show.siteLocation}
                              </span>
                            )}
                            {(show.startDate || show.finishDate) && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                                <FileText className="h-3 w-3" />
                                {[show.startDate, show.finishDate].filter(Boolean).join(" ~ ")}
                              </span>
                            )}
                          </div>
                          {matchedOrders.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {matchedOrders
                                .filter((order) => (order.showId || order.showI) === show.id)
                                .map((order) => (
                                  <div
                                    key={order.id}
                                    className="flex items-center justify-between rounded-lg bg-black/30 px-2 py-1 text-[11px] text-slate-200"
                                  >
                                    <span>internalSalesOrderNumber</span>
                                    <span className="font-mono text-xs text-emerald-200">
                                      {order.internalSalesOrderNumber || order.orderNumber || "缺失"}
                                    </span>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">提供 show 名称或地点以获取匹配。</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/5 bg-white/5 shadow-xl backdrop-blur">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-white">
                  <Sparkles className="h-4 w-4 text-emerald-300" /> 使用说明
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-100">
                <p>· 这是一个独立测试页，不需要登录，直接访问即可。</p>
                <p>· 支持文本描述 + 图片 OCR，Gemini 会综合判断对应的 finance/expenses 条目。</p>
                <p>· 想获取 internalSalesOrderNumber，请在输入中提供 show 名称、地点或时间。</p>
                <p>· 数据源：{`https://snowyrivercaravanshow-default-rtdb.asia-southeast1.firebasedatabase.app`}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinanceChatPlayground;
