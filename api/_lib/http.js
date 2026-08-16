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

function readMediaType(request) {
  const contentType =
    request.headers.get("content-type") || "";

  return contentType
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
}

export async function readJsonBody(
  request,
  maximumBytes = 20_000,
) {
  const declaredLengthHeader =
    request.headers.get("content-length");

  if (declaredLengthHeader !== null) {
    if (!/^\d+$/.test(declaredLengthHeader)) {
      throw new HttpError(
        "Content-Length header is invalid.",
        400,
      );
    }

    const declaredLength = Number(declaredLengthHeader);

    if (!Number.isSafeInteger(declaredLength)) {
      throw new HttpError(
        "Content-Length header is invalid.",
        400,
      );
    }

    if (declaredLength > maximumBytes) {
      throw new HttpError(
        "Request body is too large.",
        413,
      );
    }
  }

  if (readMediaType(request) !== "application/json") {
    throw new HttpError(
      "Content-Type must be application/json.",
      415,
    );
  }

  const text = await request.text();
  const actualLength =
    new TextEncoder().encode(text).byteLength;

  if (actualLength > maximumBytes) {
    throw new HttpError(
      "Request body is too large.",
      413,
    );
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