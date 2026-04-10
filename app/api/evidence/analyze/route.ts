import { analyzeUploadedEvidence } from "@/lib/evidence";

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "A file upload is required." }, { status: 400 });
  }

  try {
    const item = await analyzeUploadedEvidence(file);
    return Response.json({ item });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Upload analysis failed."
      },
      { status: 500 }
    );
  }
}

