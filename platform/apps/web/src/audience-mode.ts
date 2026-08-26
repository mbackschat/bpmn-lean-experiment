/** The presenter layer is opt-in and does not change the ordinary product route. */
export function audienceModeFromSearch(search: string): boolean {
  return new URLSearchParams(search).get("audience") === "demo";
}
