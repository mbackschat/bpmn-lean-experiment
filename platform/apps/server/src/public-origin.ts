declare const validatedPublicOrigin: unique symbol;

export type ValidatedPublicOrigin = string & Readonly<{
  [validatedPublicOrigin]: true;
}>;

export function validatePublicOrigin(value: string): ValidatedPublicOrigin {
  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw new TypeError("publicOrigin must be an absolute HTTP or HTTPS origin");
  }
  if (
    (origin.protocol !== "http:" && origin.protocol !== "https:")
    || origin.username.length > 0
    || origin.password.length > 0
    || origin.pathname !== "/"
    || origin.search.length > 0
    || origin.hash.length > 0
  ) {
    throw new TypeError(
      "publicOrigin must be an absolute HTTP or HTTPS origin without credentials, path, query, or fragment",
    );
  }
  return origin.origin as ValidatedPublicOrigin;
}
