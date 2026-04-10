import { getLlmConfig, getPreferredModel } from "@/lib/llm";
import { getVoiceForSpeaker } from "@/lib/voice";

interface SpeechBody {
  text?: string;
  speakerId?: string;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as SpeechBody | null;
  const text = body?.text?.trim();

  if (!text) {
    return Response.json({ error: "Text is required." }, { status: 400 });
  }

  const config = getLlmConfig();
  if (!config) {
    return Response.json({ error: "No live model configuration available." }, { status: 503 });
  }

  const selectedVoice = getVoiceForSpeaker(body?.speakerId);

  try {
    const response = await fetch(`${config.baseURL ?? "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        ...config.defaultHeaders
      },
      body: JSON.stringify({
        model: getPreferredModel("speech"),
        messages: [{ role: "user", content: text }],
        modalities: ["text", "audio"],
        audio: {
          voice: selectedVoice,
          format: "wav"
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Speech generation failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          audio?: {
            data?: string;
            format?: string;
          };
        };
      }>;
    };

    const audio = payload.choices?.[0]?.message?.audio;
    if (!audio?.data) {
      throw new Error("No audio payload was returned by the model.");
    }

    const format = audio.format || "wav";
    return Response.json({
      audioDataUrl: `data:audio/${format};base64,${audio.data}`,
      mimeType: `audio/${format}`,
      selectedVoice
    });
  } catch (error) {
    if (selectedVoice !== "alloy") {
      try {
        const fallbackResponse = await fetch(`${config.baseURL ?? "https://api.openai.com/v1"}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
            ...config.defaultHeaders
          },
          body: JSON.stringify({
            model: getPreferredModel("speech"),
            messages: [{ role: "user", content: text }],
            modalities: ["text", "audio"],
            audio: {
              voice: "alloy",
              format: "wav"
            }
          })
        });

        if (fallbackResponse.ok) {
          const payload = (await fallbackResponse.json()) as {
            choices?: Array<{
              message?: {
                audio?: {
                  data?: string;
                  format?: string;
                };
              };
            }>;
          };
          const audio = payload.choices?.[0]?.message?.audio;
          if (audio?.data) {
            const format = audio.format || "wav";
            return Response.json({
              audioDataUrl: `data:audio/${format};base64,${audio.data}`,
              mimeType: `audio/${format}`,
              selectedVoice: "alloy"
            });
          }
        }
      } catch {
        // Fall through to the original error below.
      }
    }

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Speech generation failed.",
        selectedVoice
      },
      { status: 500 }
    );
  }
}
