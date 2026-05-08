import { request, s3Put } from "../client";
import type {
  KycDocType,
  KycPresignResponse,
  PublicUser,
} from "../types";

export type PartnerUpgradeBody = {
  companyName: string;
  gstNumber: string;
};

export type KycPresignBody = {
  docType: KycDocType;
  contentType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  contentLength: number;
};

export type KycConfirmDoc = {
  docType: KycDocType;
  objectKey: string;
};

export type KycConfirmResponse = {
  documents: Array<{ id: string; docType: KycDocType; objectKey: string }>;
};

export const partnersApi = {
  upgrade(body: PartnerUpgradeBody) {
    return request<PublicUser>("/partners/upgrade", {
      method: "POST",
      body,
    });
  },
  presignKycDoc(body: KycPresignBody) {
    return request<KycPresignResponse>("/partners/kyc-docs/presign", {
      method: "POST",
      body,
    });
  },
  confirmKycDocs(documents: KycConfirmDoc[]) {
    return request<KycConfirmResponse>("/partners/kyc-docs/confirm", {
      method: "POST",
      body: { documents },
    });
  },
  // presign + S3 PUT in one shot, returning the objectKey ready for confirmKycDocs.
  async uploadKycDoc(docType: KycDocType, file: File): Promise<KycConfirmDoc> {
    const presigned = await this.presignKycDoc({
      docType,
      contentType: file.type as KycPresignBody["contentType"],
      contentLength: file.size,
    });
    await s3Put(presigned.uploadUrl, file);
    return { docType, objectKey: presigned.objectKey };
  },
};
