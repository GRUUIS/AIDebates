import { searchEvidence } from "@/lib/evidence";

interface SearchEvidenceBody {
  query?: string;
  topic?: string;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as SearchEvidenceBody | null;
  const query = body?.query?.trim();

  if (!query) {
    return Response.json({ error: "Query is required.", items: [] }, { status: 400 });
  }

  try {
    const items = await searchEvidence(query, body?.topic);
    return Response.json({ items });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Search failed.",
        items: []
      },
      { status: 500 }
    );
  }
}
