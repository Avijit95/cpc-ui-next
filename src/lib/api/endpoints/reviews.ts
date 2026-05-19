import { request, s3Put } from "../client";
import type {
  Review,
  ReviewDeleteResponse,
  ReviewListResponse,
  ReviewPhotoPresignResponse,
} from "../types";

export type ReviewPhotoContentType =
  | "image/jpeg"
  | "image/png"
  | "image/webp";

export const REVIEW_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export type ListProductReviewsQuery = {
  limit?: number;
  offset?: number;
};

export type CreateReviewBody = {
  productId: string;
  rating: number;
  text?: string;
  photos?: string[];
};

export type UpdateReviewBody = {
  rating?: number;
  text?: string;
  photos?: string[];
};

export type ReviewPhotoPresignBody = {
  contentType: string;
  contentLength: number;
};

export const reviewsApi = {
  listForProduct(slug: string, query: ListProductReviewsQuery = {}) {
    return request<ReviewListResponse>(
      `/products/${encodeURIComponent(slug)}/reviews`,
      { query, anonymous: true },
    );
  },
  create(body: CreateReviewBody) {
    return request<Review>("/reviews", { method: "POST", body });
  },
  update(id: string, body: UpdateReviewBody) {
    return request<Review>(`/reviews/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body,
    });
  },
  remove(id: string) {
    return request<ReviewDeleteResponse>(
      `/reviews/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },
  presignPhoto(body: ReviewPhotoPresignBody) {
    return request<ReviewPhotoPresignResponse>("/reviews/photos/presign", {
      method: "POST",
      body,
    });
  },
  // Convenience: presign + S3 PUT, returns the objectKey to attach.
  async uploadPhoto(file: File): Promise<{ objectKey: string }> {
    const presigned = await reviewsApi.presignPhoto({
      contentType: file.type as ReviewPhotoContentType,
      contentLength: file.size,
    });
    await s3Put(presigned.uploadUrl, file);
    return { objectKey: presigned.objectKey };
  },
};
