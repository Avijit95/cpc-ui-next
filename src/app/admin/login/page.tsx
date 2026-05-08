"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Shield,
} from "lucide-react";
import { authApi, isApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthProvider";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0f172a]" />}>
      <AdminLoginInner />
    </Suspense>
  );
}

function AdminLoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/admin";
  const { setSession, status, user, logout } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // If we're already an authenticated admin, jump straight to the dashboard.
  useEffect(() => {
    if (status === "authenticated" && user?.role === "ADMIN") {
      router.replace(next.startsWith("/admin") ? next : "/admin");
    }
  }, [status, user, router, next]);

  const handleApiError = (err: unknown) => {
    if (isApiError(err)) {
      // /auth/login/email returns generic "Invalid credentials" on 401, plus
      // 429 throttle / lockout messages. Surface whatever the server sent.
      setErrorMsg(err.displayMessage || "Sign-in failed.");
    } else {
      setErrorMsg("Sign-in failed. Please try again.");
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email || !password) {
      setErrorMsg("Enter your email and password.");
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      const resp = await authApi.loginEmail({ email, password });
      if (resp.user.role !== "ADMIN") {
        // Not an admin — drop the freshly-issued session and tell the user.
        await logout();
        setErrorMsg("This account doesn't have admin access.");
        return;
      }
      setSession(resp);
      router.replace(next.startsWith("/admin") ? next : "/admin");
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(false);
    }
  };

  // While we're bootstrapping (looking up an existing session), hold the form
  // so the user doesn't briefly see the login UI before being redirected.
  const bootstrapping = status === "loading";

  return (
    <div className="min-h-screen w-full bg-[#0f172a] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-[#129cd3]/20 rounded-full blur-3xl" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-[#129cd3]/10 rounded-full blur-3xl" />
      <div className="absolute top-1/2 left-1/2 w-[36rem] h-[36rem] bg-[#129cd3]/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#129cd3] shadow-lg shadow-[#129cd3]/30 mb-4">
            <Shield className="text-white" size={26} />
          </div>
          <h1 className="text-2xl font-bold text-white">CPC Admin</h1>
          <p className="text-gray-400 text-sm mt-1">
            Sign in to manage the storefront
          </p>
        </div>

        {bootstrapping ? (
          <div className="bg-white rounded-2xl shadow-2xl p-12 flex items-center justify-center">
            <Loader2 className="animate-spin text-[#129cd3]" size={24} />
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl shadow-2xl p-8 space-y-5"
          >
            {errorMsg && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-line">
                {errorMsg}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Email Address
              </label>
              <div className="flex items-center border-2 border-gray-200 focus-within:border-[#129cd3] rounded-xl overflow-hidden transition-colors">
                <span className="px-3 py-3 text-gray-400 flex-shrink-0">
                  <Mail size={17} />
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  autoComplete="username"
                  className="flex-1 px-2 py-3 text-sm outline-none text-gray-800"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Password
              </label>
              <div className="flex items-center border-2 border-gray-200 focus-within:border-[#129cd3] rounded-xl overflow-hidden transition-colors">
                <span className="px-3 py-3 text-gray-400 flex-shrink-0">
                  <Lock size={17} />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="flex-1 px-2 py-3 text-sm outline-none text-gray-800"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="px-3 text-gray-400 hover:text-gray-600 flex-shrink-0"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 text-gray-600 cursor-pointer select-none">
                <input type="checkbox" className="accent-[#129cd3]" /> Remember me
              </label>
              <a href="#" className="text-[#129cd3] hover:underline font-semibold">
                Forgot password?
              </a>
            </div>

            <button
              type="submit"
              disabled={busy || !email || !password}
              className="w-full bg-[#129cd3] hover:bg-[#0e87b5] disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold py-3.5 rounded-xl transition-colors shadow-md shadow-[#129cd3]/30 flex items-center justify-center gap-2"
            >
              {busy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  Sign in to dashboard <ArrowRight size={16} />
                </>
              )}
            </button>

            <p className="text-center text-xs text-gray-400">
              Not an admin?{" "}
              <Link
                href="/login"
                className="text-[#129cd3] hover:underline font-medium"
              >
                Use the customer login
              </Link>
            </p>
          </form>
        )}

        <p className="text-center text-[11px] text-gray-500 mt-6">
          © {new Date().getFullYear()} CellPhone Crowd · Admin Console
        </p>
      </div>
    </div>
  );
}
