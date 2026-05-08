import { request } from "../client";
import type {
  LoginResponse,
  OtpRequestResponse,
  RefreshResponse,
} from "../types";

export type EmailRegisterBody = {
  name: string;
  email: string;
  password: string;
};

export type EmailLoginBody = {
  email: string;
  password: string;
};

export type OtpRequestBody = { phone: string };
export type OtpVerifyBody = { phone: string; code: string; name?: string };

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
  google(idToken: string) {
    return request<LoginResponse>("/auth/google", {
      method: "POST",
      body: { idToken },
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
};
