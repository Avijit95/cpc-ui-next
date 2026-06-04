import { request } from "../client";
import type {
  LoginResponse,
  OtpRequestResponse,
  PasswordForgotResponse,
  PasswordResetResponse,
  RefreshResponse,
} from "../types";

export type EmailRegisterBody = {
  name: string;
  email: string;
  password: string;
  // The phone is verified by OTP as part of registration — the account is
  // only created once `code` checks out.
  phone: string;
  code: string;
};

export type EmailLoginBody = {
  email: string;
  password: string;
};

export type OtpRequestBody = { phone: string };
export type OtpVerifyBody = { phone: string; code: string; name?: string };

export type PasswordForgotBody = { email: string };
export type PasswordResetBody = { token: string; newPassword: string };

export const authApi = {
  registerEmail(body: EmailRegisterBody) {
    return request<LoginResponse>("/auth/register/email", {
      method: "POST",
      body,
      anonymous: true,
    });
  },
  loginEmail(body: EmailLoginBody) {
    return request<LoginResponse>("/auth/login/email", {
      method: "POST",
      body,
      anonymous: true,
    });
  },
  requestOtp(body: OtpRequestBody) {
    return request<OtpRequestResponse>("/auth/otp/request", {
      method: "POST",
      body,
      anonymous: true,
    });
  },
  verifyOtp(body: OtpVerifyBody) {
    return request<LoginResponse>("/auth/otp/verify", {
      method: "POST",
      body,
      anonymous: true,
    });
  },
  // phone + code are sent only when creating a brand-new account (a new Google
  // user must verify a phone by OTP first). Existing users omit them.
  google(idToken: string, phone?: string, code?: string) {
    return request<LoginResponse>("/auth/google", {
      method: "POST",
      body: { idToken, ...(phone && code ? { phone, code } : {}) },
      anonymous: true,
    });
  },
  refresh() {
    return request<RefreshResponse>("/auth/refresh", {
      method: "POST",
      anonymous: true,
      skipAuthRefresh: true,
    });
  },
  logout() {
    return request<void>("/auth/logout", { method: "POST" });
  },
  logoutAll() {
    return request<void>("/auth/logout-all", { method: "POST" });
  },
  passwordForgot(body: PasswordForgotBody) {
    return request<PasswordForgotResponse>("/auth/password/forgot", {
      method: "POST",
      body,
      anonymous: true,
    });
  },
  passwordReset(body: PasswordResetBody) {
    return request<PasswordResetResponse>("/auth/password/reset", {
      method: "POST",
      body,
      anonymous: true,
    });
  },
};
