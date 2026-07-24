function normalize(value: string): string {
  return value.trim().toLocaleLowerCase()
}

/**
 * cmdk filter score for a language option. Higher scores sort first; zero
 * hides the option. Exact canonical names/IDs deliberately outrank aliases
 * and prefixes, so searching "c" puts C before Closure Templates, while an
 * exact shorthand such as "ts" still puts TypeScript ahead of loose matches.
 */
export function rankLanguageSearch(
  id: string,
  name: string,
  aliases: string[] | undefined,
  query: string
): number {
  const search = normalize(query)
  if (!search) return 1

  const normalizedId = normalize(id)
  const normalizedName = normalize(name)
  const normalizedAliases = (aliases ?? []).map(normalize)

  if (normalizedId === search || normalizedName === search) return 1
  if (normalizedAliases.includes(search)) return 0.95
  if (normalizedId.startsWith(search) || normalizedName.startsWith(search)) return 0.85
  if (normalizedAliases.some((alias) => alias.startsWith(search))) return 0.75
  if (normalizedId.includes(search) || normalizedName.includes(search)) return 0.6
  if (normalizedAliases.some((alias) => alias.includes(search))) return 0.5
  return 0
}
