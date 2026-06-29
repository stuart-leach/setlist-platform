import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  let payload: {
    sub: string;
    email: string;
    name?: string;
    avatar_url?: string;
  };

  try {
    const secret = new TextEncoder().encode(process.env.SSO_JWT_SECRET!);
    const { payload: verified } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
    payload = verified as typeof payload;
  } catch {
    return NextResponse.redirect(new URL("/auth/login?error=invalid_token", request.url));
  }

  const supabase = await createServiceClient();

  // Generate a magic-link OTP that we immediately exchange for a session.
  // Using admin generateLink so we can do this server-side without user interaction.
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: payload.email,
    options: {
      data: {
        full_name: payload.name ?? "",
        avatar_url: payload.avatar_url ?? "",
      },
    },
  });

  if (error || !data.properties?.hashed_token) {
    console.error("SSO generateLink error:", error);
    return NextResponse.redirect(new URL("/auth/login?error=sso_failed", request.url));
  }

  // Exchange the hashed token for a session (verifyOtp with type=magiclink)
  const { data: sessionData, error: sessionError } =
    await supabase.auth.verifyOtp({
      token_hash: data.properties.hashed_token,
      type: "magiclink",
    });

  if (sessionError || !sessionData.session) {
    console.error("SSO verifyOtp error:", sessionError);
    return NextResponse.redirect(new URL("/auth/login?error=sso_failed", request.url));
  }

  const response = NextResponse.redirect(new URL("/", request.url));

  // Set the Supabase auth cookies on the response
  response.cookies.set("sb-access-token", sessionData.session.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: sessionData.session.expires_in,
    path: "/",
  });
  response.cookies.set("sb-refresh-token", sessionData.session.refresh_token!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  return response;
}
