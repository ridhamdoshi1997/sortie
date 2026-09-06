import { NextRequest, NextResponse } from "next/server";
import { createInsforgeServer } from "@/lib/insforge-server";
import { createAdminDbClient } from "@/lib/admin/client";
import { getPostLoginRedirectPath } from "@/lib/auth";
import { toUserMessage } from "@/lib/errors";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { email, password, name } = (await request.json()) as {
      email?: string;
      password?: string;
      name?: string;
    };

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required." },
        { status: 400 },
      );
    }

    // Cookie writes (when a session comes back immediately) happen
    // automatically via this client's adapter — no manual setAuthCookies.
    const insforge = await createInsforgeServer();

    // LOCAL DEVELOPMENT ONLY: create the user already confirmed, skipping the
    // confirmation email entirely.
    //
    // Signup on localhost fails outright, and the cause is email, not code.
    // Supabase runs with mailer_autoconfirm=false (verified live via
    // /auth/v1/settings), so it must send a confirmation mail — and when that
    // send fails it fails the whole signup and does NOT create the user, which
    // is why auth.users holds no unconfirmed rows despite real attempts. The
    // send fails because Supabase's SMTP is Resend's sandbox sender
    // (onboarding@resend.dev, no verified domain), which only delivers to the
    // Resend account owner's own exact address — a gap RESUME.md has recorded
    // since Phase 41, not something introduced here.
    //
    // The real fix is a verified sending domain in Resend, which is an
    // external account action. This unblocks local development in the
    // meantime, and is deliberately narrow:
    //   * NODE_ENV must not be production, so a real deployment can never take
    //     this path even if the flag below were set by accident;
    //   * ALLOW_DEV_AUTOCONFIRM_SIGNUP must be explicitly set, so it is opt-in
    //     rather than something that silently changes behaviour for anyone who
    //     runs the app locally.
    // Both conditions are required. Without them nothing changes.
    const devAutoConfirm =
        process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_AUTOCONFIRM_SIGNUP === "1";

    if (devAutoConfirm) {
        const admin = createAdminDbClient() as unknown as {
            auth: { admin: { createUser: (params: Record<string, unknown>) => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }> } };
        };
        const { error: createError } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { name },
        });
        if (createError) {
            return NextResponse.json(
                { success: false, error: toUserMessage(createError.message, "Sign up failed.") },
                { status: 400 },
            );
        }
        // Sign in immediately so the session cookies are written by the same
        // adapter every other auth path uses, rather than hand-rolling them.
        const { data: signIn, error: signInError } = await insforge.auth.signInWithPassword({ email, password });
        if (signInError || !signIn?.user) {
            return NextResponse.json(
                { success: false, error: toUserMessage(signInError?.message, "Sign up succeeded but sign-in failed.") },
                { status: 500 },
            );
        }
        console.log(`[auth/signup] dev auto-confirm used for ${email} — no confirmation email sent`);
        const redirectPath = await getPostLoginRedirectPath(signIn.user.id);
        return NextResponse.json({ success: true, requireVerification: false, redirectPath });
    }
    const { data, error } = await insforge.auth.signUp({
      email,
      password,
      name,
      redirectTo: new URL("/login", request.url).toString(),
    });

    if (error) {
      return NextResponse.json(
        { success: false, error: toUserMessage(error.message, "Sign up failed.") },
        { status: error.statusCode ?? 400 },
      );
    }

    if (data?.requireEmailVerification) {
      return NextResponse.json({ success: true, requireVerification: true });
    }

    if (data && "accessToken" in data && data.accessToken && data.user) {
      const redirectPath = await getPostLoginRedirectPath(data.user.id);
      return NextResponse.json({ success: true, requireVerification: false, redirectPath });
    }

    return NextResponse.json(
      { success: false, error: "Sign up did not return a session or verification step." },
      { status: 500 },
    );
  } catch (error) {
    console.error("[auth/signup]", error);
    return NextResponse.json(
      { success: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
