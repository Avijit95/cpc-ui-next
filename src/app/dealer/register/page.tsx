"use client";

import { useState } from "react";
import { Check, ArrowRight, ArrowLeft, Building2, FileText } from "lucide-react";

type Step = 1 | 2 | 3;
type AuthMethod = "google" | "phone" | "email";

export default function DealerRegisterPage() {
  const [step, setStep] = useState<Step>(1);
  const [authMethod, setAuthMethod] = useState<AuthMethod>("google");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [companyName, setCompanyName] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [businessType, setBusinessType] = useState("");

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

  const steps = [
    { number: 1, label: "Authentication" },
    { number: 2, label: "OTP Verification" },
    { number: 3, label: "Company Details" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#e8f7fc] to-[#f0f9ff] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-[#129cd3] rounded-2xl mb-3 shadow-lg">
            <Building2 size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Dealer Registration</h1>
          <p className="text-sm text-gray-500 mt-1">Join CPC Electronics as a verified dealer partner</p>
        </div>

        {/* Step Progress */}
        <div className="flex items-center justify-between mb-8 px-4">
          {steps.map((s, i) => (
            <div key={s.number} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                    step > s.number
                      ? "bg-green-500 text-white"
                      : step === s.number
                      ? "bg-[#129cd3] text-white shadow-md shadow-[#129cd3]/30"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {step > s.number ? <Check size={16} /> : s.number}
                </div>
                <span className={`text-xs font-medium text-center whitespace-nowrap ${
                  step === s.number ? "text-[#129cd3]" : "text-gray-400"
                }`}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={`h-0.5 flex-1 mx-2 mb-5 transition-all ${step > s.number ? "bg-green-500" : "bg-gray-200"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">

          {/* Step 1: Auth Method */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="font-bold text-gray-800 text-lg mb-1">Choose Sign-up Method</h2>
              <p className="text-sm text-gray-500 mb-4">Select how you want to register as a dealer</p>

              {/* Method Tabs */}
              <div className="flex border border-gray-200 rounded-xl overflow-hidden">
                {(["google", "phone", "email"] as AuthMethod[]).map((method) => (
                  <button
                    key={method}
                    onClick={() => setAuthMethod(method)}
                    className={`flex-1 py-2.5 text-sm font-medium transition-colors capitalize ${
                      authMethod === method
                        ? "bg-[#129cd3] text-white"
                        : "text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {method.charAt(0).toUpperCase() + method.slice(1)}
                  </button>
                ))}
              </div>

              {authMethod === "google" && (
                <button className="w-full flex items-center justify-center gap-3 border-2 border-gray-200 hover:border-[#129cd3] hover:bg-[#f0f9ff] text-gray-700 font-medium py-3.5 rounded-xl transition-all">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                    alt="Google"
                    className="w-5 h-5"
                  />
                  Continue with Google
                </button>
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
                      placeholder="Create a strong password"
                      className="w-full border-2 border-gray-200 focus:border-[#129cd3] rounded-xl px-4 py-3 text-sm outline-none text-gray-700 transition-colors"
                    />
                  </div>
                </div>
              )}

              <button
                onClick={() => setStep(2)}
                className="w-full flex items-center justify-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] text-white font-semibold py-3.5 rounded-xl transition-colors mt-2"
              >
                Continue <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* Step 2: OTP */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="font-bold text-gray-800 text-lg mb-1">OTP Verification</h2>
              <p className="text-sm text-gray-500">
                Enter the 6-digit code sent to your{" "}
                <span className="font-semibold text-gray-700">
                  {authMethod === "phone" ? `+91 ${phone}` : email || "registered contact"}
                </span>
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
                <button className="text-[#129cd3] hover:underline font-medium">Resend OTP</button>
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex items-center justify-center gap-1 px-4 py-3.5 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <ArrowLeft size={16} />
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] text-white font-semibold py-3.5 rounded-xl transition-colors"
                >
                  Verify OTP <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Company Details */}
          {step === 3 && (
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
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Your Company Pvt. Ltd."
                  className="w-full border-2 border-gray-200 focus:border-[#129cd3] rounded-xl px-4 py-3 text-sm outline-none text-gray-700 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">GST Number</label>
                <input
                  type="text"
                  value={gstNumber}
                  onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                  placeholder="22AAAAA0000A1Z5"
                  maxLength={15}
                  className="w-full border-2 border-gray-200 focus:border-[#129cd3] rounded-xl px-4 py-3 text-sm outline-none text-gray-700 font-mono tracking-wider transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Business Type</label>
                <select
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  className="w-full border-2 border-gray-200 focus:border-[#129cd3] rounded-xl px-4 py-3 text-sm outline-none text-gray-700 bg-white cursor-pointer transition-colors appearance-none"
                >
                  <option value="" disabled>Select business type</option>
                  <option value="Retailer">Retailer</option>
                  <option value="Wholesaler">Wholesaler</option>
                  <option value="Distributor">Distributor</option>
                </select>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="flex items-center justify-center gap-1 px-4 py-3.5 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <ArrowLeft size={16} />
                </button>
                <a
                  href="/dealer"
                  className="flex-1 flex items-center justify-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] text-white font-semibold py-3.5 rounded-xl transition-colors"
                >
                  Complete Registration <Check size={16} />
                </a>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Already registered?{" "}
          <a href="/login" className="text-[#129cd3] hover:underline">Sign in here</a>
        </p>
      </div>
    </div>
  );
}
