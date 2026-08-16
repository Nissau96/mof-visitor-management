import assert from "node:assert/strict";
import {
  HttpError,
  readJsonBody,
} from "../api/_lib/http.js";

const testUrl = "http://localhost/api/test";

function createJsonRequest(
  body,
  contentType = "application/json",
  additionalHeaders = {},
) {
  return new Request(testUrl, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      ...additionalHeaders,
    },
    body,
  });
}

async function assertHttpError(
  request,
  expectedStatus,
  expectedMessage,
) {
  await assert.rejects(
    () => readJsonBody(request),
    (error) => {
      assert.equal(error instanceof HttpError, true);
      assert.equal(error.status, expectedStatus);
      assert.equal(error.message, expectedMessage);

      return true;
    },
  );
}

const validPayload = {
  fullName: "Test Visitor",
  purpose: "Meeting",
};

const validResult = await readJsonBody(
  createJsonRequest(JSON.stringify(validPayload)),
);

assert.deepEqual(validResult, validPayload);

const parameterizedContentTypeResult =
  await readJsonBody(
    createJsonRequest(
      JSON.stringify(validPayload),
      "Application/JSON; Charset=UTF-8",
    ),
  );

assert.deepEqual(
  parameterizedContentTypeResult,
  validPayload,
);

await assertHttpError(
  new Request(testUrl, {
    method: "POST",
  }),
  415,
  "Content-Type must be application/json.",
);

await assertHttpError(
  new Request(testUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
    },
    body: JSON.stringify(validPayload),
  }),
  415,
  "Content-Type must be application/json.",
);

await assertHttpError(
  createJsonRequest("{"),
  400,
  "Request body must contain valid JSON.",
);

await assertHttpError(
  createJsonRequest(
    "{}",
    "application/json",
    {
      "Content-Length": "20001",
    },
  ),
  413,
  "Request body is too large.",
);

await assertHttpError(
  createJsonRequest(
    "{}",
    "application/json",
    {
      "Content-Length": "invalid",
    },
  ),
  400,
  "Content-Length header is invalid.",
);

const boundaryJson =
  JSON.stringify("a".repeat(19_998));

assert.equal(
  new TextEncoder().encode(boundaryJson).byteLength,
  20_000,
);

const boundaryResult = await readJsonBody(
  createJsonRequest(boundaryJson),
);

assert.equal(boundaryResult.length, 19_998);

const oversizedJson =
  JSON.stringify("a".repeat(19_999));

assert.equal(
  new TextEncoder().encode(oversizedJson).byteLength,
  20_001,
);

await assertHttpError(
  createJsonRequest(oversizedJson),
  413,
  "Request body is too large.",
);

const multibyteBoundaryJson =
  JSON.stringify("é".repeat(9_999));

assert.equal(
  new TextEncoder()
    .encode(multibyteBoundaryJson)
    .byteLength,
  20_000,
);

const multibyteBoundaryResult =
  await readJsonBody(
    createJsonRequest(multibyteBoundaryJson),
  );

assert.equal(
  multibyteBoundaryResult.length,
  9_999,
);

console.log(
  "HTTP request-boundary validation checks passed.",
);