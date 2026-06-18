"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth/AuthProvider";
import { isApiError, meApi } from "@/lib/api";
import type { KycStatus, PublicUser } from "@/lib/api";
import {
  LayoutDashboard,
  ShoppingBag,
  Heart,
  MapPin,
  User,
  Headphones,
  LogOut,
  ChevronRight,
  ChevronLeft,
  Camera,
  Loader2,
  CheckCircle,
  X,
} from "lucide-react";

type SidebarItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
  href: string;
};

const sidebarItems: SidebarItem[] = [
  { key: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} />, href: "/account" },
  { key: "orders", label: "Orders", icon: <ShoppingBag size={18} />, href: "/account/orders" },
  { key: "wishlist", label: "Wishlist", icon: <Heart size={18} />, href: "/wishlist" },
  { key: "addresses", label: "Addresses", icon: <MapPin size={18} />, href: "/account/addresses" },
  { key: "profile", label: "Profile", icon: <User size={18} />, href: "/account/profile" },
  { key: "support", label: "Support", icon: <Headphones size={18} />, href: "/account/support" },
];

const PFP_MAX_BYTES = 5 * 1024 * 1024; // matches backend PresignProfilePicDto
const PFP_ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

const kycPill: Record<KycStatus, { label: string; cls: string }> = {
  NONE: { label: "Not submitted", cls: "bg-gray-100 text-gray-600" },
  PENDING: { label: "Under review", cls: "bg-blue-50 text-blue-700" },
  VERIFIED: { label: "Verified", cls: "bg-green-100 text-green-700" },
  REJECTED: { label: "Rejected", cls: "bg-red-50 text-red-700" },
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, status } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?next=/account/profile");
    }
  }, [status, router]);

  if (status !== "authenticated" || !user) {
    return (
      <>
        <Header />
        <main className="flex-1 flex items-center justify-center bg-gray-50">
          <Loader2 className="animate-spin text-[#129cd3]" size={28} />
        </main>
        <Footer />
      </>
    );
  }

  return <ProfileInner user={user} />;
}

