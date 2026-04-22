export type LlmProvider = "vertex" | "openrouter" | "openai";

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
  models: string[];
  baseURL?: string;
  defaultHeaders?: Record<string, string>;
  expressMode?: boolean;
}

type JsonSchema = Record<string, unknown>;

interface VertexGenerateParams {
  model: string;
  instructions?: string;
  input: string;
  schema?: JsonSchema;
  temperature?: number;
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

function isVertexExpressEnabled(): boolean {
  return process.env.VERTEX_USE_EXPRESS_MODE === "true" || process.env.GOOGLE_GENAI_USE_VERTEXAI === "true";
}

export function getLlmConfig(): LlmConfig | null {
  if (isVertexExpressEnabled() && process.env.GOOGLE_API_KEY) {
    return {
      provider: "vertex",
      apiKey: process.env.GOOGLE_API_KEY,
      expressMode: true,
      models: unique([
        process.env.VERTEX_MODEL || "gemini-2.5-flash",
        ...parseModelList(process.env.VERTEX_FALLBACK_MODELS),
        "gemini-2.5-flash",
        "gemini-2.5-pro"
      ]),
      baseURL: "https://aiplatform.googleapis.com/v1"
    };
  }

  if (process.env.OPENROUTER_API_KEY) {
    return {
      provider: "openrouter",
      apiKey: process.env.OPENROUTER_API_KEY,
      models: unique([
        process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || "openai/gpt-4o-mini",
        ...parseModelList(process.env.OPENROUTER_FALLBACK_MODELS),
        "openai/gpt-4o-mini",
        "anthropic/claude-3.5-haiku",
        "google/gemini-2.0-flash-001"
      ]),
      baseURL: "https://openrouter.ai/api/v1",
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
      models: unique([process.env.OPENAI_MODEL || "gpt-4.1-mini", "gpt-4o-mini"]),
      baseURL: "https://api.openai.com/v1"
    };
  }

  return null;
}

export function getPreferredModel(kind: "chat" | "multimodal" | "embedding" | "image" = "chat"): string {
  const config = getLlmConfig();
  if (!config) {
    return kind === "embedding" ? "text-embedding-3-small" : "gpt-4o-mini";
  }

  if (config.provider === "vertex") {
    const envModel =
      kind === "multimodal"
        ? process.env.VERTEX_MULTIMODAL_MODEL
        : kind === "embedding"
          ? process.env.VERTEX_EMBEDDING_MODEL
          : kind === "image"
            ? process.env.VERTEX_IMAGE_MODEL
            : undefined;

    if (envModel?.trim()) {
      return envModel.trim();
    }

    if (kind === "embedding") {
      return "gemini-embedding-001";
    }

    if (kind === "image") {
      return "gemini-2.5-flash-image";
    }

    return config.models[0] ?? "gemini-2.5-flash";
  }

  const envModel =
    kind === "multimodal"
      ? process.env.OPENROUTER_MULTIMODAL_MODEL || process.env.OPENAI_MULTIMODAL_MODEL
      : kind === "embedding"
        ? process.env.OPENROUTER_EMBEDDING_MODEL || process.env.OPENAI_EMBEDDING_MODEL
        : kind === "image"
          ? process.env.OPENROUTER_IMAGE_MODEL || process.env.OPENAI_IMAGE_MODEL
          : undefined;

  if (envModel?.trim()) {
    return envModel.trim();
  }

  if (kind === "embedding") {
    return config.provider === "openrouter" ? "openai/text-embedding-3-small" : "text-embedding-3-small";
  }

  if (kind === "image") {
    return config.provider === "openrouter" ? "openai/gpt-image-1" : "gpt-image-1";
  }

  if (kind === "multimodal") {
    return config.models[0] ?? "openai/gpt-4o-mini";
  }

  return config.models[0] ?? "gpt-4o-mini";
}

function buildVertexUrl(model: string, action: "generateContent" | "embedContent", apiKey: string): string {
  return `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:${action}?key=${encodeURIComponent(apiKey)}`;
}

function toVertexRole(role: string): "user" | "model" {
  return role === "assistant" ? "model" : "user";
}

function parseDataUrl(url: string): { mimeType: string; data: string } | null {
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(url);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    data: match[2]
  };
}

