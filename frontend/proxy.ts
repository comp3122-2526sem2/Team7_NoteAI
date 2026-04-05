import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PATHS = ["/login", "/register"];

// Encoded once at module load — must match JWT_SECRET in the backend .env
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "change_me_in_production"
);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get("token")?.value;
  if (!token) {
    return redirectToLogin(request, pathname);
  }

  try {
    await jwtVerify(token, JWT_SECRET, { algorithms: ["HS256"] });
    return NextResponse.next();
  } catch {
    // Token is expired, tampered, or signed with a different secret
    return redirectToLogin(request, pathname);
  }
}

function redirectToLogin(request: NextRequest, from: string) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", from);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
