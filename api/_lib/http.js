export class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export function json(data, status = 200, additionalHeaders = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...additionalHeaders,
    },
  });
}

export function methodNotAllowed(allowedMethods = []) {
  return json(
    {
      error: "Method not allowed.",
    },
    405,
    allowedMethods.length
      ? {
          Allow: allowedMethods.join(", "),
        }
      : {},
  );
}

export async function readJsonBody(
  request,
  maximumBytes = 20_000,
) {
  const declaredLength = Number(
    request.headers.get("content-length") || 0,
  );

  if (declaredLength > maximumBytes) {
    throw new HttpError("Request body is too large.", 413);
  }

  const text = await request.text();
  const actualLength = new TextEncoder().encode(text).byteLength;

  if (actualLength > maximumBytes) {
    throw new HttpError("Request body is too large.", 413);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(
      "Request body must contain valid JSON.",
      400,
    );
  }
}