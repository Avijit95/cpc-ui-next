import { request, s3Put } from "../client";
import type {
  EmailChangeResponse,
  OtpRequestResponse,
  ProfilePicPresignResponse,
  PublicUser,
} from "../types";

export type UpdateMeBody = {
  name?: string;
  profilePicUrl?: string;
};

export type ProfilePicContentType = "image/jpeg" | "image/png" | "image/webp";

export const meApi = {
  get() {
    return request<PublicUser>("/me");
  },
  update(body: UpdateMeBody) {
    return request<PublicUser>("/me", { method: "PATCH", body });
  },
  changeEmail(email: string) {
    return request<EmailChangeResponse>("/me/email", {
      method: "PATCH",
      body: { email },
    });
  },
  confirmEmail(token: string) {
    return request<PublicUser>("/me/email/confirm", {
      method: "POST",
      body: { token },
    });
  },
  requestPhoneOtp(phone: string) {
    return request<OtpRequestResponse>("/me/phone/request-otp", {
      method: "POST",
      body: { phone },
    });
  },
  verifyPhoneOtp(phone: string, code: string) {
    return request<PublicUser>("/me/phone/verify-otp", {
      method: "POST",
      body: { phone, code },
    });
  },
  presignProfilePic(contentType: ProfilePicContentType, contentLength: number) {
    return request<ProfilePicPresignResponse>("/me/profile-pic/presign", {
      method: "POST",
      body: { contentType, contentLength },
    });
  },
  // Convenience: presign → S3 PUT → PATCH /me. Returns updated user.
  async uploadProfilePic(file: File): Promise<PublicUser> {
    const ct = file.type as ProfilePicContentType;
    const presigned = await this.presignProfilePic(ct, file.size);
    await s3Put(presigned.uploadUrl, file);
    return this.update({ profilePicUrl: presigned.publicUrl });
  },
};
