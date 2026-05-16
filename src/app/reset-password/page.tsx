"use client";

import { Suspense, useCallback, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { authApi, isApiError } from "@/lib/api";
import {
  ArrowRight,
  CheckCircle,
  ChevronLeft,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
} from "lucide-react";

function PASSWORD_OK(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(pw)) return "Password must include an uppercase letter.";
  if (!/\d/.test(pw)) return "Password must include a digit.";
  return null;
}

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!token) {
      setError("This reset link is invalid or missing its token.");
      return;
    }
    const pwErr = PASSWORD_OK(newPassword);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const resp = await authApi.passwordReset({ token, newPassword });
      setSuccess(resp.message);
    } catch (err) {
      setError(
        isApiError(err)
          ? err.displayMessage
          : "Could not reset password. The link may have expired.",
      );
    } finally {
      setBusy(false);
    }
  }, [token, newPassword, confirm]);

  if (!token) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <h1 className="text-xl font-bold text-gray-900 mb-1">
          Reset link invalid
        </h1>
        <p className="text-sm text-gray-500 mb-5">
          This link is missing its token. Request a new password reset email.
        </p>
        <Link
          href="/forgot-password"
          className="inline-flex items-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
        >
          Get a new link
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mb-4">
          <CheckCircle size={22} className="text-green-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">
          Password updated
        </h1>
        <p className="text-sm text-gray-500 mb-5">{success}</p>
        <button
          onClick={() => router.replace("/login")}
          className="inline-flex items-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
        >
          Sign In <ArrowRight size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      <div className="w-12 h-12 bg-[#e8f7fc] rounded-full flex items-center justify-center mb-4">
        <KeyRound size={22} className="text-[#129cd3]" />
      </div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">Choose a new password</h1>
      <p className="text-sm text-gray-500 mb-6">
        Must be at least 8 characters with an uppercase letter and a digit.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            New password
          </label>
          <div className="flex items-center border-2 border-gray-200 focus-within:border-[#129cd3] rounded-xl overflow-hidden transition-colors">
            <input
              type={showPw ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              className="flex-1 px-4 py-3 text-sm outline-none text-gray-800"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="px-3 text-gray-400 hover:text-gray-600 flex-shrink-0"
            >
              {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Confirm new password
          </label>
          <input
            type={showPw ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter new password"
            className="w-full border-2 border-gray-200 focus:border-[#129cd3] rounded-xl px-4 py-3 text-sm outline-none text-gray-800 transition-colors"
            autoComplete="new-password"
          />
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={busy || !newPassword || !confirm}
          className="w-full bg-[#129cd3] hover:bg-[#0e87b5] disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold py-3.5 rounded-xl transition-colors shadow-md shadow-[#129cd3]/30 flex items-center justify-center gap-2"
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <>
              Update password <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>

      <p className="text-center text-xs text-gray-400 mt-6">
        Need a fresh link?{" "}
        <Link
          href="/forgot-password"
          className="text-[#129cd3] hover:underline font-medium"
        >
          Request again
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <>
      <Header />
      <main className="bg-gray-50 min-h-screen flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-md">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-[#129cd3] transition-colors mb-5"
          >
            <ChevronLeft size={13} /> Back to sign in
          </Link>
          <Suspense
            fallback={
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center text-sm text-gray-500">
                Loading…
              </div>
            }
          >
            <ResetPasswordInner />
          </Suspense>
        </div>
      </main>
      <Footer />
    </>
  );
}
