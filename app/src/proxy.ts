import { auth } from "@/auth";
import { NextResponse, type NextRequest } from "next/server";

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

/**
 * Combined Security and Authentication Middleware (Proxy)
 * For Next.js 16+, middleware is renamed to proxy.ts and the export to proxy.
 */
export const proxy = auth(async (req) => {
  const { nextUrl, auth: session, method, headers } = req;
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const hasApiToken =
    headers.get("x-api-key")?.trim() ||
    headers.get("authorization")?.toLowerCase().startsWith("bearer ");

  // 1. CSRF Protection: Verify Origin/Referer for state-mutating methods
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const origin = headers.get("origin");
    const referer = headers.get("referer");
    const host = headers.get("host");
    const hasSession = !!session;
    
    let isValid = true;
    
    // If it's a session-based request (browser-like), strictly enforce CSRF
    if (hasSession) {
      isValid = false;
      if (origin) {
        try {
          const originUrl = new URL(origin);
          if (originUrl.host === host) isValid = true;
        } catch {
          isValid = false;
        }
      } else if (referer) {
        try {
          const refererUrl = new URL(referer);
          if (refererUrl.host === host) isValid = true;
        } catch {
          isValid = false;
        }
      }
    }

    if (!isValid) {
      return new NextResponse("Forbidden: CSRF Validation Failed", { status: 403 });
    }
  }

  // 2. Authentication and Authorization Logic
  const isApiAuth = nextUrl.pathname.startsWith("/api/auth");
  const isApiHealth = nextUrl.pathname === "/api/health";
  const isApiWebhook = nextUrl.pathname.startsWith("/api/webhooks");
  const isApiChat = nextUrl.pathname === "/api/chat";
  const isPublicAsset = nextUrl.pathname.startsWith("/_next") || nextUrl.pathname.startsWith("/favicon");
  const isAdminPage = nextUrl.pathname.startsWith("/settings/admin");
  
  const isAuthPage = 
    nextUrl.pathname === "/login" || 
    nextUrl.pathname === "/register" ||
    nextUrl.pathname === "/forgot-password" ||
    nextUrl.pathname === "/reset-password";

  const isApiTools = nextUrl.pathname.startsWith("/api/tools");
  const isApiSearch = nextUrl.pathname.startsWith("/api/search");

  const isPublic =
    isApiAuth ||
    isApiHealth ||
    isApiWebhook ||
    isApiChat ||
    isApiTools ||
    isApiSearch ||
    isPublicAsset ||
    isAuthPage ||
    nextUrl.pathname === "/" ||
    Boolean(hasApiToken);

  let response: NextResponse;

  if (isAdminPage && (!session || !session.user?.isAdmin)) {
    response = NextResponse.redirect(new URL("/", nextUrl));
  } else if (isPublic) {
    if (session && (nextUrl.pathname === "/login" || nextUrl.pathname === "/register")) {
      response = NextResponse.redirect(new URL("/", nextUrl));
    } else {
      response = NextResponse.next();
    }
  } else if (!session) {
    response = NextResponse.redirect(new URL("/login", nextUrl));
  } else {
    response = NextResponse.next();
  }

  // 3. CSP and Security Headers
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic';
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data:;
    font-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    
  `.replace(/\s{2,}/g, " ").trim();

  // Set security headers on the response
  response.headers.set("x-nonce", nonce);
  response.headers.set("Content-Security-Policy", cspHeader);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("X-XSS-Protection", "1; mode=block");

  return response;
}) as unknown as (request: NextRequest) => Promise<NextResponse>;
