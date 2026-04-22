import { NextResponse } from "next/server";

import { getLlmConfig } from "@/lib/llm";

function mask(value: string, visibleStart = 6, visibleEnd = 4): string {
  if (!value) {
    return "";
  }
  if (value.length <= visibleStart + visibleEnd) {
    return "***";
  }
  return `${value.slice(0, visibleStart)}***${value.slice(-visibleEnd)}`;
}

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production." }, { status: 404 });
  }

  const config = getLlmConfig();
  if (!config) {
    return NextResponse.json({
      ok: false,
      error: "No LLM config found. Set OPENROUTER_API_KEY or OPENAI_API_KEY in .env.local."
    });
  }

  const model = config.models[0] ?? "";

  // Minimal, safe probe to check auth + model routing.
  const url = `${config.baseURL ?? "https://api.openai.com/v1"}/chat/completions`;
  const payload = {
    model,
    messages: [{ role: "user", content: "ping" }],
    temperature: 0
  };

  let probeStatus: number | null = null;
  let probeBody: unknown = null;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        ...(config.defaultHeaders ?? {})
      },
      body: JSON.stringify(payload)
    });

    probeStatus = response.status;
    const text = await response.text();
    try {
      probeBody = JSON.parse(text);
    } catch {
      probeBody = text;
    }
  } catch (error) {
    probeBody = error instanceof Error ? { message: error.message, name: error.name } : String(error);
  }

  return NextResponse.json({
    ok: probeStatus !== null && probeStatus >= 200 && probeStatus < 300,
    provider: config.provider,
    baseURL: config.baseURL,
    model,
    apiKeyMasked: mask(config.apiKey),
    defaultHeaders: Object.keys(config.defaultHeaders ?? {}),
    probe: {
      url,
      status: probeStatus,
      body: probeBody
    }
  });
}
