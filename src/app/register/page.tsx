"use client";

import { Suspense, useEffect, useState } from "react";
import {
  Mail, Lock, Phone, User, Eye, EyeOff, ArrowRight, ArrowLeft, Loader2,
  ShoppingBag, Shield, Zap, Headphones,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authApi, isApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthProvider";

type Tab = "google" | "phone" | "email";
type Phase = "auth" | "otp";
// Which credential the account will be created from once the OTP is verified.
type AuthPath = "phone" | "email" | "google";

const benefits = [
  { icon: ShoppingBag, text: "Access exclusive deals & offers" },
  { icon: Zap, text: "One-click checkout & Buy Now" },
  { icon: Shield, text: "Secure payments & easy returns" },
  { icon: Headphones, text: "Priority 24/7 customer support" },
];

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

type GoogleCredentialResponse = { credential: string };

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (resp: GoogleCredentialResponse) => void;
          }) => void;
          prompt: () => void;
          renderButton: (
            el: HTMLElement,
            opts: { theme?: string; size?: string; width?: number },
          ) => void;
        };
      };
    };
  }
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <RegisterPageInner />
    </Suspense>
  );
}

function RegisterPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const { setSession, status, user } = useAuth();

  const [phase, setPhase] = useState<Phase>("auth");
  const [authPath, setAuthPath] = useState<AuthPath>("phone");
  const [activeTab, setActiveTab] = useState<Tab>("phone");
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [googleIdToken, setGoogleIdToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Bounce already-signed-in visitors home — but never mid-signup (phase "otp").
  useEffect(() => {
    if (phase === "auth" && status === "authenticated" && user) {
      router.replace(user.role === "ADMIN" ? "/admin" : next);
    }
  }, [phase, status, user, router, next]);

  const e164Phone = phoneNumber.length === 10 ? `+91${phoneNumber}` : "";

  const redirectAfterSignup = (role: string) => {
    router.replace(role === "ADMIN" ? "/admin" : next);
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) {
      document.getElementById(`reg-otp-${index + 1}`)?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      document.getElementById(`reg-otp-${index - 1}`)?.focus();
    }
  };

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    setOtpSent(false);
    setOtp(["", "", "", "", "", ""]);
    setErrorMsg(null);
  };

  const handleApiError = (err: unknown, fallback = "Something went wrong. Please try again.") => {
    if (isApiError(err)) {
      setErrorMsg(err.displayMessage || fallback);
    } else {
      setErrorMsg(fallback);
    }
  };

  const goToOtp = (path: AuthPath) => {
    setAuthPath(path);
    setOtp(["", "", "", "", "", ""]);
    setOtpSent(false);
    setErrorMsg(null);
    setPhase("otp");
  };

  // ── Phone tab (step 1) → OTP phase (OTP already sent) ───────────
  const handlePhoneContinue = async () => {
    if (!e164Phone) return;
    if (!name.trim()) return setErrorMsg("Tell us your name first.");
    setBusy(true);
    setErrorMsg(null);
    try {
      await authApi.requestOtp({ phone: e164Phone });
      setAuthPath("phone");
      setOtp(["", "", "", "", "", ""]);
      setOtpSent(true);
      setPhase("otp");
    } catch (err) {
      handleApiError(err, "Couldn't send OTP. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // ── Email tab (step 1) → OTP phase (account created after OTP) ──
  const handleEmailContinue = () => {
    if (!name.trim() || !email || !password) {
      setErrorMsg("Name, email and password are all required.");
      return;
    }
    goToOtp("email");
  };

  // ── OTP phase: send OTP to the number being verified ────────────
  const handleSendOtp = async () => {
    if (!e164Phone) return setErrorMsg("Enter a 10-digit Indian mobile number.");
    setBusy(true);
    setErrorMsg(null);
    try {
      await authApi.requestOtp({ phone: e164Phone });
      setOtpSent(true);
    } catch (err) {
      handleApiError(err, "Couldn't send OTP. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // ── OTP phase: verify the code — this is what creates the account ─
  const handleVerifyOtp = async () => {
    const code = otp.join("");
    if (code.length !== 6) {
      setErrorMsg("Enter the 6-digit OTP.");
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      let resp;
      if (authPath === "phone") {
        resp = await authApi.verifyOtp({ phone: e164Phone, code, name: name.trim() });
      } else if (authPath === "email") {
        resp = await authApi.registerEmail({
          name: name.trim(),
          email,
          password,
          phone: e164Phone,
          code,
        });
      } else {
        resp = await authApi.google(googleIdToken, e164Phone, code);
      }
      setSession(resp);
      redirectAfterSignup(resp.user.role);
    } catch (err) {
      handleApiError(err, "Couldn't verify OTP.");
    } finally {
      setBusy(false);
    }
  };

  const handleChangeNumber = () => {
    setOtp(["", "", "", "", "", ""]);
    setErrorMsg(null);
    if (authPath === "phone") {
      // Back to the auth tabs to edit name/number (no account exists yet).
      setOtpSent(false);
      setPhase("auth");
    } else {
      // Email/Google — just re-enter the number.
      setOtpSent(false);
    }
  };

  // ── Google signup ───────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "auth" || activeTab !== "google" || !GOOGLE_CLIENT_ID) return;
    if (document.getElementById("gis-script")) {
      initGoogle();
      return;
    }
    const s = document.createElement("script");
    s.id = "gis-script";
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = initGoogle;
    document.head.appendChild(s);

    function initGoogle() {
      if (!window.google || !GOOGLE_CLIENT_ID) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (resp) => {
          setBusy(true);
          setErrorMsg(null);
          try {
            // No phone yet: existing users log in; new users are told to verify.
            const data = await authApi.google(resp.credential);
            setSession(data);
            redirectAfterSignup(data.user.role);
          } catch (err) {
            if (isApiError(err) && err.code === "PHONE_VERIFICATION_REQUIRED") {
              setGoogleIdToken(resp.credential);
              goToOtp("google");
            } else {
              handleApiError(err, "Google sign-up failed.");
            }
          } finally {
            setBusy(false);
          }
        },
      });
      const btn = document.getElementById("reg-gis-btn");
      if (btn) {
        window.google.accounts.id.renderButton(btn, {
          theme: "outline",
          size: "large",
          width: 360,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, activeTab]);

  return (
    <div className="min-h-screen flex">
      {/* ── Left Panel ── */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] bg-[#129cd3] p-12 relative overflow-hidden">
        <div className="absolute -top-20 -left-20 w-80 h-80 bg-white/10 rounded-full" />
        <div className="absolute -bottom-16 -right-16 w-72 h-72 bg-white/10 rounded-full" />
        <div className="absolute top-1/2 right-0 w-40 h-40 bg-white/5 rounded-full translate-x-1/2 -translate-y-1/2" />

        <div className="relative z-10">
          <Link href="/">
            <Image src="/logo-light.png" alt="CPC" width={150} height={52} className="brightness-0 invert" style={{ width: "150px", height: "auto" }} />
          </Link>
        </div>

        <div className="relative z-10">
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Create your<br />CellPhone Crowd account
          </h1>
          <p className="text-white/80 text-base mb-10 leading-relaxed">
            Join thousands of happy customers. Sign up free in seconds and start unlocking exclusive deals.
          </p>

          <ul className="space-y-4">
            {benefits.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-4">
                <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon size={18} className="text-white" />
                </div>
                <span className="text-white/90 text-sm">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-white/50 text-xs">
          © 2024 CellPhone Crowd. All rights reserved.
        </p>
      </div>

      {/* ── Right Panel ── */}
      <div className="flex-1 flex flex-col justify-center items-center bg-gray-50 p-6 sm:p-12">
        <div className="lg:hidden mb-8">
          <Link href="/">
            <Image src="/logo-light.png" alt="CPC" width={140} height={48} style={{ width: "140px", height: "auto" }} />
          </Link>
        </div>

        <div className="w-full max-w-md">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Create your account</h2>
            <p className="text-gray-500 text-sm mt-1">
              Already have an account?{" "}
              <Link href="/login" className="text-[#129cd3] hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </div>

          {/* Step indicator — Authentication → OTP Verification */}
          <div className="flex items-center gap-3 mb-5 px-1">
            {[
              { n: 1, label: "Authentication", on: true },
              { n: 2, label: "OTP Verification", on: phase === "otp" },
            ].map((s, i) => (
              <div key={s.n} className="flex items-center gap-3 flex-1">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    s.on ? "bg-[#129cd3] text-white" : "bg-gray-200 text-gray-500"
                  }`}>{s.n}</div>
                  <span className={`text-xs font-medium ${s.on ? "text-[#129cd3]" : "text-gray-400"}`}>{s.label}</span>
                </div>
                {i === 0 && <div className={`h-0.5 flex-1 ${phase === "otp" ? "bg-[#129cd3]" : "bg-gray-200"}`} />}
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {phase === "auth" && (
              <div className="grid grid-cols-3 border-b border-gray-100">
                {(["phone", "google", "email"] as Tab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => switchTab(tab)}
                    className={`py-3.5 text-xs font-semibold transition-all ${
                      activeTab === tab
                        ? "text-[#129cd3] border-b-2 border-[#129cd3] bg-[#f0f9ff]"
                        : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {tab === "google" ? "Google" : tab === "phone" ? "📱 Phone" : "✉️ Email"}
                  </button>
                ))}
              </div>
            )}

            <div className="p-8">
              {errorMsg && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-line">
                  {errorMsg}
                </div>
              )}

              {/* ───────── Phase 1: Authentication ───────── */}
              {phase === "auth" && (
                <>
                  {/* ── Phone Tab ── */}
                  {activeTab === "phone" && (
                    <div className="space-y-5">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Full Name
                        </label>
                        <div className="flex items-center border-2 border-gray-200 focus-within:border-[#129cd3] rounded-xl overflow-hidden transition-colors">
                          <span className="px-3 py-3 text-gray-400 flex-shrink-0"><User size={17} /></span>
                          <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value.slice(0, 100))}
                            placeholder="Your full name"
                            className="flex-1 px-2 py-3 text-sm outline-none text-gray-800"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Mobile Number
                        </label>
                        <div className="flex items-center border-2 border-gray-200 focus-within:border-[#129cd3] rounded-xl overflow-hidden transition-colors">
                          <span className="px-4 py-3 bg-gray-50 text-gray-600 text-sm font-semibold border-r border-gray-200 flex-shrink-0">
                            +91
                          </span>
                          <input
                            type="tel"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                            placeholder="Enter 10-digit number"
                            className="flex-1 px-4 py-3 text-sm outline-none text-gray-800"
                          />
                        </div>
                      </div>
                      <button
                        onClick={handlePhoneContinue}
                        disabled={phoneNumber.length !== 10 || !name.trim() || busy}
                        className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm transition-all ${
                          phoneNumber.length === 10 && name.trim() && !busy
                            ? "bg-[#129cd3] hover:bg-[#0e87b5] text-white shadow-md shadow-[#129cd3]/30"
                            : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        }`}
                      >
                        {busy ? <Loader2 size={16} className="animate-spin" /> : <>Send OTP <ArrowRight size={16} /></>}
                      </button>
                      <p className="text-center text-xs text-gray-400">
                        We&apos;ll send a 6-digit OTP to verify your number
                      </p>
                    </div>
                  )}

                  {/* ── Google Tab ── */}
                  {activeTab === "google" && (
                    <div className="space-y-5">
                      <p className="text-center text-gray-500 text-sm">
                        Sign up quickly and securely with your Google account.
                      </p>

                      {GOOGLE_CLIENT_ID ? (
                        <div className="flex justify-center"><div id="reg-gis-btn" /></div>
                      ) : (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                          Set <code className="font-mono">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> in <code className="font-mono">.env.local</code> to enable Google sign-up.
                        </div>
                      )}

                      <p className="text-center text-xs text-gray-400">
                        New here? You&apos;ll verify your mobile number by OTP next.
                      </p>

                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-gray-100" />
                        </div>
                        <div className="relative flex justify-center">
                          <span className="bg-white px-3 text-xs text-gray-400">or try another way</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => switchTab("phone")} className="flex items-center justify-center gap-2 border border-gray-200 hover:border-[#129cd3] hover:text-[#129cd3] text-gray-600 text-sm py-2.5 rounded-xl transition-colors">
                          <Phone size={14} /> Phone
                        </button>
                        <button onClick={() => switchTab("email")} className="flex items-center justify-center gap-2 border border-gray-200 hover:border-[#129cd3] hover:text-[#129cd3] text-gray-600 text-sm py-2.5 rounded-xl transition-colors">
                          <Mail size={14} /> Email
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Email Tab ── */}
                  {activeTab === "email" && (
                    <div className="space-y-5">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Full Name</label>
                        <div className="flex items-center border-2 border-gray-200 focus-within:border-[#129cd3] rounded-xl overflow-hidden transition-colors">
                          <span className="px-3 py-3 text-gray-400 flex-shrink-0"><User size={17} /></span>
                          <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value.slice(0, 100))}
                            placeholder="Your full name"
                            className="flex-1 px-2 py-3 text-sm outline-none text-gray-800"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Email Address</label>
                        <div className="flex items-center border-2 border-gray-200 focus-within:border-[#129cd3] rounded-xl overflow-hidden transition-colors">
                          <span className="px-3 py-3 text-gray-400 flex-shrink-0"><Mail size={17} /></span>
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="flex-1 px-2 py-3 text-sm outline-none text-gray-800"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
                        <div className="flex items-center border-2 border-gray-200 focus-within:border-[#129cd3] rounded-xl overflow-hidden transition-colors">
                          <span className="px-3 py-3 text-gray-400 flex-shrink-0"><Lock size={17} /></span>
                          <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleEmailContinue(); }}
                            placeholder="≥8 chars, 1 uppercase, 1 digit"
                            className="flex-1 px-2 py-3 text-sm outline-none text-gray-800"
                          />
                          <button onClick={() => setShowPassword(!showPassword)} className="px-3 text-gray-400 hover:text-gray-600 flex-shrink-0">
                            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                          </button>
                        </div>
                        <p className="mt-1.5 text-xs text-gray-400">
                          You&apos;ll verify your mobile number by OTP next.
                        </p>
                      </div>
                      <button
                        onClick={handleEmailContinue}
                        disabled={busy || !name.trim() || !email || !password}
                        className="w-full bg-[#129cd3] hover:bg-[#0e87b5] disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold py-3.5 rounded-xl transition-colors shadow-md shadow-[#129cd3]/30 flex items-center justify-center gap-2"
                      >
                        {busy ? <Loader2 size={16} className="animate-spin" /> : <>Continue <ArrowRight size={16} /></>}
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* ───────── Phase 2: OTP Verification ───────── */}
              {phase === "otp" && (
                <div className="space-y-5">
                  <h3 className="font-bold text-gray-900 text-lg">Verify your mobile number</h3>

                  {authPath !== "phone" && !otpSent ? (
                    <>
                      <p className="text-sm text-gray-500">
                        Enter your mobile number — we&apos;ll send a 6-digit OTP to confirm it.
                      </p>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Mobile Number</label>
                        <div className="flex items-center border-2 border-gray-200 focus-within:border-[#129cd3] rounded-xl overflow-hidden transition-colors">
                          <span className="px-4 py-3 bg-gray-50 text-gray-600 text-sm font-semibold border-r border-gray-200 flex-shrink-0">
                            +91
                          </span>
                          <input
                            type="tel"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                            placeholder="Enter 10-digit number"
                            className="flex-1 px-4 py-3 text-sm outline-none text-gray-800"
                          />
                        </div>
                      </div>
                      <button
                        onClick={handleSendOtp}
                        disabled={phoneNumber.length !== 10 || busy}
                        className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm transition-all ${
                          phoneNumber.length === 10 && !busy
                            ? "bg-[#129cd3] hover:bg-[#0e87b5] text-white shadow-md shadow-[#129cd3]/30"
                            : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        }`}
                      >
                        {busy ? <Loader2 size={16} className="animate-spin" /> : <>Send OTP <ArrowRight size={16} /></>}
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="bg-[#e8f7fc] rounded-xl px-4 py-3 flex items-center justify-between">
                        <p className="text-sm text-gray-700">
                          OTP sent to <span className="font-bold text-gray-900">+91 {phoneNumber}</span>
                        </p>
                        <button
                          onClick={handleChangeNumber}
                          className="text-xs text-[#129cd3] hover:underline font-medium"
                        >
                          Change
                        </button>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-3">
                          Enter 6-digit OTP
                        </label>
                        <div className="flex gap-2 justify-between">
                          {otp.map((digit, i) => (
                            <input
                              key={i}
                              id={`reg-otp-${i}`}
                              type="text"
                              inputMode="numeric"
                              maxLength={1}
                              value={digit}
                              onChange={(e) => handleOtpChange(i, e.target.value.replace(/\D/g, ""))}
                              onKeyDown={(e) => handleOtpKeyDown(i, e)}
                              className="w-11 h-12 text-center text-lg font-bold border-2 border-gray-200 focus:border-[#129cd3] focus:bg-[#f0f9ff] rounded-xl outline-none transition-colors"
                            />
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={handleVerifyOtp}
                        disabled={busy || otp.join("").length !== 6}
                        className="w-full bg-[#129cd3] hover:bg-[#0e87b5] disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold py-3.5 rounded-xl transition-colors shadow-md shadow-[#129cd3]/30 flex items-center justify-center gap-2"
                      >
                        {busy ? <Loader2 size={16} className="animate-spin" /> : <>Create Account <ArrowRight size={16} /></>}
                      </button>
                      <p className="text-center text-xs text-gray-500">
                        Didn&apos;t receive?{" "}
                        <button
                          onClick={handleSendOtp}
                          className="text-[#129cd3] hover:underline font-semibold"
                        >Resend OTP</button>
                      </p>
                    </>
                  )}

                  {authPath === "phone" && (
                    <button
                      onClick={handleChangeNumber}
                      className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      <ArrowLeft size={14} /> Back
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-[#b8e8f5] bg-[#e8f7fc] px-4 py-3 text-center">
            <p className="text-xs text-gray-700">
              Registering a business?{" "}
              <Link href="/dealer/register" className="text-[#129cd3] hover:underline font-semibold">
                Sign up as a dealer →
              </Link>
            </p>
          </div>

          <p className="text-center text-xs text-gray-400 mt-5">
            By continuing, you agree to our{" "}
            <a href="#" className="text-[#129cd3] hover:underline">Terms of Service</a> and{" "}
            <a href="#" className="text-[#129cd3] hover:underline">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
