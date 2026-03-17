import crypto from "crypto";
import { env } from "./env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const PREFIX = "v1:";

export function encrypt(text: string): string {
  const key = env.ENCRYPTION_KEY;
  if (!key) {
    if (env.NODE_ENV === "production") {
      throw new Error("ENCRYPTION_KEY is required in production");
    }
    return text;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(key), iv);
  
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return (
    PREFIX +
    Buffer.concat([iv, tag, encrypted]).toString("base64")
  );
}

export function decrypt(encryptedText: string): string {
  if (!isEncrypted(encryptedText)) {
    return encryptedText;
  }

  const key = env.ENCRYPTION_KEY;
  if (!key) {
    if (env.NODE_ENV === "production") {
      throw new Error("ENCRYPTION_KEY is required in production to decrypt data");
    }
    return encryptedText;
  }

  try {
    const data = Buffer.from(encryptedText.slice(PREFIX.length), "base64");
    
    const iv = data.subarray(0, IV_LENGTH);
    const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key), iv);
    decipher.setAuthTag(tag);

    return decipher.update(encrypted) + decipher.final("utf8");
  } catch (error) {
    console.error("[Encryption] Decryption failed:", error);
    return encryptedText;
  }
}

export function isEncrypted(text: string): boolean {
  return text.startsWith(PREFIX);
}