function toVertexPart(item: unknown): Record<string, unknown>[] {
  if (typeof item === "string") {
    return item.trim() ? [{ text: item }] : [];
  }

  if (!item || typeof item !== "object") {
    return [];
  }

  const record = item as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";

  if (type === "text" && typeof record.text === "string") {
    return [{ text: record.text }];
  }

  if (type === "image_url") {
    const imageUrl = record.image_url as { url?: string } | undefined;
    if (typeof imageUrl?.url === "string") {
      const parsed = parseDataUrl(imageUrl.url);
      if (parsed) {
        return [{ inlineData: { mimeType: parsed.mimeType, data: parsed.data } }];
      }
      return [{ fileData: { mimeType: "image/*", fileUri: imageUrl.url } }];
    }
  }

  if (type === "file") {
    const file = record.file as { file_data?: string } | undefined;
    if (typeof file?.file_data === "string") {
      const parsed = parseDataUrl(file.file_data);
      if (parsed) {
        return [{ inlineData: { mimeType: parsed.mimeType, data: parsed.data } }];
      }
    }
  }

  return [];
}

function toVertexContents(messages: Array<Record<string, unknown>>, instructions?: string): Array<Record<string, unknown>> {
  const contents: Array<Record<string, unknown>> = [];

  if (instructions?.trim()) {
    contents.push({
      role: "user",
      parts: [{ text: instructions.trim() }]
    });
  }

  for (const message of messages) {
    const role = toVertexRole(typeof message.role === "string" ? message.role : "user");
    const content = message.content;
    const parts = Array.isArray(content)
      ? content.flatMap((item) => toVertexPart(item))
      : toVertexPart(typeof content === "string" ? content : "");

    if (parts.length) {
      contents.push({ role, parts });
    }
  }

  return contents;
}

function mapSchemaType(type: unknown): unknown {
  if (typeof type !== "string") {
    return type;
  }

  const upper = type.toUpperCase();
  if (upper === "OBJECT" || upper === "ARRAY" || upper === "STRING" || upper === "NUMBER" || upper === "INTEGER" || upper === "BOOLEAN" || upper === "NULL") {
    return upper;
  }

  return type;
}

function toVertexSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map((item) => toVertexSchema(item));
  }

  if (!schema || typeof schema !== "object") {
    return schema;
  }

  const record = schema as Record<string, unknown>;
  const converted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (key === "type") {
      converted[key] = mapSchemaType(value);
      continue;
    }

    if (key === "additionalProperties" && value === false) {
      continue;
    }

    converted[key] = toVertexSchema(value);
  }

  return converted;
}

function extractVertexText(payload: VertexGenerateResponse): string {
  const candidate = payload.candidates?.[0];
  const text = candidate?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Vertex returned empty content.");
  }

  return text;
}

interface VertexGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  error?: {
    message?: string;
  };
}

async function callVertexGenerate(params: VertexGenerateParams): Promise<string> {
  const config = getLlmConfig();
  if (!config || config.provider !== "vertex") {
    throw new Error("Vertex configuration is not available.");
  }

  const response = await fetch(buildVertexUrl(params.model, "generateContent", config.apiKey), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: params.input }]
        }
      ],
      ...(params.instructions?.trim()
        ? {
            systemInstruction: {
              parts: [{ text: params.instructions.trim() }]
            }
          }
        : {}),
      generationConfig: {
        temperature: params.temperature ?? 0.2,
        ...(params.schema
          ? {
              responseMimeType: "application/json",
              responseSchema: toVertexSchema(params.schema)
            }
          : {})
      }
    })
  });

  const payload = (await response.json().catch(() => null)) as VertexGenerateResponse | null;
  if (!response.ok) {
    const message = payload?.error?.message || `Vertex generateContent failed with status ${response.status}.`;
    throw new Error(message);
  }

  if (!payload) {
    throw new Error("Vertex returned an empty response.");
  }

  return extractVertexText(payload);
}

