export const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL ?? "gemini-2.5-flash";

export const inferGeminiApiVersion = (model: string = GEMINI_MODEL): "v1" | "v1beta" => {
  const fromEnv = import.meta.env.VITE_GEMINI_API_VERSION;
  if (fromEnv === "v1" || fromEnv === "v1beta") return fromEnv;
  return /gemini-2(\.|-|$)/i.test(model) ? "v1beta" : "v1";
};

export const buildGeminiEndpoint = (apiKey: string, model: string = GEMINI_MODEL) => {
  const version = inferGeminiApiVersion(model);
  const cleanModel = model || GEMINI_MODEL;
  return `https://generativelanguage.googleapis.com/${version}/models/${cleanModel}:generateContent?key=${apiKey}`;
};

export const generateGeminiText = async (apiKey: string, body: unknown, model: string = GEMINI_MODEL) => {
  if (!apiKey) throw new Error("Missing VITE_GEMINI_API_KEY");

  const endpoint = buildGeminiEndpoint(apiKey, model);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Gemini request failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  return (
    payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("")?.trim() ?? ""
  );
};
