import { getLlmConfig, getPreferredModel } from "@/lib/llm";

interface ImageBody {
  prompt?: string;
}

interface VertexImageGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType?: string;
          data?: string;
        };
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

function buildVertexImageUrl(model: string, apiKey: string): string {
  return `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

function extractVertexImage(payload: VertexImageGenerateResponse): { b64?: string; mimeType?: string } | null {
  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((part) => part.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    return null;
  }

  return {
    b64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png"
  };
}

function extractOpenAiStyleImage(payload: unknown): { b64?: string; mimeType?: string } | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const maybeData = payload as {
    data?: Array<{ b64_json?: string }>;
    image_data?: string;
    output?: Array<{ content?: Array<{ type?: string; image_base64?: string; mime_type?: string }> }>;
  };

  if (maybeData.data?.[0]?.b64_json) {
    return { b64: maybeData.data[0].b64_json, mimeType: "image/png" };
  }

  if (maybeData.image_data) {
    return { b64: maybeData.image_data, mimeType: "image/png" };
  }

  const contentItem = maybeData.output?.[0]?.content?.find((item) => item.type === "output_image" && item.image_base64);
  if (contentItem?.image_base64) {
    return { b64: contentItem.image_base64, mimeType: contentItem.mime_type || "image/png" };
  }

  return null;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ImageBody | null;
  const prompt = body?.prompt?.trim();

  if (!prompt) {
    return Response.json({ error: "Prompt is required." }, { status: 400 });
  }

  const config = getLlmConfig();
  if (!config) {
    return Response.json({ error: "No live model configuration available." }, { status: 503 });
  }

  try {
    if (config.provider === "vertex") {
      const response = await fetch(buildVertexImageUrl(getPreferredModel("image"), config.apiKey), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: [
                    "Generate a single clean editorial illustration.",
                    "Avoid text overlays unless the prompt explicitly asks for typography.",
                    "Return an image, not a textual explanation.",
                    `Prompt: ${prompt}`
                  ].join("\n")
                }
              ]
            }
          ],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"]
          }
        })
      });

      const payload = (await response.json().catch(() => null)) as VertexImageGenerateResponse | null;
      if (!response.ok) {
        throw new Error(payload?.error?.message || `Image generation failed with status ${response.status}.`);
      }

      const image = payload ? extractVertexImage(payload) : null;
      if (!image?.b64) {
        throw new Error("No image payload was returned by Vertex.");
      }

      return Response.json({
        dataUrl: `data:${image.mimeType || "image/png"};base64,${image.b64}`,
        mimeType: image.mimeType || "image/png"
      });
    }

    const response = await fetch(`${config.baseURL ?? "https://api.openai.com/v1"}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        ...config.defaultHeaders
      },
      body: JSON.stringify({
        model: getPreferredModel("image"),
        prompt,
        size: "1024x1024"
      })
    });

    if (!response.ok) {
      throw new Error(`Image generation failed with status ${response.status}.`);
    }

    const payload = await response.json();
    const image = extractOpenAiStyleImage(payload);
    if (!image?.b64) {
      throw new Error("No image payload was returned by the model.");
    }

    return Response.json({
      dataUrl: `data:${image.mimeType || "image/png"};base64,${image.b64}`,
      mimeType: image.mimeType || "image/png"
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Image generation failed."
      },
      { status: 500 }
    );
  }
}
