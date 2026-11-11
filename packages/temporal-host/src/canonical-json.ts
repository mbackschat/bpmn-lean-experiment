/**
 * JSON in which equal content has equal bytes whatever the construction order: every object's keys in code-unit order.
 * Population addresses and digests, engine-api identifiers and digests, and the population harness's command digests
 * hash it, so its output is part of their contract.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, member: unknown) =>
    member !== null && typeof member === "object" && !Array.isArray(member)
      ? Object.fromEntries(Object.keys(member).sort().map((key) => [key, (member as Record<string, unknown>)[key]]))
      : member);
}