function ProfileInner({ user }: { user: PublicUser }) {
  const router = useRouter();
  const { refreshUser, logout } = useAuth();

  // Name edit
  const [name, setName] = useState(user.name);
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // Profile pic upload
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingPic, setUploadingPic] = useState(false);
  const [picError, setPicError] = useState<string | null>(null);

  // Phone change modal
  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  const [phoneStep, setPhoneStep] = useState<"enter" | "verify">("enter");
  const [newPhone, setNewPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const nameTrimmed = name.trim();
  const nameDirty = nameTrimmed.length > 0 && nameTrimmed !== user.name;

  // Phone is stored/typed as 10 local digits; +91 is fixed (India only).
  const newPhoneE164 = newPhone.length === 10 ? `+91${newPhone}` : "";

  async function handleSaveName() {
    if (!nameDirty || savingName) return;
    setSavingName(true);
    setNameError(null);
    setNameSaved(false);
    try {
      await meApi.update({ name: nameTrimmed });
      await refreshUser();
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2500);
    } catch (err) {
      setNameError(isApiError(err) ? err.message : "Could not save name.");
    } finally {
      setSavingName(false);
    }
  }

  async function handlePicChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setPicError(null);
    if (!PFP_ACCEPTED.includes(file.type)) {
      setPicError("Please pick a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > PFP_MAX_BYTES) {
      setPicError("Image must be 5 MB or smaller.");
      return;
    }
    setUploadingPic(true);
    try {
      await meApi.uploadProfilePic(file);
      await refreshUser();
    } catch (err) {
      setPicError(isApiError(err) ? err.message : "Upload failed.");
    } finally {
      setUploadingPic(false);
    }
  }

  function openPhoneModal() {
    setPhoneModalOpen(true);
    setPhoneStep("enter");
    setNewPhone("");
    setOtpCode("");
    setPhoneError(null);
  }

  function closePhoneModal() {
    if (phoneBusy) return;
    setPhoneModalOpen(false);
  }

  async function handlePhoneRequestOtp() {
    if (phoneBusy) return;
    if (newPhone.length !== 10) {
      setPhoneError("Enter a 10-digit mobile number.");
      return;
    }
    setPhoneBusy(true);
    setPhoneError(null);
    try {
      await meApi.requestPhoneOtp(newPhoneE164);
      setPhoneStep("verify");
    } catch (err) {
      setPhoneError(isApiError(err) ? err.message : "Could not send OTP.");
    } finally {
      setPhoneBusy(false);
    }
  }

  async function handlePhoneVerifyOtp() {
    if (phoneBusy) return;
    if (otpCode.trim().length < 4) {
      setPhoneError("Enter the OTP from your SMS.");
      return;
    }
    setPhoneBusy(true);
    setPhoneError(null);
    try {
      await meApi.verifyPhoneOtp(newPhoneE164, otpCode.trim());
      await refreshUser();
      setPhoneModalOpen(false);
    } catch (err) {
      setPhoneError(isApiError(err) ? err.message : "OTP verification failed.");
    } finally {
      setPhoneBusy(false);
    }
  }

  const kyc = kycPill[user.kycStatus];

  return (
    <>
      <Header />
      <main className="bg-gray-50 min-h-screen">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-1.5 text-xs text-gray-500">
            <Link href="/" className="hover:text-[#129cd3]">Home</Link>
            <ChevronRight size={12} />
            <Link href="/account" className="hover:text-[#129cd3]">My Account</Link>
            <ChevronRight size={12} />
            <span className="text-gray-800 font-medium">Profile</span>
          </div>
        </div>
        <div className="lg:hidden max-w-7xl mx-auto px-4 pt-4">
          <Link href="/account" className="inline-flex items-center gap-1 text-sm text-[#129cd3] font-medium hover:underline">
            <ChevronLeft size={16} /> Back to Account
          </Link>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-8 flex gap-6">
          <aside className="w-64 flex-shrink-0 hidden lg:block">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-[#129cd3] px-5 py-5 text-white">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-2 overflow-hidden">
                  {user.profilePicUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.profilePicUrl} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[#129cd3] font-bold text-lg">{initials(user.name)}</span>
                  )}
                </div>
                <p className="font-semibold">{user.name}</p>
                <p className="text-[#b8e8f5] text-xs truncate">{user.email ?? user.phone ?? ""}</p>
              </div>
              <nav className="py-2">
                {sidebarItems.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${
                      item.key === "profile"
                        ? "bg-[#e8f7fc] text-[#129cd3] border-r-4 border-[#129cd3]"
                        : "text-gray-600 hover:bg-gray-50 hover:text-[#129cd3]"
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                ))}
                <button
                  onClick={async () => {
                    await logout();
                    router.replace("/login");
                  }}
                  className="w-full text-left flex items-center gap-3 px-5 py-3 text-sm font-medium text-red-500 hover:bg-red-50"
                >
                  <LogOut size={18} />
                  Logout
                </button>
              </nav>
            </div>
          </aside>

          <div className="flex-1 min-w-0 space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 px-4 sm:px-6 py-5">
              <h1 className="text-xl font-bold text-gray-800">Profile</h1>
              <p className="text-sm text-gray-500 mt-1">Manage your account details.</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 px-4 sm:px-6 py-5">
              <h2 className="font-bold text-gray-800 mb-4">Account</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">Role</p>
                  <p className="text-gray-800 mt-0.5">{user.role}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">KYC Status</p>
                  <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full mt-0.5 ${kyc.cls}`}>
                    {kyc.label}
                  </span>
                </div>
                {user.companyName && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase">Company</p>
                    <p className="text-gray-800 mt-0.5">{user.companyName}</p>
                  </div>
                )}
                {user.gstNumber && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase">GST Number</p>
                    <p className="text-gray-800 mt-0.5">{user.gstNumber}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 px-4 sm:px-6 py-5">
              <h2 className="font-bold text-gray-800 mb-4">Profile Picture</h2>
              <div className="flex items-center gap-5">
                <div className="w-20 h-20 rounded-full bg-[#e8f7fc] flex items-center justify-center overflow-hidden flex-shrink-0">
                  {user.profilePicUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.profilePicUrl} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[#129cd3] font-bold text-2xl">{initials(user.name)}</span>
                  )}
                </div>
                <div className="flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handlePicChange}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPic}
                    className="inline-flex items-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                  >
                    {uploadingPic ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                    {uploadingPic ? "Uploading…" : "Change Photo"}
                  </button>
                  <p className="text-[11px] text-gray-400 mt-2">JPEG, PNG, or WebP. Max 5 MB.</p>
                  {picError && <p className="text-xs text-red-600 mt-2">{picError}</p>}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 px-4 sm:px-6 py-5">
              <h2 className="font-bold text-gray-800 mb-4">Personal Details</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Full Name</label>
                  <div className="flex flex-col min-[500px]:flex-row min-[500px]:items-center gap-2 min-[500px]:gap-3">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={100}
                      className="w-full min-[500px]:flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                    />
                    <button
                      onClick={handleSaveName}
                      disabled={!nameDirty || savingName}
                      className="w-full min-[500px]:w-auto flex-shrink-0 bg-[#129cd3] hover:bg-[#0e87b5] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors inline-flex items-center justify-center gap-2"
                    >
                      {savingName && <Loader2 size={14} className="animate-spin" />}
                      Save
                    </button>
                  </div>
                  {nameSaved && (
                    <p className="text-xs text-green-700 mt-2 inline-flex items-center gap-1">
                      <CheckCircle size={12} /> Saved
                    </p>
                  )}
                  {nameError && <p className="text-xs text-red-600 mt-2">{nameError}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
                  <input
                    type="text"
                    value={user.email ?? "—"}
                    readOnly
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Phone</label>
                  <div className="flex flex-col min-[500px]:flex-row min-[500px]:items-center gap-2 min-[500px]:gap-3">
                    <input
                      type="text"
                      value={user.phone ?? "Not set"}
                      readOnly
                      className="w-full min-[500px]:flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-600"
                    />
                    <button
                      onClick={openPhoneModal}
                      className="w-full min-[500px]:w-auto flex-shrink-0 border-2 border-[#129cd3] text-[#129cd3] hover:bg-[#e8f7fc] text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                    >
                      {user.phone ? "Change" : "Add"}
                    </button>
                  </div>
                  {user.phoneRequired && (
                    <p className="text-xs text-amber-700 mt-2">
                      A verified phone is required for checkout and partner registration.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />

      {phoneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closePhoneModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 z-10">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-800">
                {phoneStep === "enter" ? (user.phone ? "Change Phone" : "Add Phone") : "Verify OTP"}
              </h2>
              <button
                onClick={closePhoneModal}
                disabled={phoneBusy}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            {phoneStep === "enter" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">New Phone Number</label>
                  <div className="flex items-center border border-gray-300 focus-within:border-[#129cd3] focus-within:ring-1 focus-within:ring-[#129cd3] rounded-lg overflow-hidden">
                    <span className="px-3 py-2.5 bg-gray-50 text-gray-600 text-sm font-semibold border-r border-gray-300 flex-shrink-0">+91</span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      placeholder="Enter 10-digit number"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      autoFocus
                      className="flex-1 px-3 py-2.5 text-sm outline-none text-gray-800"
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">10-digit Indian mobile number.</p>
                </div>
                {phoneError && <p className="text-xs text-red-600">{phoneError}</p>}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handlePhoneRequestOtp}
                    disabled={phoneBusy || newPhone.length !== 10}
                    className="flex-1 bg-[#129cd3] hover:bg-[#0e87b5] disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    {phoneBusy && <Loader2 size={14} className="animate-spin" />}
                    Send OTP
                  </button>
                  <button
                    onClick={closePhoneModal}
                    disabled={phoneBusy}
                    className="flex-1 border-2 border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {phoneStep === "verify" && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  We sent a code to <span className="font-semibold text-gray-800">+91 {newPhone}</span>. Enter it below to confirm.
                </p>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">OTP Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    autoFocus
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm tracking-widest outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                  />
                </div>
                {phoneError && <p className="text-xs text-red-600">{phoneError}</p>}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handlePhoneVerifyOtp}
                    disabled={phoneBusy}
                    className="flex-1 bg-[#129cd3] hover:bg-[#0e87b5] disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    {phoneBusy && <Loader2 size={14} className="animate-spin" />}
                    Verify
                  </button>
                  <button
                    onClick={() => {
                      setPhoneStep("enter");
                      setOtpCode("");
                      setPhoneError(null);
                    }}
                    disabled={phoneBusy}
                    className="flex-1 border-2 border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
