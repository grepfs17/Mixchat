export type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: number; error: string };

/**
 * Read and parse a JSON request body with a hard size ceiling.
 *
 * The declared Content-Length is checked first so oversized uploads are
 * rejected before the body is buffered. The decoded text is checked again
 * because chunked requests do not always declare a length.
 */
export async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<JsonBodyResult> {
  const declared = request.headers.get("content-length");
  if (declared) {
    const size = Number(declared);
    if (Number.isFinite(size) && size > maxBytes) {
      return { ok: false, status: 413, error: "Request body too large" };
    }
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON" };
  }
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    return { ok: false, status: 413, error: "Request body too large" };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON" };
  }
}
