import { getLlmConfig, getPreferredModel } from "@/lib/llm";

interface ImageBody {
  prompt?: string;
}

function extractImageData(payload: unknown): { b64?: string; mimeType?: string } | null {
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
    const image = extractImageData(payload);
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

