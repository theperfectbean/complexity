import { createHash, randomBytes } from "node:crypto";

const TOKEN_PREFIX = "ctok_";

export function generateApiToken() {
  const raw = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return {
    raw,
    tokenHash: hashApiToken(raw),
  };
}

export function hashApiToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
