import { env } from "./env";
import { runtimeConfig } from "./config";

/**
 * Returns the canonical base URL for the application, accounting for proxies
 * and the NEXTAUTH_URL override. Pass `request` (or `null`) from the route handler.
 */
export function getBaseUrl(request: Request | null): string {
  if (env.NEXTAUTH_URL && !env.NEXTAUTH_URL.includes(runtimeConfig.auth.localhostBaseUrl)) {
    return env.NEXTAUTH_URL;
  }
  if (request) {
    const host = request.headers.get("host") ?? "localhost:3002";
    const proto = request.headers.get("x-forwarded-proto") ?? "http";
    return `${proto}://${host}`;
  }
  return `http://${runtimeConfig.auth.localhostBaseUrl}`;
}
