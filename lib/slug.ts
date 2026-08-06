export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function buildJobSlug(title: string, company: string, country: string): string {
  return [title, company, country].map(slugify).filter(Boolean).join('-')
}

/**
 * [§18 SLUG IDENTITY] Distinct postings can produce the same display slug
 * (proven live: Reddit posted "Senior Product Adoption Strategist, Shopping"
 * twice — j7997020 and j8081271, both slugged
 * senior-product-adoption-strategist-shopping-reddit-worldwide). Two rows
 * behind one URL means surfaces can render either verdict, i.e. "the same
 * job" alternates trust/evidence depending on which row wins the lookup.
 *
 * The rule: the OLDEST posting owns the base slug; later distinct postings
 * get a deterministic source-keyed suffix. Pure, fixture-pinned.
 */
export function postingSlugKey(source: string, sourceId: string): string {
  let h = 5381
  const s = `${source}:${sourceId}`
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

export function chooseJobSlug(input: {
  base: string
  sourceId: string | null | undefined
  /** Active rows whose slug equals base OR matches the reserved -dup- suffix. */
  contenders: Array<{ slug: string; source_id: string | null; created_at: string }>
  key?: string
}): string {
  const { base } = input
  const sourceId = (input.sourceId || '').trim()
  if (!sourceId) return base
  // The oldest ACTIVE posting holding the base slug owns it. Every other
  // posting (including one that currently holds base) resolves to the
  // deterministic source-keyed suffix — a collision always converges, and a
  // resolved suffix stays resolved run after run.
  const baseRows = input.contenders
    .filter((c) => c.slug === base)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
  if (baseRows.length === 0 || baseRows[0].source_id === sourceId) return base
  const key = input.key ?? postingSlugKey('nexa', sourceId)
  const suffixRows = input.contenders.filter((c) => c.slug.startsWith(`${base}-dup-`) && c.source_id !== sourceId)
  const candidate = `${base}-dup-${(key || '').slice(0, 6)}`
  return suffixRows.some((c) => c.slug === candidate) ? `${candidate}-${suffixRows.length + 1}` : candidate
}
