"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ArrowRight, ArrowLeft, Building2, FileText, Loader2, ShieldCheck } from "lucide-react";
import { authApi, isApiError, meApi, partnersApi } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthProvider";

type Step = 1 | 2 | 3;
type AuthMethod = "google" | "phone" | "email";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export default function DealerRegisterPage() {
  const router = useRouter();
  const { user, status, setSession, refreshUser } = useAuth();

  const [step, setStep] = useState<Step>(1);
  const [authMethod, setAuthMethod] = useState<AuthMethod>("phone");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [otpSent, setOtpSent] = useState(false);
  const [googleIdToken, setGoogleIdToken] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const e164Phone = phone.length === 10 ? `+91${phone}` : "";

  // Already authenticated (existing customer upgrading): the auth step doesn't
  // apply — start them on Company Details. Phone-signup users stay unauthenticated
  // until the final OTP step, so they walk steps 1 → 2 → 3 normally.
  const authed = status === "authenticated";
  // A logged-in user who already has a verified phone skips OTP entirely.
  const phoneAlreadyVerified = authed && !!user?.phone;

  // If they're already a partner, get them out of here.
  useEffect(() => {
    if (authed && user?.role === "PARTNER") {
      router.replace("/dealer");
    }
  }, [authed, user?.role, router]);

  const effectiveStep: Step = authed && step === 1 ? 2 : step;
  const displayName = name || (authed ? user?.name ?? "" : "");

  const handleApiError = (err: unknown, fallback = "Something went wrong.") => {
    if (isApiError(err)) {
      setErrorMsg(err.displayMessage || fallback);
    } else {
      setErrorMsg(fallback);
    }
  };

  const steps = [
    { number: 1, label: "Authentication" },
    { number: 2, label: "Company Details" },
    { number: 3, label: "OTP Verification" },
  ];

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) {
      const next = document.getElementById(`dotp-${index + 1}`);
      if (next) (next as HTMLInputElement).focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      const prev = document.getElementById(`dotp-${index - 1}`);
      if (prev) (prev as HTMLInputElement).focus();
    }
  };

  // ── Step 1: Authentication → Company Details ─────────────────────
  const handleStep1Continue = async () => {
    setErrorMsg(null);
    if (authMethod === "phone") {
      if (!e164Phone) return setErrorMsg("Enter a 10-digit Indian mobile number.");
      if (!name.trim()) return setErrorMsg("Tell us your name first.");
      // OTP is the final step — just carry name + phone forward for now.
      setStep(2);
      return;
    }
    if (authMethod === "email") {
      if (!name.trim() || !email || !password) {
        return setErrorMsg("Name, email and password are all required.");
      }
      // Account is created at the final OTP step — carry creds forward for now.
      setStep(2);
      return;
    }
    if (authMethod === "google") {
      // Triggered by GIS button; no manual continue.
      setErrorMsg("Use the Google button above to continue.");
    }
  };

  // ── Step 2: Company Details → OTP Verification ───────────────────
  const handleCompanyContinue = () => {
    setErrorMsg(null);
    if (companyName.trim().length < 2) return setErrorMsg("Enter your company name.");
    if (gstNumber.length !== 15) return setErrorMsg("GSTIN must be 15 characters.");
    setOtp(["", "", "", "", "", ""]);
    setOtpSent(false);
    setStep(3);
  };

  // ── Step 3: send OTP for the phone we want to verify ─────────────
  const handleSendOtp = async () => {
    if (!e164Phone) return setErrorMsg("Enter a 10-digit Indian mobile number.");
    setBusy(true);
    setErrorMsg(null);
    try {
      if (authed) await meApi.requestPhoneOtp(e164Phone);
      else await authApi.requestOtp({ phone: e164Phone });
      setOtpSent(true);
    } catch (err) {
      handleApiError(err, "Couldn't send OTP.");
    } finally {
      setBusy(false);
    }
  };

  // Submit the dealer application once the phone is verified (or already was).
  const submitUpgrade = async () => {
    await partnersApi.upgrade({ companyName: companyName.trim(), gstNumber });
    await refreshUser();
    router.replace("/dealer");
  };

  const handleUpgradeError = (err: unknown) => {
    if (isApiError(err) && err.code === "PHONE_REQUIRED_FOR_PARTNER") {
      setErrorMsg("Verify your phone number before applying as a dealer.");
    } else if (isApiError(err) && err.code === "PHONE_ALREADY_TAKEN") {
      setErrorMsg("This phone number is already registered to another account.");
    } else if (isApiError(err) && err.code === "PARTNER_UPGRADE_NOT_ALLOWED") {
      setErrorMsg("Your application is already in review or approved.");
    } else if (isApiError(err) && err.code === "GST_ALREADY_REGISTERED") {
      setErrorMsg("This GSTIN is already registered with another account.");
    } else {
      handleApiError(err, "Couldn't submit application.");
    }
  };

  // ── Step 3: verify OTP, then submit the application ──────────────
  const handleVerifyAndSubmit = async () => {
    const code = otp.join("");
    if (code.length !== 6) return setErrorMsg("Enter the 6-digit OTP.");
    setBusy(true);
    setErrorMsg(null);
    try {
      if (authed) {
        await meApi.verifyPhoneOtp(e164Phone, code);
      } else if (authMethod === "phone") {
        const resp = await authApi.verifyOtp({ phone: e164Phone, code, name: name.trim() });
        setSession(resp);
      } else if (authMethod === "email") {
        const resp = await authApi.registerEmail({
          name: name.trim(),
          email,
          password,
          phone: e164Phone,
          code,
        });
        setSession(resp);
      } else {
        const resp = await authApi.google(googleIdToken, e164Phone, code);
        setSession(resp);
      }
      await submitUpgrade();
    } catch (err) {
      handleUpgradeError(err);
    } finally {
      setBusy(false);
    }
  };

  // Existing customer who already verified a phone — no OTP needed.
  const handleSubmitVerified = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await submitUpgrade();
    } catch (err) {
      handleUpgradeError(err);
    } finally {
      setBusy(false);
    }
  };

  // ── Google sign-in (step 1 google tab) ──────────────────────────
  useEffect(() => {
    if (step !== 1 || authMethod !== "google" || !GOOGLE_CLIENT_ID) return;
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
      type W = Window & {
        google?: {
          accounts: {
            id: {
              initialize: (c: { client_id: string; callback: (r: { credential: string }) => void }) => void;
              renderButton: (el: HTMLElement, o: { theme?: string; size?: string; width?: number }) => void;
            };
          };
        };
      };
      const w = window as W;
      if (!w.google || !GOOGLE_CLIENT_ID) return;
      w.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (resp) => {
          setBusy(true);
          setErrorMsg(null);
          try {
            const data = await authApi.google(resp.credential);
            setSession(data);
            if (!name && data.user.name) setName(data.user.name);
            setStep(2);
          } catch (err) {
            if (isApiError(err) && err.code === "PHONE_VERIFICATION_REQUIRED") {
              // New Google account — created at the final OTP step.
              setGoogleIdToken(resp.credential);
              setStep(2);
            } else {
              handleApiError(err, "Google sign-in failed.");
            }
          } finally {
            setBusy(false);
          }
        },
      });
      const btn = document.getElementById("dealer-gis-btn");
      if (btn) w.google.accounts.id.renderButton(btn, { theme: "outline", size: "large", width: 360 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, authMethod]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#e8f7fc] to-[#f0f9ff] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-[#129cd3] rounded-2xl mb-3 shadow-lg">
            <Building2 size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Dealer Registration</h1>
          <p className="text-sm text-gray-500 mt-1">Join CPC Electronics as a verified dealer partner</p>
        </div>

        <div className="flex items-center justify-between mb-8 px-4">
          {steps.map((s, i) => (
            <div key={s.number} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                    effectiveStep > s.number
                      ? "bg-green-500 text-white"
                      : effectiveStep === s.number
                      ? "bg-[#129cd3] text-white shadow-md shadow-[#129cd3]/30"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {effectiveStep > s.number ? <Check size={16} /> : s.number}
                </div>
                <span className={`text-xs font-medium text-center whitespace-nowrap ${
                  effectiveStep === s.number ? "text-[#129cd3]" : "text-gray-400"
                }`}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={`h-0.5 flex-1 mx-2 mb-5 transition-all ${effectiveStep > s.number ? "bg-green-500" : "bg-gray-200"}`} />
              )}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {errorMsg && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-line">
              {errorMsg}
            </div>
          )}

          {/* Step 1 — Authentication */}
          {effectiveStep === 1 && (
            <div className="space-y-5">
              <h2 className="font-bold text-gray-800 text-lg mb-1">Choose Sign-up Method</h2>
              <p className="text-sm text-gray-500 mb-4">Select how you want to register as a dealer</p>

              <div className="flex border border-gray-200 rounded-xl overflow-hidden">
                {(["google", "phone", "email"] as AuthMethod[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setAuthMethod(m); setErrorMsg(null); }}
                    className={`flex-1 py-2.5 text-sm font-medium transition-colors capitalize ${
                      authMethod === m ? "bg-[#129cd3] text-white" : "text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>

              {authMethod === "google" && (
                GOOGLE_CLIENT_ID ? (
                  <div className="flex justify-center"><div id="dealer-gis-btn" /></div>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                    Set <code className="font-mono">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> to enable Google sign-up.
                  </div>
                )
              )}

              {authMethod !== "google" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Your Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setName(e.target.value.slice(0, 100))}
                    placeholder="Full name"
                    className="w-full border-2 border-gray-200 focus:border-[#129cd3] rounded-xl px-4 py-3 text-sm outline-none text-gray-700 transition-colors"
                  />
                </div>
              )}

              {authMethod === "phone" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Mobile Number</label>
                  <div className="flex items-center border-2 border-gray-200 focus-within:border-[#129cd3] rounded-xl overflow-hidden transition-colors">
                    <span className="px-4 py-3 bg-gray-50 text-gray-600 text-sm font-medium border-r border-gray-200">+91</span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="Enter 10-digit number"
                      className="flex-1 px-4 py-3 text-sm outline-none text-gray-700"
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-gray-400">We&apos;ll verify this number by OTP at the last step.</p>
                </div>
              )}

              {authMethod === "email" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="business@company.com"
                      className="w-full border-2 border-gray-200 focus:border-[#129cd3] rounded-xl px-4 py-3 text-sm outline-none text-gray-700 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="≥8 chars, 1 uppercase, 1 digit"
                      className="w-full border-2 border-gray-200 focus:border-[#129cd3] rounded-xl px-4 py-3 text-sm outline-none text-gray-700 transition-colors"
                    />
                  </div>
                </div>
              )}

              {authMethod !== "google" && (
                <button
                  onClick={handleStep1Continue}
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold py-3.5 rounded-xl transition-colors mt-2"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <>Continue <ArrowRight size={16} /></>}
                </button>
              )}
            </div>
          )}

          {/* Step 2 — Company Details */}
          {effectiveStep === 2 && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 mb-1">
                <FileText size={20} className="text-[#129cd3]" />
                <h2 className="font-bold text-gray-800 text-lg">Company Details</h2>
              </div>
              <p className="text-sm text-gray-500 mb-4">Tell us about your business to complete registration</p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Company Name</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value.slice(0, 200))}
                  placeholder="Your Company Pvt. Ltd."
                  className="w-full border-2 border-gray-200 focus:border-[#129cd3] rounded-xl px-4 py-3 text-sm outline-none text-gray-700 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">GST Number</label>
                <input
                  type="text"
                  value={gstNumber}
                  onChange={(e) => setGstNumber(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 15))}
                  placeholder="22AAAAA0000A1Z5"
                  maxLength={15}
                  className="w-full border-2 border-gray-200 focus:border-[#129cd3] rounded-xl px-4 py-3 text-sm outline-none text-gray-700 font-mono tracking-wider transition-colors"
                />
                <p className="mt-1 text-xs text-gray-400">15 characters, e.g. 29ABCDE1234F1Z5</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  disabled={authed}
                  className="flex items-center justify-center gap-1 px-4 py-3.5 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowLeft size={16} />
                </button>
                <button
                  onClick={handleCompanyContinue}
                  disabled={busy || !companyName || gstNumber.length !== 15}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold py-3.5 rounded-xl transition-colors"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <>Continue <ArrowRight size={16} /></>}
                </button>
              </div>
            </div>
          )}

          {/* Step 3 — OTP Verification + submit */}
          {effectiveStep === 3 && (
            <div className="space-y-5">
              <h2 className="font-bold text-gray-800 text-lg mb-1">OTP Verification</h2>

              {phoneAlreadyVerified ? (
                <>
                  <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-2 text-sm text-green-700">
                    <ShieldCheck size={18} />
                    <span>Mobile number <span className="font-semibold">+91 {user?.phone?.replace(/^\+91/, "")}</span> is already verified.</span>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep(2)}
                      className="flex items-center justify-center gap-1 px-4 py-3.5 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      <ArrowLeft size={16} />
                    </button>
                    <button
                      onClick={handleSubmitVerified}
                      disabled={busy}
                      className="flex-1 flex items-center justify-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold py-3.5 rounded-xl transition-colors"
                    >
                      {busy ? <Loader2 size={16} className="animate-spin" /> : <>Submit Application <Check size={16} /></>}
                    </button>
                  </div>
                </>
              ) : !otpSent ? (
                <>
                  <p className="text-sm text-gray-500">
                    Verify your mobile number to finish your dealer application.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Mobile Number</label>
                    <div className="flex items-center border-2 border-gray-200 focus-within:border-[#129cd3] rounded-xl overflow-hidden transition-colors">
                      <span className="px-4 py-3 bg-gray-50 text-gray-600 text-sm font-medium border-r border-gray-200">+91</span>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        placeholder="Enter 10-digit number"
                        disabled={!authed && authMethod === "phone"}
                        className="flex-1 px-4 py-3 text-sm outline-none text-gray-700 disabled:bg-gray-50"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep(2)}
                      className="flex items-center justify-center gap-1 px-4 py-3.5 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      <ArrowLeft size={16} />
                    </button>
                    <button
                      onClick={handleSendOtp}
                      disabled={busy || phone.length !== 10}
                      className="flex-1 flex items-center justify-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold py-3.5 rounded-xl transition-colors"
                    >
                      {busy ? <Loader2 size={16} className="animate-spin" /> : <>Send OTP <ArrowRight size={16} /></>}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-500">
                    Enter the 6-digit code sent to{" "}
                    <span className="font-semibold text-gray-700">+91 {phone}</span>
                    {" "}
                    <button
                      onClick={() => { setOtpSent(false); setOtp(["", "", "", "", "", ""]); }}
                      className="text-[#129cd3] hover:underline font-medium"
                    >Change</button>
                  </p>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">Enter 6-digit OTP</label>
                    <div className="flex gap-2 justify-between">
                      {otp.map((digit, i) => (
                        <input
                          key={i}
                          id={`dotp-${i}`}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleOtpChange(i, e.target.value.replace(/\D/g, ""))}
                          onKeyDown={(e) => handleOtpKeyDown(i, e)}
                          className="w-12 h-12 text-center text-lg font-bold border-2 border-gray-200 focus:border-[#129cd3] rounded-xl outline-none transition-colors"
                        />
                      ))}
                    </div>
                  </div>

                  <p className="text-center text-xs text-gray-500">
                    Didn&apos;t receive?{" "}
                    <button
                      onClick={handleSendOtp}
                      className="text-[#129cd3] hover:underline font-medium"
                    >Resend OTP</button>
                  </p>

                  <div className="flex gap-3">
                    <button
                      onClick={() => { setOtpSent(false); setOtp(["", "", "", "", "", ""]); }}
                      className="flex items-center justify-center gap-1 px-4 py-3.5 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      <ArrowLeft size={16} />
                    </button>
                    <button
                      onClick={handleVerifyAndSubmit}
                      disabled={busy || otp.join("").length !== 6}
                      className="flex-1 flex items-center justify-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold py-3.5 rounded-xl transition-colors"
                    >
                      {busy ? <Loader2 size={16} className="animate-spin" /> : <>Verify &amp; Submit <Check size={16} /></>}
                    </button>
                  </div>
                </>
              )}

              <p className="text-xs text-gray-400 text-center">
                After submission, our team will review your KYC and you can upload supporting documents from your dashboard.
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Already registered?{" "}
          <a href="/login" className="text-[#129cd3] hover:underline">Sign in here</a>
        </p>
        <p className="text-center text-xs text-gray-400 mt-2">
          Not a dealer?{" "}
          <a href="/register" className="text-[#129cd3] hover:underline">Sign up as a customer →</a>
        </p>
      </div>
    </div>
  );
}
