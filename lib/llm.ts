import OpenAI from "openai";

export type LlmProvider = "openrouter" | "openai";

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
  models: string[];
  baseURL?: string;
  defaultHeaders?: Record<string, string>;
}

function parseModelList(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export function getLlmConfig(): LlmConfig | null {
  if (process.env.OPENROUTER_API_KEY) {
    return {
      provider: "openrouter",
      apiKey: process.env.OPENROUTER_API_KEY,
      models: unique([
        process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || "openai/gpt-4o-mini",
        ...parseModelList(process.env.OPENROUTER_FALLBACK_MODELS),
        "openai/gpt-4o-mini"
      ]),
      baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      defaultHeaders: {
        ...(process.env.OPENROUTER_SITE_URL ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL } : {}),
        ...(process.env.OPENROUTER_APP_NAME ? { "X-Title": process.env.OPENROUTER_APP_NAME } : {})
      }
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      models: unique([process.env.OPENAI_MODEL || "gpt-4o-mini", "gpt-4o-mini"]),
      baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
    };
  }

  return null;
}

export function getClient(config: LlmConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    defaultHeaders: config.defaultHeaders
  });
}

export function getPreferredModel(kind: "chat" | "multimodal" | "embedding" | "speech" | "image" = "chat"): string {
  const config = getLlmConfig();
  if (!config) {
    return kind === "embedding" ? "text-embedding-3-small" : "gpt-4o-mini";
  }

  const envModel =
    kind === "multimodal"
      ? process.env.OPENROUTER_MULTIMODAL_MODEL || process.env.OPENAI_MULTIMODAL_MODEL
      : kind === "embedding"
        ? process.env.OPENROUTER_EMBEDDING_MODEL || process.env.OPENAI_EMBEDDING_MODEL
        : kind === "speech"
          ? process.env.OPENROUTER_SPEECH_MODEL || process.env.OPENAI_SPEECH_MODEL
          : kind === "image"
            ? process.env.OPENROUTER_IMAGE_MODEL || process.env.OPENAI_IMAGE_MODEL
            : undefined;

  if (envModel?.trim()) {
    return envModel.trim();
  }

  if (kind === "embedding") {
    return config.provider === "openrouter" ? "openai/text-embedding-3-small" : "text-embedding-3-small";
  }

  if (kind === "speech") {
    return config.provider === "openrouter" ? "openai/gpt-4o-mini-tts" : "gpt-4o-mini-tts";
  }

  if (kind === "image") {
    return config.provider === "openrouter" ? "openai/gpt-image-1" : "gpt-image-1";
  }

  if (kind === "multimodal") {
    return config.models[0] ?? "openai/gpt-4o-mini";
  }

  return config.models[0] ?? "gpt-4o-mini";
}

export async function callJsonChatCompletion(params: {
  model: string;
  messages: Array<Record<string, unknown>>;
  temperature?: number;
}): Promise<string> {
  const config = getLlmConfig();
  if (!config) {
    throw new Error("No live model configuration available.");
  }

  const response = await fetch(`${config.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...config.defaultHeaders
    },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      temperature: params.temperature ?? 0.2,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    throw new Error(`Chat completion failed with status ${response.status}.`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Chat completion returned empty content.");
  }

  return content;
}

