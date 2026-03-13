import { auth } from "@/auth";
import { NextResponse, type NextRequest } from "next/server";

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-XSS-Protection": "1; mode=block",
};

function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

const authMiddleware = auth((req) => {
  const { nextUrl, auth: session } = req;
  
  const isApiAuth = nextUrl.pathname.startsWith("/api/auth");
  const isApiHealth = nextUrl.pathname === "/api/health";
  const isPublicAsset = nextUrl.pathname.startsWith("/_next") || nextUrl.pathname.startsWith("/favicon");
  
  const isAuthPage = 
    nextUrl.pathname === "/login" || 
    nextUrl.pathname === "/register" ||
    nextUrl.pathname === "/forgot-password" ||
    nextUrl.pathname === "/reset-password";

  const isPublic = isApiAuth || isApiHealth || isPublicAsset || isAuthPage || nextUrl.pathname === "/";

  if (isPublic) {
    if (session && (nextUrl.pathname === "/login" || nextUrl.pathname === "/register")) {
      return applySecurityHeaders(NextResponse.redirect(new URL("/", nextUrl)));
    }
    return applySecurityHeaders(NextResponse.next());
  }

  if (!session) {
    return applySecurityHeaders(NextResponse.redirect(new URL("/login", nextUrl)));
  }

  return applySecurityHeaders(NextResponse.next());
});

export default function middleware(request: NextRequest) {
  return (authMiddleware as (req: NextRequest) => Promise<NextResponse>)(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
