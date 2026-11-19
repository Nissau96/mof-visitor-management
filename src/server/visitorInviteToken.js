import { createHash, randomBytes } from "node:crypto";

// A visitor booking link carries 32 random bytes (43 base64url
// characters). Only the SHA-256 hash is stored, so a database read
// cannot rebuild a working link.

export function hashInviteToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

export function createInviteToken() {
  const token = randomBytes(32).toString("base64url");

  return { hash: hashInviteToken(token), token };
}
