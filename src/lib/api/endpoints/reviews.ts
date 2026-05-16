import { request } from "../client";
import type {
  Review,
  ReviewDeleteResponse,
  ReviewListResponse,
  ReviewPhotoPresignResponse,
} from "../types";

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
};
