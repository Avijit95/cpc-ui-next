# Cell Phone Crowd — Integration Checklist

Tracks what's wired up against `api-integration 2.md` (commit `b6526b2`, last updated 2026-05-06).

Two columns per row:
- **Client** — Is the call exposed via `src/lib/api/*` (typed `request<T>` wrapper)?
- **UI** — Is there at least one page/component in `src/app/**` that calls it?

> ✅ done · 🟡 partial · ❌ not built · ➖ not applicable

---

## §2 — Health

| Endpoint | Client | UI |
|---|---|---|
| `GET /health` | ✅ `healthApi.get` | ❌ no monitor page yet |

---

## §3 — Auth

| Endpoint | Client | UI |
|---|---|---|
| `POST /auth/register/email` | ✅ `authApi.registerEmail` | ❌ register form not built (login page only) |
| `POST /auth/login/email` | ✅ `authApi.loginEmail` | ✅ `/login` (email tab) · `/admin/login` |
| `POST /auth/otp/request` | ✅ `authApi.requestOtp` | ✅ `/login` (phone tab) |
| `POST /auth/otp/verify` | ✅ `authApi.verifyOtp` | ✅ `/login` (phone tab, with `NAME_REQUIRED_FOR_SIGNUP` recovery) |
| `POST /auth/google` | ✅ `authApi.google` | ✅ `/login` (Google tab, requires `NEXT_PUBLIC_GOOGLE_CLIENT_ID`) |
| `POST /auth/refresh` | ✅ `authApi.refresh` | ✅ silent refresh on mount + 401-retry interceptor (`AuthProvider`, `client.ts`) |
| `POST /auth/logout` | ✅ `authApi.logout` | ✅ `AuthProvider.logout()` used by admin sidebar + account |
| `POST /auth/logout-all` | ✅ `authApi.logoutAll` | ❌ no UI button yet (exposed via `useAuth().logoutAll`) |

---

## §4 — Me (current user)

| Endpoint | Client | UI |
|---|---|---|
| `GET /me` | ✅ `meApi.get` | ✅ called by `AuthProvider` bootstrap |
| `PATCH /me` (name / profilePicUrl) | ✅ `meApi.update` | ❌ profile editor not built |
| `PATCH /me/email` | ✅ `meApi.changeEmail` | ❌ email-change form not built |
| `POST /me/email/confirm` | ✅ `meApi.confirmEmail` | ❌ confirmation landing page not built |
| `POST /me/phone/request-otp` | ✅ `meApi.requestPhoneOtp` | ❌ phone-add flow not built |
| `POST /me/phone/verify-otp` | ✅ `meApi.verifyPhoneOtp` | ❌ phone-verify flow not built |
| `POST /me/profile-pic/presign` (+ S3 PUT helper) | ✅ `meApi.presignProfilePic` / `meApi.uploadProfilePic` | ❌ profile-pic uploader not built |

---

## §5 — Partner upgrade

| Endpoint | Client | UI |
|---|---|---|
| `POST /partners/upgrade` | ✅ `partnersApi.upgrade` | 🟡 `/dealer/register` (calls `.upgrade`; KYC presign/confirm steps not yet wired) |
| `POST /partners/kyc-docs/presign` | ✅ `partnersApi.presignKycDoc` / `uploadKycDoc` | ❌ KYC document uploader not built |
| `POST /partners/kyc-docs/confirm` | ✅ `partnersApi.confirmKycDocs` | ❌ KYC confirm step not built |

---

## §6 — Admin partner approval

| Endpoint | Client | UI |
|---|---|---|
| `GET /admin/partners` | ✅ `adminApi.listPartners` | ✅ `/admin/users` (Partners tab — status filter, pagination) |
| `GET /admin/partners/:id` | ✅ `adminApi.getPartner` | 🟡 detail loaded inline (no dedicated detail page yet) |
| `POST /admin/partners/:id/approve` | ✅ `adminApi.approvePartner` | ✅ row action in `/admin/users` |
| `POST /admin/partners/:id/reject` | ✅ `adminApi.rejectPartner` | ✅ row action with reason input |

---

## §7.2 — Public Catalog

| Endpoint | Client | UI |
|---|---|---|
| `GET /categories` | ✅ `catalogApi.getCategories` | ❌ storefront still uses static `data/products` |
| `GET /products` | ✅ `catalogApi.listProducts` | ❌ storefront still static |
| `GET /products/:slug` | ✅ `catalogApi.getProduct` | ❌ PDP still static |

---

## §7.3 — Admin Categories

| Endpoint | Client | UI |
|---|---|---|
| `GET /admin/categories` | ✅ `adminApi.listCategories` | ✅ `/admin/categories` (search, summary tiles) |
| `GET /admin/categories/:id` | ✅ `adminApi.getCategory` | ✅ `/admin/categories/[id]/edit` (load before render) |
| `POST /admin/categories` | ✅ `adminApi.createCategory` | ✅ `/admin/categories/add` |
| `PATCH /admin/categories/:id` | ✅ `adminApi.updateCategory` | ✅ `/admin/categories/[id]/edit` (incl. `parentId: null` to detach) |
| `DELETE /admin/categories/:id` | ✅ `adminApi.deleteCategory` | ✅ confirm modal in listing (`HAS_PRODUCTS` / `HAS_CHILDREN` errors translated) |

