import { importEvidenceFromUrl } from "@/lib/evidence";

interface ImportEvidenceBody {
  url?: string;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ImportEvidenceBody | null;
  const url = body?.url?.trim();

  if (!url) {
    return Response.json({ error: "URL is required." }, { status: 400 });
  }

  try {
    const item = await importEvidenceFromUrl(url);
    return Response.json({ item });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Import failed."
      },
      { status: 500 }
    );
  }
}
