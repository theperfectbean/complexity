export function createId() {
  return crypto.randomUUID().replace(/-/g, "");
}