Error codes covered in UI: `CATEGORY_SLUG_TAKEN`, `PARENT_NOT_FOUND`, `CATEGORY_CYCLE`, `CATEGORY_HAS_PRODUCTS`, `CATEGORY_HAS_CHILDREN`.

---

## §7.4 — Admin Products

| Endpoint | Client | UI |
|---|---|---|
| `GET /admin/products` | ✅ `adminApi.listProducts` | ✅ `/admin/products` (debounced search, status + category filters, pagination, variant count) |
| `GET /admin/products/:id` | ✅ `adminApi.getProduct` | ✅ `/admin/products/[id]/edit` (load before render) |
| `POST /admin/products` | ✅ `adminApi.createProduct` | ✅ `/admin/products/add` (Save draft / Publish — full body match per md spec) |
| `PATCH /admin/products/:id` | ✅ `adminApi.updateProduct` | ✅ `/admin/products/[id]/edit` (shared `ProductForm`) |
| `POST /admin/products/:id/archive` | ✅ `adminApi.archiveProduct` | ✅ archive modal in listing |

Error codes covered in UI: `CATEGORY_NOT_FOUND`, `PRODUCT_SLUG_TAKEN`, `HSN_REQUIRED_FOR_ACTIVE`.

Body fields wired in `/admin/products/add` per §7.4:

| Field | Status | Notes |
|---|---|---|
| `name` *(required)* | ✅ | text input |
| `slug` *(optional)* | ✅ | left blank ⇒ auto-generated server-side |
| `categoryId` *(required)* | ✅ | dropdown loaded live from `adminApi.listCategories()`, parent path shown |
| `description` (0..10,000) | ✅ | textarea with live `{n}/10,000` counter |
| `specs` *(optional, object)* | ✅ | JSON textarea, validated to be a plain object |
| `basePrice` (rupees, ≥0, 2dp) | ✅ | `<input type="number" step="0.01" min="0">` |
| `stock` (≥0, default 0) | ✅ | integer input |
| `status` (`DRAFT` / `ACTIVE`) | ✅ | **Save draft** ⇒ `DRAFT`, **Publish** ⇒ `ACTIVE` |
| `brand` *(optional)* | ✅ | text input |
| `hsnCode` *(req when ACTIVE)* | ✅ | defaults to `8517` for new products; client blocks Publish if blank |

---

## §7.5 — Admin Product Variants

| Endpoint | Client | UI |
|---|---|---|
| `POST /admin/products/:productId/variants` | ✅ `adminApi.createVariant` | ❌ no variant editor yet (edit page lists existing variants read-only) |
| `PATCH /admin/products/:productId/variants/:variantId` | ✅ `adminApi.updateVariant` | ❌ |
| `DELETE /admin/products/:productId/variants/:variantId` | ✅ `adminApi.deleteVariant` | ❌ |

---

## §7.6 — Admin Product Images

| Endpoint | Client | UI |
|---|---|---|
| `POST /admin/products/:productId/images/presign` | ✅ `adminApi.presignProductImage` (+ `uploadProductImage` helper) | ❌ no image uploader UI yet |
| `POST /admin/products/:productId/images/confirm` | ✅ `adminApi.confirmProductImages` | ❌ |

---

## §7.7 — Admin Bulk CSV import

| Endpoint | Client | UI |
|---|---|---|
| `POST /admin/products/import` (multipart) | ✅ `adminApi.importProducts` (FormData supported in `request()`) | ❌ no upload + poll UI yet |
| `GET /admin/products/import/:jobId` | ✅ `adminApi.getImportJob` | ❌ |

---

## Cross-cutting

| Concern | Status | Notes |
|---|---|---|
| In-memory access token + httpOnly `rt` cookie | ✅ | `AuthProvider` + `client.ts` |
| 401 → `/auth/refresh` retry-once interceptor | ✅ | `client.ts:request()` |
| Refresh-failure → `onUnauthorized` purge + redirect | ✅ | `AuthProvider.configureApiClient` callback |
| FormData multipart support in `request()` | ✅ | needed by §7.7 (CSV upload) |
| S3 direct PUT helper (`s3Put`) | ✅ | shared by profile-pic / KYC / product image flows |
| Admin route gate (`/admin/*` requires role=ADMIN) | ✅ | `AdminGuard` (skipped on `/admin/login`) |
| Standard error envelope handling | ✅ | `ApiError`, `isApiError` (`code`, `messages[]`) |
| Rate-limit awareness (429 / `Retry-After`) | 🟡 | error surfaced via `displayMessage`; no automatic backoff yet |
| CORS / `credentials: 'include'` | ✅ | hardcoded in `request()` |

---

## Top remaining gaps (ranked)

1. **Public catalog UI** — storefront still reads from `src/data/products.ts`; switch `/products`, `/products/[id]`, and the home/category sections to `catalogApi`.
2. **Admin variants editor** — add CRUD UI nested under product edit page.
3. **Admin product images** — drag-drop uploader using `presignProductImage` + `s3Put` + `confirmProductImages`.
4. **Admin CSV import** — upload widget + polling status panel using `importProducts` / `getImportJob`.
5. **Customer profile pages** — `PATCH /me`, email change + confirm, phone OTP flow, profile-pic uploader.
6. **Partner KYC document upload** in `/dealer/register` (presign + confirm wiring after `upgrade`).
7. **Logout-all** button somewhere user-facing (security panel).
