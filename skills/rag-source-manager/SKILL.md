---
name: rag-source-manager
description: Design retrieval, source filtering, evidence ranking, and citation behavior for Ethics Arena or similar debate systems. Use when integrating search APIs, defining evidence schemas, ranking source quality, formatting citations, or controlling how agents consume external material.
---

# RAG Source Manager

Separate retrieval from argument generation.

## Workflow

1. Define which source classes are allowed for the current feature:
   - papers;
   - analysis articles;
   - legal or policy documents;
   - case studies;
   - optional video or image references.
2. Define ranking rules before wiring the API.
3. Normalize all results into one schema.
4. Summarize each source in a way an agent can safely consume.
5. Expose only the normalized evidence objects to debaters.

## Ranking Rules

- Prefer primary or high-credibility sources over commentary.
- Use videos and images as supporting context, not primary proof.
- Penalize sources with unclear authorship or weak provenance.
- Keep summaries factual and source-local.

## Required Evidence Fields

- `id`
- `title`
- `type`
- `summary`
- `url`
- `credibility_note`
- `used_by`

## Output Format

When designing the retrieval layer, produce:

1. source taxonomy;
2. ranking and filtering rules;
3. evidence schema;
4. citation format for messages;
5. failure modes and safeguards.
