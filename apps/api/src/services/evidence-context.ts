/**
 * Builds legitimate source context for NLI verification of an evidence chunk (F8).
 *
 * Chunks are often subject-less ("Its operating voltage is 3.5V to 5.5V DC."), which makes the M1
 * cross-encoder return neutral for a correct claim ("The DHT11 operating voltage is 3.5 V to 5.5 V").
 * The context uses ONLY stored provenance: document title, section heading, and the preceding sentence
 * of the same document (attached by the AI service for chunks that open with an anaphoric subject).
 * M1 uses it for the cross-encoder premise only; numeric/tag contradiction rules still see raw text.
 */
export function buildEvidenceContext(
  metadata: unknown,
  heading?: string | null
): string | undefined {
  let meta: Record<string, unknown> = {};
  if (typeof metadata === 'string') {
    try {
      meta = JSON.parse(metadata) ?? {};
    } catch {
      meta = {};
    }
  } else if (metadata && typeof metadata === 'object') {
    meta = metadata as Record<string, unknown>;
  }

  const rawTitle = (meta.filename ?? meta.documentFilename ?? meta.title) as string | undefined;
  const title = rawTitle
    ? rawTitle
        .replace(/\.[a-z0-9]{2,4}$/i, '')
        .replace(/\s*\(\d+\)\s*/g, ' ')
        .split('__')[0]
        .replace(/_+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : undefined;
  const section = (heading ?? meta.heading ?? meta.section) as string | undefined;
  const preceding = meta.precedingText as string | undefined;

  const parts: string[] = [];
  if (title) parts.push(`Source document: ${title}.`);
  if (section && String(section).trim()) parts.push(`Section: ${String(section).trim()}.`);
  if (preceding && String(preceding).trim()) parts.push(`Preceding text: ${String(preceding).trim()}`);
  return parts.length ? parts.join(' ') : undefined;
}
