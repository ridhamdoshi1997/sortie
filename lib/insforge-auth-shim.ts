import type { SupabaseClient, User } from "@supabase/supabase-js";

// Extracted from lib/insforge-server.ts (Phase 41+) — deliberately has NO
// dependency on "next/headers" or any other server-only API. Both
// lib/insforge-server.ts (cookies()-bound) and lib/admin/client.ts
// (service-role) need this exact same auth-shaping logic, and importing it
// from lib/insforge-server.ts directly would drag "next/headers" into
// lib/admin/client.ts's dependency graph — which gets bundled into CLIENT
// code via lib/models.ts → components/shared/SiteModelSelector.tsx →
// Navbar.tsx, breaking the whole app with a real, confirmed-live "You're
// importing a module that depends on next/headers" error. Keep this file
// free of next/headers and any other server-only import, permanently.
//
// Reshapes Supabase's real auth responses (data.session.access_token/
// refresh_token/data.user, error.status) to match what ~100+ existing call
// sites destructure (data.accessToken/refreshToken/user/
// requireEmailVerification, error.statusCode) — the one place this
// translation lives.
function shapeAuthError(error: { message: string; status?: number } | null) {
  if (!error) return null;
  return { message: error.message, statusCode: error.status };
}

function shapeSession(session: { access_token: string; refresh_token: string } | null, user: User | null) {
  return {
    accessToken: session?.access_token,
    refreshToken: session?.refresh_token,
    user,
  };
}

export function wrapAuth(client: SupabaseClient) {
  return {
    ...client.auth,
    async getCurrentUser() {
      const { data, error } = await client.auth.getUser();
      return { data: { user: data.user }, error: shapeAuthError(error) };
    },
    async signInWithPassword(params: { email: string; password: string }) {
      const { data, error } = await client.auth.signInWithPassword(params);
      return { data: shapeSession(data.session, data.user), error: shapeAuthError(error) };
    },
    async signUp(params: { email: string; password: string; name?: string; redirectTo?: string }) {
      const { data, error } = await client.auth.signUp({
        email: params.email,
        password: params.password,
        options: { data: { name: params.name }, emailRedirectTo: params.redirectTo },
      });
      if (error) return { data: null, error: shapeAuthError(error) };
      if (data.user && !data.session) {
        return { data: { requireEmailVerification: true }, error: null };
      }
      return { data: { ...shapeSession(data.session, data.user), requireEmailVerification: false }, error: null };
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      return { error: shapeAuthError(error) };
    },
    async signInWithIdToken(params: { provider: "google"; token: string }) {
      const { data, error } = await client.auth.signInWithIdToken(params);
      return { data: shapeSession(data.session, data.user), error: shapeAuthError(error) };
    },
    async signInWithOAuth(provider: string, options: { redirectTo: string; skipBrowserRedirect?: boolean }) {
      const { data, error } = await client.auth.signInWithOAuth({
        provider: provider as "google" | "github" | "linkedin_oidc" | "apple" | "azure",
        options: { redirectTo: options.redirectTo, skipBrowserRedirect: options.skipBrowserRedirect },
      });
      return { data, error: shapeAuthError(error) };
    },
    async exchangeOAuthCode(code: string) {
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      return { data: shapeSession(data.session, data.user), error: shapeAuthError(error) };
    },
    async verifyEmail(params: { email: string; otp: string }) {
      const { data, error } = await client.auth.verifyOtp({ email: params.email, token: params.otp, type: "signup" });
      return { data: shapeSession(data.session, data.user), error: shapeAuthError(error) };
    },
    async resendVerificationEmail(params: { email: string; redirectTo?: string }) {
      const { error } = await client.auth.resend({
        type: "signup",
        email: params.email,
        options: { emailRedirectTo: params.redirectTo },
      });
      return { error: shapeAuthError(error) };
    },
    async sendResetPasswordEmail(params: { email: string; redirectTo?: string }) {
      const { error } = await client.auth.resetPasswordForEmail(params.email, { redirectTo: params.redirectTo });
      return { error: shapeAuthError(error) };
    },
    // InsForge's 2-step reset shape (exchange a code for a token, then reset
    // with that token) doesn't map to a literal Supabase equivalent —
    // Supabase's real recovery flow is verifyOtp(type: "recovery") followed
    // by updateUser({password}) using the SAME client instance, since
    // verifyOtp establishes an in-memory session on `client` that
    // updateUser then relies on (not a token passed explicitly). Both
    // call sites (app/api/auth/reset-password/route.ts) already call these
    // on the same `insforge` object within one request, so the session
    // persists correctly across the two calls despite this route using the
    // no-cookie-persistence anon client.
    async exchangeResetPasswordToken(params: { email: string; code: string }) {
      const { data, error } = await client.auth.verifyOtp({ email: params.email, token: params.code, type: "recovery" });
      return { data: data.session ? { token: data.session.access_token } : null, error: shapeAuthError(error) };
    },
    async resetPassword(params: { newPassword: string; otp?: string }) {
      const { error } = await client.auth.updateUser({ password: params.newPassword });
      return { error: shapeAuthError(error) };
    },
  };
}
