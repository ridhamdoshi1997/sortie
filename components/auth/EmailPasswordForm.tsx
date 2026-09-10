"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type Mode = "signin" | "signup" | "verify" | "forgot" | "reset" | "reset-done";

const inputClass =
  "h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent";

const primaryButtonClass =
  "btn-signal inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-medium text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60";

const linkButtonClass = "text-xs font-medium text-accent hover:underline";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export function EmailPasswordForm({ initialMode = "signin" }: { initialMode?: "signin" | "signup" }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function resetTransientState() {
    setError(null);
    setNotice(null);
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    resetTransientState();
    setIsPending(true);
    const result = await postJson<{
      success: boolean;
      error?: string;
      requireVerification?: boolean;
      redirectPath?: string;
    }>("/api/auth/signin", { email, password });
    setIsPending(false);

    if (!result.success) {
      if (result.requireVerification) {
        setMode("verify");
        setError(null);
        setNotice("Please verify your email first — enter the code we sent you.");
        return;
      }
      setError(result.error ?? "Sign in failed.");
      return;
    }

    router.push(result.redirectPath ?? "/dashboard");
    router.refresh();
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    resetTransientState();
    setIsPending(true);
    const result = await postJson<{
      success: boolean;
      error?: string;
      requireVerification?: boolean;
      redirectPath?: string;
    }>("/api/auth/signup", { email, password, name });
    setIsPending(false);

    if (!result.success) {
      setError(result.error ?? "Sign up failed.");
      return;
    }

    if (result.requireVerification) {
      setMode("verify");
      return;
    }

    router.push(result.redirectPath ?? "/onboarding");
    router.refresh();
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    resetTransientState();
    setIsPending(true);
    const result = await postJson<{ success: boolean; error?: string; redirectPath?: string }>(
      "/api/auth/verify-email",
      { email, otp: code },
    );
    setIsPending(false);

    if (!result.success) {
      setError(result.error ?? "Invalid or expired code.");
      return;
    }

    router.push(result.redirectPath ?? "/dashboard");
    router.refresh();
  }

  async function handleResendCode() {
    resetTransientState();
    setIsPending(true);
    const result = await postJson<{ success: boolean; error?: string }>(
      "/api/auth/resend-verification",
      { email },
    );
    setIsPending(false);
    setNotice(result.success ? "A new code is on its way." : (result.error ?? "Could not resend the code."));
  }

  async function handleRequestReset(e: React.FormEvent) {
    e.preventDefault();
    resetTransientState();
    setIsPending(true);
    await postJson<{ success: boolean; error?: string }>("/api/auth/request-reset", { email });
    setIsPending(false);
    // Always show the same neutral message regardless of whether the email
    // is registered — matches the API route's deliberate non-enumeration.
    setMode("reset");
    setNotice("If that email has an account, a reset code is on its way.");
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    resetTransientState();
    setIsPending(true);
    const result = await postJson<{ success: boolean; error?: string }>(
      "/api/auth/reset-password",
      { email, code, newPassword },
    );
    setIsPending(false);

    if (!result.success) {
      setError(result.error ?? "Could not reset your password.");
      return;
    }

    setMode("reset-done");
  }

  if (mode === "verify") {
    return (
      <form onSubmit={handleVerify} className="mt-6 flex flex-col gap-3">
        <p className="text-sm text-text-secondary">
          Enter the code we sent to <span className="font-medium text-text-primary">{email}</span>.
        </p>
        {notice && <p className="text-xs text-text-secondary">{notice}</p>}
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="8-digit code"
          inputMode="numeric"
          className={inputClass}
          required
        />
        {error && <p className="text-xs text-error">{error}</p>}
        <button type="submit" disabled={isPending} className={primaryButtonClass}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
        </button>
        <button type="button" onClick={handleResendCode} disabled={isPending} className={linkButtonClass}>
          Resend code
        </button>
      </form>
    );
  }

  if (mode === "forgot") {
    return (
      <form onSubmit={handleRequestReset} className="mt-6 flex flex-col gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={inputClass}
          required
        />
        {error && <p className="text-xs text-error">{error}</p>}
        <button type="submit" disabled={isPending} className={primaryButtonClass}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reset code"}
        </button>
        <button type="button" onClick={() => setMode("signin")} className={linkButtonClass}>
          Back to sign in
        </button>
      </form>
    );
  }

  if (mode === "reset") {
    return (
      <form onSubmit={handleResetPassword} className="mt-6 flex flex-col gap-3">
        {notice && <p className="text-xs text-text-secondary">{notice}</p>}
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Reset code"
          inputMode="numeric"
          className={inputClass}
          required
        />
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password"
          className={inputClass}
          required
          minLength={6}
        />
        {error && <p className="text-xs text-error">{error}</p>}
        <button type="submit" disabled={isPending} className={primaryButtonClass}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reset password"}
        </button>
      </form>
    );
  }

  if (mode === "reset-done") {
    return (
      <div className="mt-6 flex flex-col gap-3">
        <p className="text-sm text-text-secondary">
          Your password has been reset. Sign in with your new password.
        </p>
        <button type="button" onClick={() => setMode("signin")} className={primaryButtonClass}>
          Back to sign in
        </button>
      </div>
    );
  }

  const isSignUp = mode === "signup";

  return (
    <form onSubmit={isSignUp ? handleSignUp : handleSignIn} className="mt-6 flex flex-col gap-3">
      {isSignUp && (
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          className={inputClass}
          autoComplete="name"
          required
        />
      )}
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className={inputClass}
        autoComplete="email"
        required
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className={inputClass}
        autoComplete={isSignUp ? "new-password" : "current-password"}
        required
        minLength={6}
      />
      {!isSignUp && (
        <button type="button" onClick={() => setMode("forgot")} className={`self-end ${linkButtonClass}`}>
          Forgot password?
        </button>
      )}
      {notice && <p className="text-xs text-text-secondary">{notice}</p>}
      {error && <p className="text-xs text-error">{error}</p>}
      <button type="submit" disabled={isPending} className={primaryButtonClass}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : isSignUp ? "Create account" : "Sign in"}
      </button>
      <button
        type="button"
        onClick={() => {
          resetTransientState();
          setMode(isSignUp ? "signin" : "signup");
        }}
        className={linkButtonClass}
      >
        {isSignUp ? "Already have an account? Sign in" : "New here? Create an account"}
      </button>
    </form>
  );
}