export async function generateStructuredObject(params: {
  model: string;
  instructions?: string;
  input: string;
  schema: JsonSchema;
  temperature?: number;
}): Promise<string> {
  const config = getLlmConfig();
  if (!config) {
    throw new Error("No live model configuration available.");
  }

  if (config.provider === "vertex") {
    return callVertexGenerate({
      model: params.model,
      instructions: params.instructions,
      input: params.input,
      schema: params.schema,
      temperature: params.temperature
    });
  }

  const response = await fetch(`${config.baseURL ?? "https://api.openai.com/v1"}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...config.defaultHeaders
    },
    body: JSON.stringify({
      model: params.model,
      messages: [
        ...(params.instructions?.trim() ? [{ role: "system", content: params.instructions.trim() }] : []),
        { role: "user", content: params.input }
      ],
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

export async function callJsonChatCompletion(params: {
  model: string;
  messages: Array<Record<string, unknown>>;
  temperature?: number;
  schema?: JsonSchema;
}): Promise<string> {
  const config = getLlmConfig();
  if (!config) {
    throw new Error("No live model configuration available.");
  }

  if (config.provider === "vertex") {
    const systemMessage = params.messages.find((message) => message.role === "system");
    const nonSystemMessages = params.messages.filter((message) => message.role !== "system");
    const response = await fetch(buildVertexUrl(params.model, "generateContent", config.apiKey), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: toVertexContents(nonSystemMessages, undefined),
        ...(typeof systemMessage?.content === "string" && systemMessage.content.trim()
          ? {
              systemInstruction: {
                parts: [{ text: systemMessage.content.trim() }]
              }
            }
          : {}),
        generationConfig: {
          temperature: params.temperature ?? 0.2,
          responseMimeType: "application/json",
          ...(params.schema
            ? {
                responseSchema: toVertexSchema(params.schema)
              }
            : {})
        }
      })
    });

    const payload = (await response.json().catch(() => null)) as VertexGenerateResponse | null;
    if (!response.ok) {
      const message = payload?.error?.message || `Vertex generateContent failed with status ${response.status}.`;
      throw new Error(message);
    }

    if (!payload) {
      throw new Error("Vertex returned an empty response.");
    }

    return extractVertexText(payload);
  }

  const response = await fetch(`${config.baseURL ?? "https://api.openai.com/v1"}/chat/completions`, {
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

interface VertexEmbeddingResponse {
  embedding?: {
    values?: number[];
  };
  error?: {
    message?: string;
  };
}

export async function createEmbedding(input: string): Promise<number[]> {
  const text = input.trim();
  if (!text) {
    return [];
  }

  const config = getLlmConfig();
  if (!config) {
    return [];
  }

  if (config.provider === "vertex") {
    const response = await fetch(buildVertexUrl(getPreferredModel("embedding"), "embedContent", config.apiKey), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content: {
          role: "user",
          parts: [{ text }]
        },
        taskType: "SEMANTIC_SIMILARITY"
      })
    });

    const payload = (await response.json().catch(() => null)) as VertexEmbeddingResponse | null;
    if (!response.ok) {
      return [];
    }

    return payload?.embedding?.values ?? [];
  }

  const response = await fetch(`${config.baseURL ?? "https://api.openai.com/v1"}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...config.defaultHeaders
    },
    body: JSON.stringify({
      model: getPreferredModel("embedding"),
      input: text
    })
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };

  return payload.data?.[0]?.embedding ?? [];
}
