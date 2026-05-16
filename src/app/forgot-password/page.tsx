"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { authApi, isApiError } from "@/lib/api";
import {
  ArrowRight,
  CheckCircle,
  ChevronLeft,
  Loader2,
  Mail,
} from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const resp = await authApi.passwordForgot({ email: email.trim() });
      setMessage(resp.message);
    } catch (err) {
      setError(
        isApiError(err)
          ? err.displayMessage
          : "Could not send reset link. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }, [email]);

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

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="w-12 h-12 bg-[#e8f7fc] rounded-full flex items-center justify-center mb-4">
              <Mail size={22} className="text-[#129cd3]" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-1">
              Forgot your password?
            </h1>
            <p className="text-sm text-gray-500 mb-6">
              Enter the email tied to your account and we&apos;ll send you a link to
              reset your password.
            </p>

            {message ? (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-4 text-sm text-green-800 flex items-start gap-3">
                <CheckCircle
                  size={18}
                  className="text-green-600 mt-0.5 flex-shrink-0"
                />
                <div>
                  <p className="font-semibold mb-1">Check your inbox</p>
                  <p className="text-xs">{message}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full border-2 border-gray-200 focus:border-[#129cd3] rounded-xl px-4 py-3 text-sm outline-none text-gray-800 transition-colors"
                    autoComplete="email"
                  />
                </div>
                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}
                <button
                  onClick={handleSubmit}
                  disabled={busy || !email.trim()}
                  className="w-full bg-[#129cd3] hover:bg-[#0e87b5] disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold py-3.5 rounded-xl transition-colors shadow-md shadow-[#129cd3]/30 flex items-center justify-center gap-2"
                >
                  {busy ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      Send reset link <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            )}

            <p className="text-center text-xs text-gray-400 mt-6">
              Remembered your password?{" "}
              <Link
                href="/login"
                className="text-[#129cd3] hover:underline font-medium"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
