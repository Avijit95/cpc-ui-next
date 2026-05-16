# Cell Phone Crowd — API Integration Guide

**Audience:** Frontend / mobile developer integrating against the Cell Phone Crowd backend.
**Status:** Sprints 1, 1.5, 2 (Catalog), 2.5 (pricing rollback), **3 (Cart, Wishlist, Coupons)** shipped. Auth, Users, Partners + Admin, full Catalog, role-aware coupons, cart with manual stacking, wishlist with atomic move-to-cart, and admin coupon CRUD are all live in production.
**Base URL (prod):** `https://api.cpc24.co.in`
**Base URL (local dev):** `http://localhost:4000`
**Last updated:** 2026-05-08

> **For your Claude:** This doc is the single source of truth for what's currently shipped. Endpoints not listed here don't exist yet.

---

## 1. Conventions

### 1.1 Auth model

- **Access token:** short-lived JWT (15 min). Send as `Authorization: Bearer <token>`.
- **Refresh token:** long-lived JWT (30 days). Lives in an `httpOnly`, `secure`, `SameSite=Lax` cookie called `rt` with `Path=/auth`. The browser sends it automatically on requests to `/auth/*`. **Never readable from JS.**
- **Mobile-friendly fallback:** the refresh endpoint also accepts a Bearer-style refresh token in the `Authorization` header, in case you can't use cookies.
- **Token rotation:** every successful `POST /auth/refresh` issues a new access token AND rotates the refresh cookie. The old refresh token is immediately revoked. **Reusing an old refresh token after rotation is treated as token theft and revokes ALL sessions for that user.** The frontend should never persist refresh tokens — let the cookie do its job.

### 1.2 Standard response shapes

Every success returns JSON with HTTP 200 (or 204 on logout).

Every error returns JSON with this shape:

```json
{
  "statusCode": 409,
  "error": "CONFLICT",
  "code": "EMAIL_ALREADY_TAKEN",
  "message": "This email is already registered to another account.",
  "path": "/me/email",
  "timestamp": "2026-05-04T10:03:08.466Z"
}
```

| Field | Notes |
|---|---|
| `statusCode` | HTTP status code |
| `error` | Stringified status name |
| `code` | **Machine-readable error code (when present)** — use this to render specific UI, not the `message` |
| `message` | Human string OR array of strings (DTO validation returns an array — show them as a list) |
| `path` + `timestamp` | For debugging / support tickets |

**For DTO validation failures**, `code` is absent and `message` is an array:

```json
{
  "statusCode": 400,
  "error": "BAD_REQUEST",
  "message": [
    "email must be an email",
    "password must be at least 8 characters and include 1 uppercase letter and 1 digit"
  ],
  "path": "/auth/register/email",
  "timestamp": "..."
}
```

### 1.3 PublicUser shape

The "current user" object returned by every auth endpoint:

```ts
type PublicUser = {
  id: string;                                         // cuid
  name: string;
  email: string | null;
  phone: string | null;                               // E.164, e.g. "+919876543210"
  role: 'CUSTOMER' | 'PARTNER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  kycStatus: 'NONE' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  companyName: string | null;                         // partner-only
  gstNumber: string | null;                           // partner-only
  profilePicUrl: string | null;
  phoneRequired: boolean;                             // true when phone === null — gate checkout etc. on this
};
```

**`role` does NOT change to `PARTNER` until admin approval.** A user who has submitted `/partners/upgrade` will have `role: 'CUSTOMER'`, `kycStatus: 'PENDING'`, and partner fields populated. Only after `/admin/partners/:id/approve` does `role` flip to `PARTNER`.

### 1.4 Login response shape

Every login endpoint (OTP verify, Google, email register/login) returns:

```ts
type LoginResponse = {
  user: PublicUser;
  accessToken: string;        // 15-min JWT — store in memory or sessionStorage, NOT localStorage
  expiresIn: number;          // 900 (seconds)
};
// Plus a Set-Cookie: rt=...; Path=/auth; HttpOnly; SameSite=Lax; Secure (prod)
```

### 1.5 Rate limits

| Endpoint | Limit | Source |
|---|---|---|
| `POST /auth/otp/request` | **5 / minute / IP** + 3 / 10min / phone | IP throttler + per-phone Redis counter |
| `POST /auth/login/email` | **5 / minute / IP** + 5 fails / 10min / email → 15min lockout | IP throttler + per-email lockout |
| `POST /auth/refresh` | **5 / minute / IP** | IP throttler |
| Everything else | **60 / minute / IP** | global default |

When throttled you get HTTP **429** with `error: "TOO_MANY_REQUESTS"`. Backoff and retry after the `Retry-After` header window.

### 1.6 CORS

Production whitelist (set via Nginx / app config):
- `https://cpc24.co.in`
- Local dev: `http://localhost:3000`

If you need additional origins (preview deployments, etc.), ask backend to add them.

### 1.7 Money

All currency fields are **rupees as JSON numbers** with up to 2 decimal places (stored as `Decimal(12,2)` server-side). Format on the frontend as `value.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })` — no `/100` divide.

This applies to every catalog price field: `basePrice`, `finalPrice`, `priceOverride`, `lowestVariantPrice`, and the `priceMin`/`priceMax` query params on `/products`.

---

## 2. Health

### `GET /health`

**Auth:** none.
**Use:** uptime monitor, deployment smoke test.

**200 OK:**
```json
{ "status": "ok", "db": "up", "redis": "up" }
```

**503 Service Unavailable** if DB or Redis is down (`db` or `redis` will be `"down"`).

---

## 3. Auth

All `/auth/*` paths are public unless noted.

### `POST /auth/register/email`

Create a new email/password account. Returns `LoginResponse`.

**Body:**
```ts
{ name: string;        // 1..100 chars
  email: string;       // RFC-valid
  password: string;    // ≥8 chars, ≥1 uppercase, ≥1 digit
}
```

**Errors:**
- `400` — DTO validation
- `409` — email already taken (no `code`, just `message: "Email already registered"`)
- `429` — IP throttle

---

### `POST /auth/login/email`

**Body:** `{ email: string; password: string }`

**Errors:**
- `401` — `Invalid credentials` (intentionally generic — does NOT distinguish "no such user" from "wrong password")
- `429` — Either IP throttle OR account lockout (`Account temporarily locked. Try again later.`). After 5 failed attempts in 10 min the email is locked for 15 min.

---

### `POST /auth/otp/request`

**Body:** `{ phone: string }` (E.164: `+91...`)

**200 OK:**
```json
{ "requestId": "cm...", "expiresIn": 300 }
```

OTP is delivered via SMS to the given number. **One OTP is valid for 5 min, single-use.** Max 3 OTPs per phone per 10 min, max 5 verify attempts per OTP.

**Errors:** `400` bad phone, `429` rate-limited.

---

### `POST /auth/otp/verify`

Logs the user in if the phone exists; signs them up if not.

**Body:**
```ts
{ phone: string;        // E.164
  code: string;         // 6 digits
  name?: string;        // REQUIRED if phone is new
}
```

**Returns** `LoginResponse`.

**Errors:**
- `400` `NAME_REQUIRED_FOR_SIGNUP` — phone is unknown to us; pass `name` to sign up. **The OTP is NOT consumed on this error** — show a name input and POST again with the same code.
- `401` `Invalid OTP` — wrong code (counts toward the 5-attempt cap)
- `401` `No active OTP for this phone` — no OTP in flight, expired, or already consumed
- `429` `Too many verification attempts` — 5+ wrong attempts; OTP is now consumed, request a new one

---

### `POST /auth/google`

**Body:** `{ idToken: string }` (≥10 chars; the Google ID token from your client-side Google Sign-In flow)

**Returns** `LoginResponse`. Behavior:
- If a user exists with that `googleId` → log in
- Else if a user exists with the email (from the verified ID token) → link the Google ID and log in
- Else create a new CUSTOMER

**The returned user has `phoneRequired: true`** unless they had previously linked a phone. Use the phone-add flow before letting them check out.

**Errors:** `401` invalid/expired ID token.

---

### `POST /auth/refresh`

Rotates tokens. **No body.** Reads the refresh token from either the `rt` cookie (preferred) or `Authorization: Bearer ...` header.

**200 OK:** `{ accessToken: string; expiresIn: 900 }` — and a new `Set-Cookie: rt=...`.

**Errors:** `401` if cookie missing, expired, or already rotated (theft detection — if you see this, the user must log in again from scratch).

**Frontend pattern:**
```ts
// Pseudocode — wrap all fetches with a 401-retry-once-via-refresh interceptor
async function authedFetch(url, init) {
  let res = await fetch(url, { ...init, credentials: 'include' });
  if (res.status === 401) {
    const refresh = await fetch('/auth/refresh', { method: 'POST', credentials: 'include' });
    if (refresh.ok) {
      const { accessToken } = await refresh.json();
      saveAccessTokenInMemory(accessToken);
      res = await fetch(url, { ...init, credentials: 'include',
        headers: { ...init.headers, Authorization: `Bearer ${accessToken}` } });
    } else {
      redirectToLogin();
    }
  }
  return res;
}
```

---

### `POST /auth/logout`

**Auth:** Bearer access token required.

**No body.** Revokes current refresh + denylists current access JWT. Returns **204 No Content** + clears the `rt` cookie.

---

### `POST /auth/logout-all`

**Auth:** Bearer required.

Revokes ALL refresh tokens for this user (across all devices). Returns **204**.

---

## 4. Me — current user

All `/me/*` endpoints require `Authorization: Bearer <accessToken>`.

### `GET /me`

Returns `PublicUser`. Always reads fresh from DB (so newly committed fields like `kycStatus` show up immediately).

---

### `PATCH /me`

Update `name` and/or `profilePicUrl`. **At least one field must be provided** (empty body → 400).

**Body:**
```ts
{ name?: string;             // 1..100
  profilePicUrl?: string;    // valid URL with protocol; ≤2048 chars
}
```

Returns updated `PublicUser`.

**Errors:**
- `400` `NO_UPDATE_FIELDS` — empty body
- `400` — DTO validation (e.g. URL malformed)

---

### `PATCH /me/email`

Initiate email change. Sends a confirmation token to the **new** email via Resend. The change does NOT take effect until `/me/email/confirm` is called with that token.

**Body:** `{ email: string }`

**200 OK:** `{ message: "Confirmation email sent.", expiresIn: 1800 }` (token valid 30 min)

**Errors:**
- `409` `EMAIL_UNCHANGED` — same as current
- `409` `EMAIL_ALREADY_TAKEN` — owned by another user

---

### `POST /me/email/confirm`

**Body:** `{ token: string }` (64-char hex token from the confirmation email)

Returns updated `PublicUser` with the new email. Token is single-use.

**Errors:**
- `400` `EMAIL_CONFIRM_TOKEN_INVALID` — bad/expired/already-used token
- `403` `EMAIL_CONFIRM_TOKEN_MISMATCH` — token belongs to a different user (i.e. wrong access token used)
- `409` `EMAIL_ALREADY_TAKEN` — race: someone else claimed the email between request and confirm

---

### `POST /me/phone/request-otp`

Add or change the user's phone (replaces both add-phone-after-google and PATCH /me/phone). Sends an OTP to the **new** phone.

**Body:** `{ phone: string }` (E.164)

**200 OK:** `{ requestId: string; expiresIn: 300 }`

**Errors:**
- `409` `PHONE_ALREADY_TAKEN` — another user owns this phone
- `429` — rate limit

---

### `POST /me/phone/verify-otp`

**Body:** `{ phone: string; code: string }`

Returns updated `PublicUser` (with `phone` set, `phoneRequired: false`).

**Errors:** same OTP errors as `/auth/otp/verify` plus `409 PHONE_ALREADY_TAKEN` (race).

---

### `POST /me/profile-pic/presign`

Get a presigned S3 PUT URL for uploading the user's profile picture. **You upload directly to S3** (browser → S3, not via API), then `PATCH /me` with the returned `publicUrl`.

**Body:**
```ts
{ contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  contentLength: number;       // bytes; max 5_242_880 (5 MB)
}
```

**200 OK:**
```json
{
  "uploadUrl": "https://cpn-uploads.s3.ap-south-1.amazonaws.com/pfp/cm.../uuid.jpg?X-Amz-...",
  "objectKey": "pfp/cm.../uuid.jpg",
  "publicUrl": "https://cpn-uploads.s3.ap-south-1.amazonaws.com/pfp/cm.../uuid.jpg",
  "expiresIn": 300
}
```

**Frontend flow:**
```ts
// 1) Ask API for a presigned URL
const { uploadUrl, publicUrl } = await api.post('/me/profile-pic/presign',
  { contentType: file.type, contentLength: file.size });

// 2) PUT the file directly to S3 (NOT through our API)
await fetch(uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': file.type },
  body: file,
});

// 3) Tell our API the new URL
await api.patch('/me', { profilePicUrl: publicUrl });
```

The `uploadUrl` expires in 5 min. The S3 bucket has CORS configured for `https://cpc24.co.in` and `http://localhost:3000`.

---

## 5. Partner upgrade flow

Customer-facing endpoints to apply for partner status.

### `POST /partners/upgrade`

**Auth:** Bearer (any role; intended for CUSTOMERs).

Submit company info to enter the partner approval queue. Sets `kycStatus = PENDING`. **Role stays CUSTOMER until admin approves.**

**Body:**
```ts
{ companyName: string;       // 2..200 chars
  gstNumber: string;         // 15-char GSTIN format, e.g. "29ABCDE1234F1Z5"
}
```

Returns updated `PublicUser` (with `kycStatus: 'PENDING'`, `companyName` + `gstNumber` set).

**Errors:**
- `400` `PHONE_REQUIRED_FOR_PARTNER` — user must have verified a phone first (use `/me/phone/request-otp` flow)
- `400` — bad GSTIN format
- `409` `PARTNER_UPGRADE_NOT_ALLOWED` — already in PENDING/VERIFIED state. Allowed transitions: NONE → PENDING, REJECTED → PENDING (resubmit). REJECTED users get their `kycRejectedReason` cleared on resubmit.
- `409` `GST_ALREADY_REGISTERED` — GSTIN unique across the whole system

---

### `POST /partners/kyc-docs/presign`

**Auth:** Bearer.

Get a presigned S3 URL for uploading a KYC document (GST cert, business proof, etc.). **Allowed only when `kycStatus` ∈ {NONE, PENDING, REJECTED}.**

**Body:**
```ts
{ docType: 'GST_CERT' | 'BUSINESS_PROOF' | 'OTHER';
  contentType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';
  contentLength: number;                   // bytes; max 10_485_760 (10 MB)
}
```

**200 OK:** `{ uploadUrl, objectKey, expiresIn: 300 }` — same upload flow as profile pic.

**Errors:** `409` `KYC_PRESIGN_NOT_ALLOWED` if `kycStatus` is VERIFIED.

---

### `POST /partners/kyc-docs/confirm`

**Auth:** Bearer. **Requires `kycStatus = PENDING`.**

After uploading docs to S3, register them in the database so admin can review.

**Body:**
```ts
{ documents: Array<{
    docType: 'GST_CERT' | 'BUSINESS_PROOF' | 'OTHER';
    objectKey: string;     // 1..512 chars; from the presign response
  }>;     // 1..10 items
}
```

**200 OK:**
```json
{ "documents": [{ "id": "cm...", "docType": "GST_CERT", "objectKey": "kyc/.../uuid.pdf" }] }
```

**Errors:** `409` `KYC_NOT_PENDING` if status isn't PENDING (i.e. user must call `/partners/upgrade` first).

---

## 6. Admin — partner approval

All `/admin/*` endpoints require `Authorization: Bearer <accessToken>` AND the user must have `role: 'ADMIN'`. Non-admin → **403**.

### `GET /admin/partners`

List partner applications.

**Query:**
```ts
{ status?: 'NONE' | 'PENDING' | 'VERIFIED' | 'REJECTED';   // default 'PENDING'
  limit?: number;                                          // 1..100, default 50
  offset?: number;                                         // ≥0, default 0
}
```

**200 OK:**
```ts
{ items: Array<{
    id, name, email, phone, role, status, kycStatus,
    companyName, gstNumber, profilePicUrl,
    createdAt, updatedAt, lastLoginAt,
    kycRejectedReason
  }>;
  total: number;
  limit: number;
  offset: number;
}
```

(Note: `kycRejectedReason` IS returned here for admin context, even though it's stripped from `PublicUser`.)

---

### `GET /admin/partners/:id`

Single partner detail, including uploaded documents.

**200 OK:** same shape as items above, plus:
```ts
{ ...,
  kycDocuments: Array<{
    id: string;
    docType: 'GST_CERT' | 'BUSINESS_PROOF' | 'OTHER';
    objectKey: string;     // S3 object key — admin needs to call a (future) signed-GET endpoint to view; not yet built
    uploadedAt: string;    // ISO
  }>;
}
```

**Errors:** `404` if user doesn't exist OR has `kycStatus = NONE` (i.e. no application).

> **Heads up:** signed-GET URLs for KYC documents aren't exposed yet. Admin currently sees only the `objectKey`. If you need to render the doc in the admin UI now, ping backend to expose `GET /admin/kyc-docs/:id/url`.

---

### `POST /admin/partners/:id/approve`

Approve the application. **No body.**

Sets `role = PARTNER`, `kycStatus = VERIFIED`, clears `kycRejectedReason`.

**200 OK:** updated partner record (same shape as `GET /admin/partners/:id` minus `kycDocuments`).

**Errors:** `409` `PARTNER_NOT_PENDING` if not currently PENDING. `404` if user missing.

---

### `POST /admin/partners/:id/reject`

Reject the application.

**Body:** `{ reason: string }` (3..500 chars)

Sets `kycStatus = REJECTED`, stores `kycRejectedReason`. Role stays CUSTOMER. The user can resubmit via `POST /partners/upgrade`.

**Errors:** same as approve.

---

## 7. Catalog

Live as of Sprint 2. Three public endpoints (anonymous-friendly), plus a full admin surface gated by `Authorization: Bearer <ADMIN access token>`.

### 7.1 Conventions specific to catalog

- **Money** — see §1.7. All prices below are rupees as JSON numbers (Decimal(12,2) server-side), up to 2 decimal places.
- **Image URLs** — every `*Url` field is a full `https://...` URL or `null`. The backend resolves it from the underlying S3 object key via `S3_PUBLIC_BASE_URL`. Don't try to construct image URLs from `objectKey` yourself.
- **Status filter** — public endpoints only ever return products with `status === "ACTIVE"`. `DRAFT` and `ARCHIVED` are admin-only.
- **Slug uniqueness** — `Category.slug` and `Product.slug` are globally unique (kebab-case). `ProductVariant.sku` is unique **per product**, not globally.
- **HSN code** — every ACTIVE product has a non-empty HSN code (8517 for phones today). Used for GST in §7.2's pricing payload and again in Sprint 4 invoices.
- **Pricing model** — single price for **all roles** (anonymous, customer, partner, admin). Role-aware discounts come exclusively from the coupon engine landing in Sprint 3 — there is no separate wholesale tier in the schema or API.

### 7.2 Public endpoints

#### `GET /categories`

**Auth:** none. **Cache:** Redis-cached for 5 min on the server, invalidated immediately on any admin category write.

**200 OK:**
```ts
type CategoryNode = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  sortOrder: number;
  children: CategoryNode[];
};
// Response is CategoryNode[] (root nodes; each node carries its full subtree)
```

The full tree comes back in one call. Render the nav from this directly — no further pagination/lookup needed.

---

#### `GET /products`

**Auth:** none. Response shape is identical for everyone — same price for all roles.

**Query params** (all optional):

| Param | Type | Notes |
|---|---|---|
| `category` | `string` | Category id **or** slug — both work |
| `brand` | `string` | Exact match (case-sensitive) |
| `priceMin` / `priceMax` | `number (rupees)` | Range over `basePrice` |
| `search` | `string` | Postgres tsvector full-text search over `name + brand + description`, weighted A>B>C. Results re-ordered by `ts_rank` |
| `sort` | `'price-asc' \| 'price-desc' \| 'newest' \| 'popular'` | Default `newest`. **`popular` currently falls back to `newest`** — real popularity sort lands in Sprint 5; the response includes a `sortNote` flag when this fallback is in effect |
| `limit` | `int` | 1..100, default 24 |
| `offset` | `int` | ≥0, default 0 |

When `search` is set, `sort` is ignored and results are ordered by relevance.

**200 OK:**
```ts
type ListCard = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  basePrice: number;                 // rupees
  finalPrice: number;                // rupees — equals basePrice today; coupons land in Sprint 3
  lowestVariantPrice: number | null; // cheapest variant priceOverride if any, else null
  primaryImageUrl: string | null;    // image with the smallest sortOrder
  badges: string[];                  // empty for now; reserved for Sprint 5+
};

type ListResponse = {
  items: ListCard[];
  total: number;                     // total matching, not just this page
  limit: number;
  offset: number;
  sortApplied: 'price-asc' | 'price-desc' | 'newest' | 'popular';
  sortNote?: string;                 // present when popular fell back to newest
  facets: {
    brands: { name: string; count: number }[];   // sorted by count desc
    priceBuckets: { label: string; min: number; max: number | null; count: number }[];
  };
};
```

The 5 fixed `priceBuckets` (rupees): `under-1000` (0..₹1k), `1000-5000`, `5000-15000`, `15000-50000`, `over-50000` (max=null means open-ended). Use them to populate price filter sliders.

Facets reflect the **currently filtered** set, so they update as the user narrows down.

---

#### `GET /products/:slug`

**Auth:** none. Response shape is identical for every role.

Returns 404 if the product doesn't exist OR is in `DRAFT` / `ARCHIVED`.

**200 OK:**
```ts
type GstInfo = { hsnCode: string; ratePercent: number };

type CatalogPricingPreview = {
  basePrice: number;                    // rupees
  finalPrice: number;                   // rupees — equals basePrice today; coupons land in Sprint 3
  gst: GstInfo;
};

type ProductImage = { objectKey: string; url: string | null; sortOrder: number };
type VariantImage = { objectKey: string; url: string | null };

type Variant = {
  id: string;
  sku: string;
  attributes: Record<string, unknown>;  // e.g. { color: 'red', storage: '256GB' }
  stock: number;
  pricing: CatalogPricingPreview;       // variant-aware: priceOverride applied when present
  images: VariantImage[];
};

type Crumb = { id: string; name: string; slug: string };

type ProductDetail = {
  id: string;
  slug: string;
  name: string;
  description: string;
  brand: string | null;
  specs: Record<string, unknown>;       // free-form spec dict
  images: ProductImage[];               // sorted by sortOrder asc
  breadcrumbs: Crumb[];                 // root → ... → leaf, including the product's own category as the last entry
  pricing: CatalogPricingPreview;
  variants: Variant[];                  // [] if product has no variants
  stock: number;                        // product-level stock; variants override per-row
};
```

> **Pricing rule:** if a variant has `priceOverride`, the variant's `pricing` uses it; otherwise it falls back to the product's `basePrice`. The same price applies to every role — partner-specific or wholesale discounts (when they exist) flow through the Sprint-3 coupon engine, not a separate price tier.

The `gst.ratePercent` is sourced from a static HSN→rate map for now (`8517 → 18`, default 18% for unknown HSNs). Sprint 4 will wire a proper GST table.

### 7.3 Admin — Categories

All `/admin/categories/*` endpoints require `Roles(ADMIN)`. Non-admin tokens get 403.

#### `POST /admin/categories`
**Body:**
```ts
{ name: string;
  slug?: string;            // kebab-case; auto-generated from name if omitted
  parentId?: string;        // null/omitted = root category
  sortOrder?: number;       // default 0
  imageObjectKey?: string;  // S3 key — upload separately (no presign endpoint for category images yet; reuse the product flow's S3 bucket and pass the key here)
}
```
**201 Created:** the new `Category` row.
**Errors:** `409 CATEGORY_SLUG_TAKEN`, `400 PARENT_NOT_FOUND`.

#### `PATCH /admin/categories/:id`
Partial update. Same fields as create, all optional. `parentId: null` detaches a child to root.
**200 OK:** updated row.
**Errors:** `404` if id missing, `409 CATEGORY_SLUG_TAKEN`, `400 PARENT_NOT_FOUND`, `400 CATEGORY_CYCLE` (would create a parent loop, including self-parent).

#### `DELETE /admin/categories/:id`
**200 OK:** `{ id: string }`.
**Errors:** `404`, `409 CATEGORY_HAS_PRODUCTS`, `409 CATEGORY_HAS_CHILDREN`. Move/reassign products + child categories first.

#### `GET /admin/categories`
Flat list of every category with `_count.products` included for inline counts. No pagination — there are never more than a few hundred categories.

#### `GET /admin/categories/:id`
Single category with `_count.{products, children}`.

### 7.4 Admin — Products

#### `POST /admin/products`
**Body:**
```ts
{ name: string;
  slug?: string;                   // auto from name
  categoryId: string;
  description: string;             // 0..10_000 chars
  specs?: Record<string, unknown>; // free-form JSON object
  basePrice: number;               // rupees, ≥0, up to 2 decimal places
  stock?: number;                  // ≥0, default 0
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';   // default DRAFT
  brand?: string;
  hsnCode?: string;                // required non-empty when status=ACTIVE
}
```

You can create a product as `DRAFT` with an empty `hsnCode`, but flipping it to `ACTIVE` requires a non-empty `hsnCode` (same rule on PATCH).

**201 Created:** the new `Product`.
**Errors:** `400 CATEGORY_NOT_FOUND`, `409 PRODUCT_SLUG_TAKEN`, `400 HSN_REQUIRED_FOR_ACTIVE`.

#### `PATCH /admin/products/:id`
Partial update. **HSN-required-for-ACTIVE applies to the next state**: clearing `hsnCode` while the product is/becoming ACTIVE → `400 HSN_REQUIRED_FOR_ACTIVE`. To archive, prefer `POST /admin/products/:id/archive` (below).

#### `POST /admin/products/:id/archive`
Soft-delete: sets `status = ARCHIVED`. Product vanishes from public lists/detail but stays in DB so existing orders + URLs continue to work.

#### `GET /admin/products`
**Query:** `status`, `categoryId`, `brand`, `search` (case-insensitive `name` contains — admin uses LIKE, NOT tsvector), `limit` (default 50, max 200), `offset`.
**200 OK:** `{ items, total, limit, offset }`. Each item includes `_count.variants`.

#### `GET /admin/products/:id`
Full product including all `variants` and a `category` breadcrumb. Use this for the admin product editor; do **not** call `/products/:slug` from the admin UI — that one filters out DRAFT/ARCHIVED.

### 7.5 Admin — Product Variants

Routes are nested under their product:

#### `POST /admin/products/:productId/variants`
**Body:**
```ts
{ sku: string;                          // unique within (productId, sku)
  attributes: Record<string, unknown>;
  priceOverride?: number | null;        // rupees — null = use product basePrice
  stock?: number;
  imagesObjectKeys?: string[];          // variant-specific S3 keys (e.g. color swatches). Optional — variants fall back to product images
}
```
**201 Created.** **Errors:** `404` (product missing), `409 VARIANT_SKU_TAKEN`.

#### `PATCH /admin/products/:productId/variants/:variantId`
Partial update. The route guard verifies the variant actually belongs to `:productId` — you can't edit another product's variants by knowing only the variantId.
**Errors:** `404`, `409 VARIANT_SKU_TAKEN` (if renaming to a sku already used on this product).

#### `DELETE /admin/products/:productId/variants/:variantId`
**200 OK:** `{ id: string }`. Same product-ownership guard as PATCH.

### 7.6 Admin — Product images (S3 presign + confirm)

Two-step upload pattern — same shape as Sprint 1.5's KYC flow, but scoped to a product's S3 prefix.

#### `POST /admin/products/:productId/images/presign`
**Body:**
```ts
{ contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  contentLength: number;   // 1..5_242_880 bytes (5 MB cap)
}
```
**200 OK:**
```ts
{ uploadUrl: string;        // S3 presigned PUT — valid for 5 min
  objectKey: string;        // products/<productId>/<uuid>.<ext>
  publicUrl: string | null; // null if S3_PUBLIC_BASE_URL isn't configured
  expiresIn: number;        // 300
}
```

Then `PUT <uploadUrl>` directly to S3 with the binary as the body and the same `Content-Type` header.

#### `POST /admin/products/:productId/images/confirm`
**Body:**
```ts
{ objectKeys: string[];     // 1..20 keys you just uploaded
  sortOrder?: number[];     // optional; same length as objectKeys
  replace?: boolean;        // default false (append). true = wipe the previous list
}
```
By default this **appends** to `Product.images`. Pass `replace: true` to atomically replace.

**Server-side guard:** every `objectKey` must start with `products/<productId>/`, otherwise `400 INVALID_OBJECT_KEY` — defends against an admin pointing at another product's S3 prefix.

**200 OK:** `{ images: string[]; imagesSortOrder: number[] }` — the post-update arrays.

> Variant-specific image presign isn't a separate endpoint yet. For now, upload via the product presign flow and write the resulting keys into a variant via `PATCH .../variants/:variantId { imagesObjectKeys: [...] }`.

### 7.7 Admin — Bulk CSV import

Long-running so it goes through BullMQ. You upload, get a `jobId`, then poll for state.

#### `POST /admin/products/import`
**Auth:** Bearer ADMIN.
**Content-Type:** `multipart/form-data`. Single field `file` (≤10 MB, `.csv` or `text/csv`).

**202 Accepted:** `{ jobId: string }`.

**Errors:** `400 CSV_FILE_REQUIRED` (no file), `400 CSV_INVALID_TYPE` (wrong extension/type), `403` (non-admin).

**CSV format** (header row required, exact column order):
```
slug,name,categorySlug,brand,description,basePrice,stock,hsnCode,status,specs,images
```

- `slug` is the upsert key — re-importing with the same slug overwrites that row's fields.
- `categorySlug` must already exist (create categories first).
- `specs` is a JSON-encoded object as a single CSV cell (quote it). Empty cell = `{}`.
- `images` is pipe-separated S3 object keys. Empty cell = no images.
- `status=ACTIVE` requires non-empty `hsnCode` (per §7.4).
- Malformed rows (validation failure, bad JSON in specs, missing category, etc.) are **skipped, not aborted** — they show up in `result.errors[]`.

#### `GET /admin/products/import/:jobId`
Polls BullMQ for the job state. Poll every 1–2s while `state` is `waiting` / `active`.

**200 OK:**
```ts
{ jobId: string;
  state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused';
  progress: unknown;                  // worker-defined; today this is just 0
  result: {
    imported: number;
    skipped: number;
    errors: { row: number; error: string }[];   // row is 1-indexed including header (so row 2 = first data row)
  } | null;                           // null until the job finishes
  failedReason: string | null;        // populated only when state='failed' (worker crashed)
}
```

A successful run is `state === 'completed'` even if `errors[].length > 0` — partial-success is the happy path here.

---

## 8. Cart

All endpoints require `Authorization: Bearer <accessToken>`. A user has at most one cart, lazily created on the first add. Money flows as JSON numbers (rupees, 2dp) — never strings, never paise.

### 8.1 Shapes

```ts
type CouponPreview = { id: string; name: string; value: number };

type CartItem = {
  cartItemId: string;
  productId: string;
  variantId: string | null;
  name: string;
  qty: number;
  unitPrice: number;
  availableCoupons: { customer?: CouponPreview; retail?: CouponPreview };
  appliedCoupons: { customer?: CouponPreview; retail?: CouponPreview };
  discount: { customer: number; retail: number; total: number };
  lineSubtotal: number;
  gst: {
    hsnCode: string;
    ratePercent: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  };
  lineGrandTotal: number;
};

type StaleApplication = {
  cartItemId: string;
  type: 'customer' | 'retail';
  reason: 'COUPON_REMOVED' | 'PARTNER_NOT_VERIFIED';
};

type StockWarning = {
  cartItemId: string;
  requested: number;
  available: number;
};

type CartResponse = {
  items: CartItem[];
  subtotal: number;
  discountTotal: number;
  gstTotal: number;
  grandTotal: number;
  staleApplications: StaleApplication[];
  stockWarnings: StockWarning[]; // GET /cart only
};
```

Notes:
- `availableCoupons.retail` is **omitted (not null)** for non-verified-partner viewers. Branch on `'retail' in availableCoupons`.
- `staleApplications` lists lines where the user's `customerCouponApplied` / `retailCouponApplied` flag is set in the DB but cannot be honored (attachment removed, coupon paused, or partner lost VERIFIED). The discount silently goes to 0; the DB flag is **not** auto-cleared on read — the next `PATCH /cart/items/:id` writes `false` to clean it. So `GET /cart` is idempotent.
- `stockWarnings` are soft warnings; the hard stock decrement lands in Sprint 4 `/checkout`.
- GST split: intra-state default (CGST + SGST = total). When the totals split unevenly (e.g. ₹89.91 → 44.96 + 44.95) the spare paisa goes to CGST. Sprint 4 will swap to IGST when buyer state ≠ seller state.
- Stacking math: `discountedUnit = max(0, basePrice × (1 − retailPct/100) − customerFixed)`. % first, then ₹, floor at 0.

### 8.2 Endpoints

#### `POST /cart/items`
Body: `{ productId: string; variantId?: string; qty: number /* 1..99 */ }`
Returns: `CartResponse`

- Creates the cart row on first call.
- Re-adding the same `(productId, variantId)` tuple bumps `qty` (capped at 99).
- 404 `PRODUCT_NOT_FOUND` if product missing or status ≠ ACTIVE.
- 404 `VARIANT_NOT_FOUND` if `variantId` is provided but not part of the product.

#### `PATCH /cart/items/:id`
Body: `{ qty?: number; customerCouponApplied?: boolean; retailCouponApplied?: boolean }` (any subset).
Returns: `CartResponse`

- `qty` 1..99
- `customerCouponApplied: true` requires an active CUSTOMER_FIXED attachment → 400 `COUPON_NOT_AVAILABLE`
- `retailCouponApplied: true` requires both:
  - `user.role === 'PARTNER' && user.kycStatus === 'VERIFIED'` → 403 `RETAIL_COUPON_PARTNER_ONLY`
  - active RETAIL_PERCENT attachment → 400 `COUPON_NOT_AVAILABLE`
- Setting either flag to `false` is always allowed.
- Non-owners get 404 `CART_ITEM_NOT_FOUND` (not 403, to avoid leaking cart existence).

#### `DELETE /cart/items/:id`
Returns: `CartResponse` (with the line removed). Cart row stays.

#### `GET /cart`
Returns: `CartResponse` + `stockWarnings`. Returns an empty payload (`items: []`, all totals 0) for a user with no cart.

---

## 9. Wishlist

200-item cap per user. Re-add of an existing tuple is a no-op. Auth required on every endpoint.

### 9.1 Shapes

```ts
type WishlistCard = {
  wishlistItemId: string;
  variantId: string | null;
  // mirrors the /products list-card shape so the frontend can reuse the component
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  basePrice: number;
  finalPrice: number;
  lowestVariantPrice: number | null;
  primaryImageUrl: string | null;
  badges: string[];
};

type WishlistResponse = { items: WishlistCard[] };
```

### 9.2 Endpoints

- `GET /wishlist` → `WishlistResponse` (empty array if none).
- `POST /wishlist/items` body `{ productId, variantId? }` → `WishlistResponse`.
  - Idempotent on the unique tuple — re-adding returns the same set.
  - 409 `WISHLIST_FULL` when the cap (200) is reached.
  - 404 `PRODUCT_NOT_FOUND` / `VARIANT_NOT_FOUND` as appropriate.
- `DELETE /wishlist/items/:id` → `WishlistResponse` with the row removed. 404 `WISHLIST_ITEM_NOT_FOUND` if missing or not owned.
- `POST /wishlist/items/:id/move-to-cart` body `{ qty?: number /* default 1, 1..99 */ }` → `{ cart: CartResponse, wishlist: WishlistResponse }`.
  - Atomic (Prisma `$transaction`): deletes the wishlist row + upserts the cart line in one shot.
  - The new cart line starts with both coupon flags `false`.
  - If the cart already has a line for the same `(productId, variantId)`, the qtys sum (capped at 99).

---

## 10. Coupons

Two coupon types stack per product line: **one CUSTOMER_FIXED ₹-off** (everyone) + **one RETAIL_PERCENT %-off** (verified partners only). No codes — admin attaches a coupon to a product slot, customers manually toggle the flag on a cart line via `PATCH /cart/items/:id`.

### 10.1 Shapes

```ts
type CouponType = 'CUSTOMER_FIXED' | 'RETAIL_PERCENT';
type CouponStatus = 'ACTIVE' | 'PAUSED';

type AdminCoupon = {
  id: string;
  name: string; // unique
  type: CouponType; // immutable post-create
  status: CouponStatus;
  attachmentCount: number;
  createdAt: string;
  updatedAt: string;
};

type AdminCouponDetail = AdminCoupon & {
  attachments: { productId: string; productName: string; value: number }[];
};
```

### 10.2 Admin coupon CRUD (`@Roles(ADMIN)`)

- `POST /admin/coupons` body `{ name, type, status? }` → 201 `AdminCoupon`.
  - 409 `COUPON_NAME_TAKEN`.
- `PATCH /admin/coupons/:id` body `{ name?, status? }` → 200 `AdminCoupon`.
  - 400 `COUPON_TYPE_IMMUTABLE` if `type` is included (changing type would orphan attachments).
- `DELETE /admin/coupons/:id` → 204.
  - 409 `COUPON_HAS_ATTACHMENTS` (admin must detach first, or pause instead).
- `GET /admin/coupons?type=&status=&limit=&offset=` → `{ items: AdminCoupon[]; total; limit; offset }`. Each row includes `attachmentCount`.
- `GET /admin/coupons/:id` → `AdminCouponDetail` with the list of attached products.

### 10.3 Admin product–coupon attach/detach (`@Roles(ADMIN)`)

- `PUT /admin/products/:id/coupons/customer` body `{ couponId, value /* > 0 (₹) */ }`
- `PUT /admin/products/:id/coupons/retail` body `{ couponId, value /* 0 < value ≤ 100 (%) */ }`

Both endpoints:
- Replace the slot if it already has a different coupon (single delete + upsert, transactional).
- 400 `COUPON_TYPE_MISMATCH` if the coupon's `type` doesn't match the slot.
- 400 `COUPON_PAUSED` — paused coupons cannot be attached.
- 400 `COUPON_VALUE_OUT_OF_BOUNDS` for value violations.
- 400 `COUPON_SLOT_INVALID` for any URL segment other than `customer` / `retail`.

`DELETE /admin/products/:id/coupons/{customer|retail}` → 204 (no-op if absent).

`GET /admin/products/:id` exposes `coupons: { customer?, retail? }` on the response, each shaped `{ id, name, status, value }`.

### 10.4 Public visibility on `/products/:slug`

The PDP response includes `availableCoupons: { customer?: CouponPreview; retail?: CouponPreview }` at the top level (coupons are per-product, not per-variant).

| Viewer | `customer` field | `retail` field |
|---|---|---|
| Anonymous | shown | omitted |
| Customer | shown | omitted |
| Partner (PENDING / NONE / REJECTED) | shown | omitted |
| Partner (VERIFIED) | shown | shown |
| Admin | shown | omitted (only PARTNER+VERIFIED unlocks retail) |

Branch on `'retail' in availableCoupons`. Paused coupons are hidden from this field (treated as "no active attachment").

The endpoint runs through `OptionalJwtAuthGuard` — anonymous calls succeed; an `Authorization` header unlocks role-aware visibility.

---

## 11. Addresses

The customer's address book. CRUD scoped to the current user; one default address per user enforced at the DB level (partial unique index `WHERE isDefault = true`). All endpoints require auth.

### 11.1 List

```
GET /me/addresses
→ 200 [
  { id, label?, recipientName, phone, line1, line2?, city, stateCode, pincode, country: 'IN', isDefault, createdAt, updatedAt },
  ...
]
```

Sorted **default first, then `createdAt desc`** — render the default at the top of the picker.

### 11.2 Create

```
POST /me/addresses
{
  label?: string,          // 1–50 chars, e.g. "Home", "Office"
  recipientName: string,   // 1–100
  phone: string,           // E.164, e.g. "+919000000001"
  line1: string,           // 1–200
  line2?: string,
  city: string,            // 1–100
  stateCode: string,       // ISO 3166-2:IN code: AN, AP, AR, AS, BR, CG, CH, DH, DL, GA, GJ, HP, HR, JH, JK, KA, KL, LA, LD, MH, ML, MN, MP, MZ, NL, OR, PB, PY, RJ, SK, TG, TN, TR, UK, UP, WB
  pincode: string,         // 6 digits
  isDefault?: boolean      // first address auto-defaults regardless of this flag
}
→ 201 Address
```

The **first** address a user creates is always default (saves the user a separate `set-default` round-trip). On subsequent creates, `isDefault: true` atomically flips the previous default off (DB-side partial unique index guarantees exactly one default).

### 11.3 Update

```
PATCH /me/addresses/:id
{ <any subset of the Create fields except isDefault> }
→ 200 Address
```

`isDefault` is intentionally **not** patchable here — flip via `POST /me/addresses/:id/set-default`. The global `forbidNonWhitelisted` pipe rejects `isDefault` on PATCH with a 400.

### 11.4 Set default

```
POST /me/addresses/:id/set-default
→ 200 Address     # the newly-default address
```

Runs in one transaction: clear the prior default + set the new one. The partial unique index serialises concurrent flips at the DB layer.

### 11.5 Delete

```
DELETE /me/addresses/:id
→ 200 { ok: true }
→ 409 ADDRESS_IN_USE      # at least one active order still references this address
→ 404 ADDRESS_NOT_FOUND   # missing or owned by another user (no leak)
```

"Active" means status ∈ `{PENDING_PAYMENT, CONFIRMED, PROCESSING, SHIPPED, RETURN_REQUESTED}`. Terminal-status orders (DELIVERED, CANCELLED, RETURNED) keep their `addressId` FK NULL-ed out (via `onDelete: SetNull`) while the order's `addressSnapshot`/recipient columns preserve the historical view.

Non-owner reads return **404** (not 403) so address existence doesn't leak — same rule as cart.

---

## 12. Checkout

The headline transactional endpoint. Locks stock, freezes pricing, writes an immutable Order snapshot, enqueues invoice PDF generation. Auth required.

### 12.1 Request

```
POST /checkout
{
  addressId: string,                // must belong to the current user
  idempotencyKey?: string           // optional, ≤100 chars
}
→ 201 { orderId, orderNumber: 'CPC-ORD-26-27-00001', status: 'PENDING_PAYMENT', grandTotal: number }
```

### 12.2 Idempotency

Provide `idempotencyKey` (typically a UUID generated when the checkout page mounts) to make retries safe. Keyed in Redis as `checkout:idem:<userId>:<key>` with a 24-hour TTL:
- First call wins the SETNX race, runs the tx, then writes the new `orderId` into the key.
- Subsequent calls with the same key return the **same** `{ orderId, orderNumber, status, grandTotal }` with 201.
- If a prior call is still in flight (sentinel = "PENDING"), the second call returns **409 `CHECKOUT_IN_PROGRESS`** — show "still processing, please wait" UI.
- If the prior call **failed**, the key is released — retries proceed normally.

### 12.3 Pricing

Calls `PricingService.priceCart(cart, { user, address, sellerState })` inside the tx:
- `address.stateCode` from the chosen address; `sellerState` from `SELLER_STATE` env (default `WB`).
- Intra-state (buyer state == seller state) → CGST/SGST split, IGST = 0.
- Inter-state → IGST = full GST, CGST/SGST = 0.

Both totals (`cgstTotal + sgstTotal + igstTotal == gstTotal`) and the per-line splits land on the Order/OrderItem snapshot. They are **frozen** at checkout — admin changing the product's basePrice later does not retroactively change the order.

### 12.4 Errors

| HTTP | `code` | Cause |
|---|---|---|
| 400 | `CART_EMPTY` | Cart has zero items |
| 404 | `ADDRESS_NOT_FOUND` | `addressId` missing or owned by another user |
| 409 | `PRODUCT_UNAVAILABLE` | At least one cart line points at a non-ACTIVE product (`productIds` array in body) |
| 409 | `STOCK_INSUFFICIENT` | Not enough stock at lock-time. Body: `shortages: [{ productId, variantId\|null, requested, available }]`. **No partial decrement** — the whole tx rolls back. |
| 409 | `CHECKOUT_IN_PROGRESS` | Same idempotency key still mid-flight |
| 409 | `CHECKOUT_IDEMPOTENCY_STALE` | Key references a deleted order; retry without it |
| 503 | `CHECKOUT_RETRY_LATER` | Serialization conflict — retried once, second attempt also failed. Client should retry. |

### 12.5 After commit

- Cart items deleted; Cart row preserved
- `OrderStatusHistory{ fromStatus: null, toStatus: PENDING_PAYMENT, actorUserId: user.id }` inserted
- `Invoice{ orderId, invoiceNumber: 'CPC/26-27/0001' }` row created with `pdfObjectKey = null`
- BullMQ `invoice-pdf` job enqueued — the worker fills in `pdfObjectKey` + `generatedAt` typically within a second

The order sits at `PENDING_PAYMENT` until an admin marks it `CONFIRMED` (no live payment gateway in MVP — COD / wire-transfer placeholder).

---

## 13. Customer orders

### 13.1 List

```
GET /me/orders?status=&limit=20&offset=0
→ 200 {
  items: [
    {
      id, orderNumber, status, grandTotal, createdAt,
      itemCount: number,
      primaryImageUrl: string | null       // first item's product.images[0] via CDN
    }, ...
  ],
  total, limit, offset
}
```

Sorted `createdAt desc`. `limit` 1–100 (default 20).

### 13.2 Detail

```
GET /me/orders/:id
→ 200 {
  id, orderNumber, status, grandTotal, subtotal, discountTotal, gstTotal,
  cgstTotal, sgstTotal, igstTotal, shippingTotal,
  recipientName, recipientPhone, recipientStateCode, addressSnapshot, addressId,
  cancelledAt?, cancelReason?, returnRequestedAt?, returnedAt?,
  returnReason?, returnReasonNote?, deliveredAt?,
  items: [
    { productName, variantSku?, variantAttributes?, hsnCode, qty, unitPrice,
      customerCouponName?, customerCouponValue?, retailCouponName?, retailCouponPercent?,
      customerDiscount, retailDiscount, lineSubtotal,
      gstRatePercent, gstAmount, cgst, sgst, igst, lineGrandTotal }, ...
  ],
  statusHistory: [{ fromStatus, toStatus, actorUserId, note?, createdAt }, ...],
  invoice: null | {
    id, invoiceNumber,
    generatedAt: null | ISOString,
    downloadUrl: null | string,            // 5-min signed S3 URL, present once worker finished
    downloadExpiresIn: null | 300
  }
}
→ 404 ORDER_NOT_FOUND   # missing or owned by another user
```

`downloadUrl` is `null` until the PDF worker writes `Invoice.pdfObjectKey`. Re-fetch the detail to get a fresh URL once it lands; the URL expires after 5 minutes.

### 13.3 Cancel

```
POST /me/orders/:id/cancel
{ reason?: string }   # 1–500 chars
→ 200 { id, orderNumber, status: 'CANCELLED' }
→ 409 CANCEL_NOT_ALLOWED   # status ∉ {PENDING_PAYMENT, CONFIRMED}
→ 404 ORDER_NOT_FOUND
```

Transaction: bump status to `CANCELLED`, restore stock for every line (variant lines bump `ProductVariant.stock`, variantless lines bump `Product.stock`), insert a status-history row. Past `PROCESSING`, only admin can cancel.

### 13.4 Return request

```
POST /me/orders/:id/return-request
{ reason: 'DAMAGED' | 'WRONG_ITEM' | 'NOT_AS_DESCRIBED' | 'OTHER', note?: string }
→ 200 { id, orderNumber, status: 'RETURN_REQUESTED' }
→ 409 RETURN_NOT_ALLOWED     # status ≠ DELIVERED
→ 409 RETURN_WINDOW_EXPIRED  # > 7 days since deliveredAt
→ 404 ORDER_NOT_FOUND
```

Sets `status, returnRequestedAt, returnReason, returnReasonNote` + history row. **No stock change** at this stage — the actual stock restoration happens when admin transitions the order to `RETURNED` (see §14).

### 13.5 Invoice download

```
GET /me/invoices/:id/download
→ 200 { url, expiresIn: 300 }
→ 404 INVOICE_NOT_FOUND   # not this user's invoice
→ 404 INVOICE_NOT_READY   # PDF not yet generated — try again in a few seconds
```

Use this for direct download links (the same URL is also surfaced inside `GET /me/orders/:id`'s `invoice.downloadUrl`). Both 404 codes share the same status so invoice existence doesn't leak.

---

## 14. Admin orders

`@Roles(Role.ADMIN)` on the whole controller. Non-admin → 403.

### 14.1 List

```
GET /admin/orders?status=&userId=&q=&from=&to=&limit=20&offset=0
→ 200 {
  items: [{
    id, orderNumber, status, grandTotal, createdAt,
    recipientName, recipientStateCode, itemCount,
    user: { id, name, email, phone }       // current contact info (not snapshot)
  }, ...],
  total, limit, offset
}
```

- `q` matches an `orderNumber` **prefix** (e.g. `CPC-ORD-26-27` to scope to FY26-27).
- `from` / `to` are ISO date strings filtering on `createdAt`.

### 14.2 Detail

```
GET /admin/orders/:id
→ 200 {
  <same shape as /me/orders/:id>,
  user: { id, name, email, phone },
  legalTransitions: OrderStatus[]   # which moves PATCH /:id/status will accept right now
}
→ 404 ORDER_NOT_FOUND
```

`legalTransitions` is driven by the state machine; use it to enable/disable buttons in the admin UI rather than re-implementing the matrix client-side.

### 14.3 State machine

```
                  ┌─────────────────┐
                  │ PENDING_PAYMENT │
                  └────────┬────────┘
              ┌────────────┴────────────┐
              ▼                         ▼
         ┌───────────┐           ┌────────────┐
         │ CONFIRMED │           │ CANCELLED  │ (terminal)
         └─────┬─────┘           └────────────┘
       ┌──────┴───────┐
       ▼              ▼
  ┌────────────┐ ┌────────────┐
  │ PROCESSING │ │ CANCELLED  │
  └──────┬─────┘ └────────────┘
   ┌─────┴──────┐
   ▼            ▼
┌─────────┐ ┌────────────┐
│ SHIPPED │ │ CANCELLED  │
└────┬────┘ └────────────┘
     ▼
┌───────────┐
│ DELIVERED │ ───── (customer-only) ──▶ RETURN_REQUESTED ──▶ RETURNED
└───────────┘                                                  (terminal,
   (terminal on the admin path —                                stock restored
    only the customer can drive it                              by admin tx)
    into RETURN_REQUESTED via
    POST /me/orders/:id/return-request)
```

Admin transitions allowed by `PATCH /admin/orders/:id/status`:
- `PENDING_PAYMENT → CONFIRMED | CANCELLED`
- `CONFIRMED → PROCESSING | CANCELLED`
- `PROCESSING → SHIPPED | CANCELLED`
- `SHIPPED → DELIVERED`
- `RETURN_REQUESTED → RETURNED`

Anything else (including `DELIVERED → RETURN_REQUESTED`) is rejected as **409 `ILLEGAL_STATUS_TRANSITION`** with `legalTransitions: OrderStatus[]` in the body.

Side effects:
- `→ DELIVERED` sets `deliveredAt = now` (drives the customer's 7-day return window).
- `→ CANCELLED` sets `cancelledAt`/`cancelReason` **and** restores stock on every line.
- `→ RETURNED` sets `returnedAt` **and** restores stock on every line.

### 14.4 PATCH status

```
PATCH /admin/orders/:id/status
{ toStatus: OrderStatus, note?: string }    # note 1–500 chars
→ 200 { id, orderNumber, status: <toStatus> }
→ 409 ILLEGAL_STATUS_TRANSITION  # body: { code, message, legalTransitions: OrderStatus[] }
→ 404 ORDER_NOT_FOUND
```

`note` lands on the `OrderStatusHistory.note` row; for `→ CANCELLED` it's also copied into `Order.cancelReason`.

### 14.5 Manual order creation (phone-order flow)

```
POST /admin/orders
{
  userId: string,                    # target customer
  addressId: string,                 # must belong to the target user
  items: [{ productId, variantId?, qty: 1–99 }, ...],   # min 1
  idempotencyKey?: string
}
→ 201 { orderId, orderNumber, status: 'PENDING_PAYMENT', grandTotal }
→ 400 USER_NOT_FOUND          # bad userId
→ 400 PRODUCT_NOT_FOUND       # one of the items references an unknown product
→ 400 VARIANT_NOT_FOUND       # variantId doesn't belong to its product
→ 404 ADDRESS_NOT_FOUND       # address missing OR not owned by target user
→ 409 PRODUCT_UNAVAILABLE     # body includes productIds[]
→ 409 STOCK_INSUFFICIENT      # body includes shortages[]
→ 409 ADMIN_ORDER_IN_PROGRESS / ADMIN_ORDER_IDEMPOTENCY_STALE
```

Identical tx semantics to `/checkout`: SELECT FOR UPDATE on Product + ProductVariant rows, validate ACTIVE + stock, decrement, snapshot pricing via `PricingService.priceCart`, create Order/OrderItem[]/StatusHistory/Invoice rows, enqueue PDF job. Coupons are **not** auto-applied on manual orders (both `customerCouponApplied` and `retailCouponApplied` flags forced to false in the synthetic cart).

Idempotency uses a separate Redis namespace from `/checkout`: `admin:order:idem:<adminUserId>:<key>`.

### 14.6 Regenerate invoice

```
POST /admin/orders/:id/regenerate-invoice
→ 202 { ok: true, jobId: string }
→ 400 INVOICE_MISSING       # order has no invoice row (shouldn't happen post-S4 since every order auto-creates one)
→ 404 ORDER_NOT_FOUND
```

Re-enqueues the `invoice-pdf` BullMQ job. The worker is idempotent — it overwrites the S3 object at the same key + flips `pdfObjectKey` / `generatedAt` back to fresh values.

---

## 15. Error code catalogue

A central index of every `code` value the API can return, for switch-case rendering on the frontend.

| Code | HTTP | Where | Meaning / UX hint |
|---|---|---|---|
| `NAME_REQUIRED_FOR_SIGNUP` | 400 | `/auth/otp/verify` | Phone is new — show name input, retry with same OTP code |
| `PHONE_ALREADY_TAKEN` | 409 | `/me/phone/*` | Another user owns this phone; ask user to use a different one |
| `EMAIL_UNCHANGED` | 409 | `/me/email` | New email matches current; no change to make |
| `EMAIL_ALREADY_TAKEN` | 409 | `/me/email`, `/me/email/confirm` | Another user owns this email |
| `EMAIL_CONFIRM_TOKEN_INVALID` | 400 | `/me/email/confirm` | Token bad/expired — user should request a new email change |
| `EMAIL_CONFIRM_TOKEN_MISMATCH` | 403 | `/me/email/confirm` | Wrong access token; user must log in as the account that requested the change |
| `NO_UPDATE_FIELDS` | 400 | `PATCH /me` | Empty body |
| `PHONE_REQUIRED_FOR_PARTNER` | 400 | `/partners/upgrade` | Funnel user through phone-add flow first |
| `PARTNER_UPGRADE_NOT_ALLOWED` | 409 | `/partners/upgrade` | Already PENDING or VERIFIED — show current state instead |
| `GST_ALREADY_REGISTERED` | 409 | `/partners/upgrade` | GSTIN globally unique |
| `KYC_PRESIGN_NOT_ALLOWED` | 409 | `/partners/kyc-docs/presign` | User is VERIFIED — no more docs needed |
| `KYC_NOT_PENDING` | 409 | `/partners/kyc-docs/confirm` | Submit `/partners/upgrade` first |
| `PARTNER_NOT_PENDING` | 409 | `/admin/partners/:id/approve\|reject` | Application is no longer in PENDING state |
| `CATEGORY_SLUG_TAKEN` | 409 | `/admin/categories` POST/PATCH | Pick a different slug, or omit to auto-generate |
| `PARENT_NOT_FOUND` | 400 | `/admin/categories` POST/PATCH | The `parentId` you passed doesn't exist |
| `CATEGORY_CYCLE` | 400 | `PATCH /admin/categories/:id` | The new parent would create a loop (self or ancestor of an ancestor) |
| `CATEGORY_HAS_PRODUCTS` | 409 | `DELETE /admin/categories/:id` | Reassign or archive products before deleting the category |
| `CATEGORY_HAS_CHILDREN` | 409 | `DELETE /admin/categories/:id` | Detach or delete child categories first |
| `CATEGORY_NOT_FOUND` | 400 | `/admin/products` POST/PATCH | The `categoryId` doesn't exist |
| `PRODUCT_SLUG_TAKEN` | 409 | `/admin/products` POST/PATCH | Pick a different slug, or omit to auto-generate |
| `HSN_REQUIRED_FOR_ACTIVE` | 400 | `/admin/products` POST/PATCH | Product cannot be ACTIVE without a non-empty `hsnCode` |
| `VARIANT_SKU_TAKEN` | 409 | `/admin/products/:id/variants` POST/PATCH | SKU duplicate within this product (SKUs are unique per product, not globally) |
| `INVALID_OBJECT_KEY` | 400 | `/admin/products/:id/images/confirm` | At least one key isn't under `products/<productId>/` — re-upload via this product's presign |
| `SORT_ORDER_LENGTH_MISMATCH` | 400 | `/admin/products/:id/images/confirm` | `sortOrder.length` must equal `objectKeys.length` |
| `CSV_FILE_REQUIRED` | 400 | `/admin/products/import` | Multipart `file` field missing |
| `CSV_INVALID_TYPE` | 400 | `/admin/products/import` | File must be `.csv` / `text/csv` |
| `PRODUCT_NOT_FOUND` | 404 | `POST /cart/items`, `POST /wishlist/items`, move-to-cart | Product missing or non-ACTIVE |
| `VARIANT_NOT_FOUND` | 404 | `POST /cart/items`, `POST /wishlist/items` | `variantId` not part of the product |
| `CART_ITEM_NOT_FOUND` | 404 | `PATCH/DELETE /cart/items/:id` | Item missing or not owned by caller (no leak) |
| `COUPON_NOT_AVAILABLE` | 400 | `PATCH /cart/items/:id` | Flag flipped to true but no active attachment |
| `RETAIL_COUPON_PARTNER_ONLY` | 403 | `PATCH /cart/items/:id` | Caller is not PARTNER+VERIFIED |
| `WISHLIST_ITEM_NOT_FOUND` | 404 | `DELETE /wishlist/items/:id`, move-to-cart | Item missing or not owned |
| `WISHLIST_FULL` | 409 | `POST /wishlist/items` | 200-item cap reached |
| `COUPON_NAME_TAKEN` | 409 | `POST/PATCH /admin/coupons` | Coupon name unique |
| `COUPON_TYPE_IMMUTABLE` | 400 | `PATCH /admin/coupons/:id` | `type` cannot change post-create |
| `COUPON_HAS_ATTACHMENTS` | 409 | `DELETE /admin/coupons/:id` | Detach first or pause instead |
| `COUPON_NOT_FOUND` | 404 | admin coupon endpoints | |
| `COUPON_TYPE_MISMATCH` | 400 | `PUT /admin/products/:id/coupons/:slot` | Slot vs coupon-type mismatch |
| `COUPON_PAUSED` | 400 | `PUT /admin/products/:id/coupons/:slot` | Cannot attach a paused coupon |
| `COUPON_VALUE_OUT_OF_BOUNDS` | 400 | `PUT /admin/products/:id/coupons/:slot` | customer ≤ 0, retail ≤ 0 or > 100 |
| `COUPON_SLOT_INVALID` | 400 | URL `:slot` segment | Must be `customer` or `retail` |
| `ADDRESS_NOT_FOUND` | 404 | `/me/addresses/:id`, `/checkout`, `/admin/orders` POST | Address missing or owned by a different user |
| `ADDRESS_IN_USE` | 409 | `DELETE /me/addresses/:id` | Active order references this address; cancel or wait for completion first |
| `CART_EMPTY` | 400 | `POST /checkout` | Cart has zero items |
| `PRODUCT_UNAVAILABLE` | 409 | `POST /checkout`, `POST /admin/orders` | At least one line points at a non-ACTIVE product; body includes `productIds[]` |
| `STOCK_INSUFFICIENT` | 409 | `POST /checkout`, `POST /admin/orders` | Insufficient stock at lock-time; body includes `shortages: [{ productId, variantId, requested, available }]`. No partial decrement. |
| `CHECKOUT_IN_PROGRESS` | 409 | `POST /checkout` | Same `idempotencyKey` is still mid-flight |
| `CHECKOUT_IDEMPOTENCY_STALE` | 409 | `POST /checkout` | Idempotency key references a missing order; retry without it |
| `CHECKOUT_RETRY_LATER` | 503 | `POST /checkout` | Serializable conflict retried once, second attempt also failed; client should retry |
| `ORDER_NOT_FOUND` | 404 | `/me/orders/:id`, `/admin/orders/:id` | Missing or owned by a different user (customer path) |
| `CANCEL_NOT_ALLOWED` | 409 | `POST /me/orders/:id/cancel` | Status ∉ {PENDING_PAYMENT, CONFIRMED} — admin must cancel past PROCESSING |
| `RETURN_NOT_ALLOWED` | 409 | `POST /me/orders/:id/return-request` | Status ≠ DELIVERED |
| `RETURN_WINDOW_EXPIRED` | 409 | `POST /me/orders/:id/return-request` | > 7 days since `deliveredAt` |
| `INVOICE_NOT_FOUND` | 404 | `GET /me/invoices/:id/download` | Not this user's invoice |
| `INVOICE_NOT_READY` | 404 | `GET /me/invoices/:id/download` | PDF still generating — retry in ~1s |
| `INVOICE_MISSING` | 400 | `POST /admin/orders/:id/regenerate-invoice` | Order has no Invoice row (shouldn't happen post-S4) |
| `ILLEGAL_STATUS_TRANSITION` | 409 | `PATCH /admin/orders/:id/status` | Target status not legal for current state; body includes `legalTransitions: OrderStatus[]` |
| `USER_NOT_FOUND` | 400 | `POST /admin/orders` | `userId` doesn't exist |
| `ADMIN_ORDER_IN_PROGRESS` | 409 | `POST /admin/orders` | Same `idempotencyKey` is still mid-flight |
| `ADMIN_ORDER_IDEMPOTENCY_STALE` | 409 | `POST /admin/orders` | Idempotency key references a missing order; retry without it |
| `CANNOT_EDIT_SELF` | 403 | `PATCH /admin/users/:id/role\|status` | An admin cannot change their own role or status |
| `USER_DELETED` | 403 | `PATCH /admin/users/:id/role\|status` | The target user is `DELETED` and is not editable |
| `REPORT_EXPORT_NOT_FOUND` | 404 | `GET /admin/reports/exports/:id` | Export missing or not requested by this admin |
| `SHIPMENT_TRACKING_REQUIRED` | 400 | `PATCH /admin/orders/:id/status` | `toStatus=SHIPPED` needs `shipmentCarrier` + `shipmentTrackingNumber` + `shipmentTrackingUrl` |
| `INVALID_OBJECT_KEY` | 400 | banner / ticket-attachment / review-photo create | An object key isn't under the expected prefix (`banners/`, `tickets/<callerId>/`, `reviews/<callerId>/`) — re-upload via the matching presign |
| `INVALID_ASSIGNEE` | 400 | `PATCH /admin/tickets/:id` | `assigneeId` must reference an ADMIN user |
| `TICKET_NOT_FOUND` | 404 | `/me/tickets/:id`, `/admin/tickets/:id` | Ticket missing or owned by a different user (customer path) |
| `REVIEW_NOT_ELIGIBLE` | 403 | `POST /reviews` | Caller has no `DELIVERED` order containing this product |
| `ALREADY_REVIEWED` | 409 | `POST /reviews` | This user has already reviewed this product — use `PATCH /reviews/:id` to update |
| `REVIEW_NOT_FOUND` | 404 | `PATCH/DELETE /reviews/:id`, `PATCH /admin/reviews/:id` | Review missing or owned by a different user (user path) |
| `INVALID_RESET_TOKEN` | 400 | `POST /auth/password/reset` | Reset link is invalid, expired, or already used — request a new one |
| `INVALID_UNSUBSCRIBE_TOKEN` | 400 | `GET /email/unsubscribe` | Unsubscribe link tampered with or malformed |

For codes not in this table (e.g. `Invalid credentials` 401, throttler 429, generic DTO 400 with array `message`), fall back to `error` + `message`.

---

## 16. Admin operations (Sprint 5a)

`@Roles(Role.ADMIN)` on every controller in this section. Non-admin → 403.

> **Audit trail:** every successful non-GET request on an admin controller writes an `ActivityLog` row automatically (global interceptor). Nothing to call — it just happens.

### 16.1 Activity log

```
GET /admin/activity-logs?actorUserId=&targetType=&targetId=&action=&from=&to=&limit=20&offset=0
→ 200 {
  rows: [{
    id, actorUserId, actorRole, action, targetType, targetId,
    diff,                       // { field: { from, to } } when a service recorded one, else the sanitised request body
    ip, userAgent, createdAt,
    actor: { id, name, email, role } | null   // null if the actor was since deleted
  }, ...],
  total, limit, offset
}
```

- `action` is `${METHOD}:${routePath}`, e.g. `PATCH:/admin/users/:id/role`. `targetType` is the resource segment after `admin/` (e.g. `users`, `orders`).
- `action` filter is a substring match; the rest are exact. `from`/`to` are ISO strings on `createdAt`.
- Secret-looking body keys (`password`, `token`, `secret`) are redacted to `[redacted]` in `diff`.

### 16.2 Admin users

```
GET /admin/users?role=&status=&kycStatus=&q=&limit=20&offset=0
→ 200 { rows: [<safe user projection>], total, limit, offset }

GET /admin/users/:id
→ 200 { <safe user projection>, _count: { orders } }
→ 404 USER_NOT_FOUND

PATCH /admin/users/:id/role     { role: "CUSTOMER"|"PARTNER"|"ADMIN" }
PATCH /admin/users/:id/status   { status: "ACTIVE"|"SUSPENDED" }
→ 200 <safe user projection>
→ 403 CANNOT_EDIT_SELF   // admin editing their own row
→ 403 USER_DELETED       // target is DELETED
→ 404 USER_NOT_FOUND
→ 400                    // status body other than ACTIVE/SUSPENDED
```

- "Safe user projection" = `id, name, email, phone, role, status, companyName, gstNumber, kycStatus, kycRejectedReason, profilePicUrl, createdAt, updatedAt, lastLoginAt`. Never `passwordHash` / `googleId`.
- `q` is a case-insensitive search across name / email / phone.
- Suspending a user takes effect on their **next request** — the JWT strategy re-reads `status` every call, so a `SUSPENDED` user's existing access token starts returning 401 immediately. Unsuspend restores it.

### 16.3 Dashboard

```
GET /admin/dashboard
→ 200 {
  todayOrders:  { count, revenue },
  revenue:      { today, last7Days, monthToDate },
  pendingPartners,                                   // PARTNER users with kycStatus=PENDING
  topProducts:  [{ productId, name, unitsSold }],    // top 5, last 30 days
  lowStockAlerts: { threshold, count, items: [{ kind: "product"|"variant", id, productId, label, stock }] }
}
```

- All money is rupees; all date math is **IST** (Asia/Kolkata, hard-coded for MVP).
- "Revenue" counts orders past `PENDING_PAYMENT` excluding `CANCELLED`/`RETURNED` (`RETURN_REQUESTED` still counts), by `createdAt`.
- `lowStockAlerts.threshold` is `5`; `items` is capped at 10 (products + variants of ACTIVE products), sorted by stock ascending.

### 16.4 Reports

```
GET /admin/reports/sales?from=&to=&groupBy=day|week|month   // from/to required, groupBy default day
→ 200 { from, to, groupBy, buckets: [{ bucket, orderCount, subtotal, discountTotal, gstTotal, shippingTotal, grandTotal }] }
→ 400   // missing from/to

GET /admin/reports/partners?from=&to=                       // from/to optional
→ 200 { from, to, partners: [{ partnerId, name, email, companyName, orderCount, gross, discountTotal, lastOrderAt }] }

GET /admin/reports/products?from=&to=&sort=top|slow&limit=50  // sort default top, limit default 50
→ 200 { from, to, sort, products: [{ productId, name, stock, unitsSold, gross }] }
```

- All three count only revenue-status orders (same rule as the dashboard). Buckets are IST days/weeks/months.
- `partners` includes zero-order partners (gross 0, `lastOrderAt` null); `products` includes zero-sale products so `sort=slow` surfaces slow movers.

### 16.5 Report exports

Long reports run as an async BullMQ job — the POST returns immediately, you poll for the file.

```
POST /admin/reports/sales/export     { from, to, groupBy? }       // same body as the GET query
POST /admin/reports/partners/export  { from?, to? }
POST /admin/reports/products/export  { from?, to?, sort?, limit? }
→ 202 { id, requestedByUserId, reportType, params, status: "PENDING", objectKey: null, rowCount: null, ... }

GET /admin/reports/exports
→ 200 { rows: [<export row>] }     // this admin's 20 most recent, newest first

GET /admin/reports/exports/:id
→ 200 { <export row>, downloadUrl: string | null }   // signed 5-min S3 URL once status=READY
→ 404 REPORT_EXPORT_NOT_FOUND
```

- `status` flows `PENDING → PROCESSING → READY` (or `FAILED` with an `error` string). Poll `GET /admin/reports/exports/:id` until terminal.
- The worker uploads a CSV to `reports/<exportId>/<type>-<timestamp>.csv`; `downloadUrl` is only present when `READY`.
- A failed report is terminal (no retry) — the admin can re-POST to try again.

---

## 17. Shipping, CMS & Support (Sprint 5b)

### 17.1 Delivery zones + shipping charges

Shipping is a flat rate per **delivery zone** (keyed by destination state code), with an optional per-zone free-shipping threshold. One zone may be the `isDefault` catch-all.

```
# Admin — @Roles(ADMIN)
GET    /admin/delivery-zones
GET    /admin/delivery-zones/:id
POST   /admin/delivery-zones      { name, stateCodes: string[], flatRate, freeShippingThreshold?, isDefault?, isActive? }
PATCH  /admin/delivery-zones/:id  { ...any of the above }
DELETE /admin/delivery-zones/:id  → 200 { id }

# Authenticated (any role) — checkout-UI shipping preview
GET /shipping/quote?stateCode=WB&subtotal=1200
→ 200 { shippingTotal, zoneId, zoneName }
```

- `subtotal` for the quote + threshold is the **post-discount, pre-GST** order value.
- Resolution order: active zone whose `stateCodes` contains the state → active `isDefault` zone → `0` (an unconfigured store ships free).
- Free when `freeShippingThreshold != null && subtotal >= threshold`, else `flatRate`.
- Setting `isDefault: true` atomically demotes the previous default.
- Checkout recomputes shipping server-side and snapshots it onto `Order.shippingTotal`; `grandTotal` now includes it. The `/shipping/quote` value is advisory only.

### 17.2 Manual shipment tracking

No courier API — the admin types tracking details on the `→ SHIPPED` transition.

```
PATCH /admin/orders/:id/status
  { toStatus: "SHIPPED", shipmentCarrier, shipmentTrackingNumber, shipmentTrackingUrl }
→ 200   # persists the three fields + shippedAt; emits an order.shipped event
→ 400 SHIPMENT_TRACKING_REQUIRED   # all three are required to ship
```

`shipmentCarrier` / `shipmentTrackingNumber` / `shipmentTrackingUrl` / `shippedAt` are returned on `GET /me/orders/:id` and `GET /admin/orders/:id` once set.

### 17.3 CMS Banners

```
# Admin — @Roles(ADMIN)
POST   /admin/banners/presign  { contentType, contentLength }  → { uploadUrl, objectKey, publicUrl, expiresIn }
GET    /admin/banners
GET    /admin/banners/:id
POST   /admin/banners      { imageObjectKey, position, linkUrl?, sortOrder?, activeFrom?, activeTo?, isActive? }
PATCH  /admin/banners/:id  { ...any of the above; null clears linkUrl/activeFrom/activeTo }
DELETE /admin/banners/:id  → 200 { id }

# Public
GET /banners/active
→ 200 [{ id, imageObjectKey, imageUrl, linkUrl, position, sortOrder, activeFrom, activeTo, isActive }]
```

- `imageObjectKey` must come from the presign step (must live under `banners/`) — else 400 `INVALID_OBJECT_KEY`.
- `position` is a free-form slot key (e.g. `home_hero`) — the UI decides what each slot renders.
- `GET /banners/active` returns `isActive` banners within their `activeFrom`/`activeTo` window (nulls = open-ended), ordered by `position` then `sortOrder`. All responses include a resolved `imageUrl`.

### 17.4 Support tickets

```
# User — @Controller('me/tickets')
POST /me/tickets/attachments/presign  { contentType, contentLength }  → { uploadUrl, objectKey, expiresIn }
POST /me/tickets            { subject, body, attachments?: string[] }
GET  /me/tickets?limit=&offset=
GET  /me/tickets/:id        → ticket + thread (internal notes filtered out)
POST /me/tickets/:id/messages  { body, attachments?: string[] }

# Admin — @Roles(ADMIN)
GET   /admin/tickets?status=&assigneeId=&limit=&offset=
GET   /admin/tickets/:id    → ticket + full thread (internal notes included)
PATCH /admin/tickets/:id    { status?, assigneeId? }   # assigneeId null = unassign
POST  /admin/tickets/:id/messages  { body, attachments?, isInternalNote? }
```

- Attachments: up to 5 per ticket/message, 5 MB each (image or PDF). Keys must live under the caller's own `tickets/<callerId>/` prefix — else 400 `INVALID_OBJECT_KEY`.
- A user only ever sees/posts on their own tickets (404 `TICKET_NOT_FOUND` otherwise). **Internal notes are never serialised on the user path** — filtered at the query level, and excluded from the user's message count.
- `assigneeId` must reference an ADMIN user — else 400 `INVALID_ASSIGNEE`.
- Attachment download URLs aren't signed yet — responses carry raw object keys (same interim state as KYC docs).

---

## 18. Reviews, Transactional Emails & Password Reset (Sprint 6)

### 18.1 Product reviews

One review per `(user, product)` — gated on having a `DELIVERED` order that contained the product. Reviews are **auto-published** on create; admin can hide a review by flipping `isApproved` to `false`.

```
# User — @Controller('reviews')
POST   /reviews/photos/presign  { contentType, contentLength }  → { uploadUrl, objectKey, expiresIn }
POST   /reviews            { productId, rating (1–5), text?, photos?: string[] (≤5) }
PATCH  /reviews/:id        { rating?, text?, photos? }              # owner-only
DELETE /reviews/:id        → 200 { id }                              # owner-only

# Public
GET /products/:slug/reviews?limit=&offset=
→ 200 {
    items: [{ id, userId, user: { id, name }, productId, rating, text, photos, photoUrls, isApproved, createdAt, updatedAt }],
    total, limit, offset,
    aggregate: { count, average }    # over isApproved=true reviews only
  }

# Admin — @Roles(ADMIN)
GET   /admin/reviews?productId=&isApproved=&limit=&offset=
PATCH /admin/reviews/:id   { isApproved: boolean }                   # hide / unhide
```

- Photo presign drops keys under `reviews/<callerId>/<uuid>.<ext>` — 5 MB cap, image/jpeg|png|webp only. Keys passed to `POST /reviews` / `PATCH /reviews/:id` must live under the caller's own prefix (else 400 `INVALID_OBJECT_KEY`).
- Eligibility check fails → 403 `REVIEW_NOT_ELIGIBLE`. Duplicate review → 409 `ALREADY_REVIEWED` (use `PATCH` to update).
- Owner-scoping: `PATCH/DELETE /reviews/:id` returns 404 `REVIEW_NOT_FOUND` for both unknown id and not-yours (no enumeration).
- Public `GET /products/:slug/reviews` returns only `isApproved = true` rows; the aggregate is computed over the same filter, not the current page. Unknown slug → 404 `PRODUCT_NOT_FOUND`.
- Admin mutations are auto-audited by the S5a `ActivityLogInterceptor`.

### 18.2 Password reset (email)

```
POST /auth/password/forgot   { email }
→ 200 { message: "If that email is registered, a reset link is on its way." }   # always 200

POST /auth/password/reset    { token, newPassword }   # newPassword regex matches /auth/register/email
→ 200 { message: "Password updated. Please sign in with the new password." }
→ 400 INVALID_RESET_TOKEN     # missing, expired, or already used
```

- Both endpoints are rate-limited 5/min (same bucket as the other `/auth/*` sensitive routes).
- `forgot` never reveals whether the email is registered — the response shape is constant. OAuth-only accounts (no password) and non-`ACTIVE` users silently fall through to the same 200.
- The reset link points at the customer web app: `${APP_WEB_URL}/reset-password?token=…`. The token is a 64-char hex string with a 30-min TTL stored in Redis under `pwreset:<token>`.
- Successful reset is single-use (token is consumed before the password update), calls `TokenService.revokeAllForUser` (every existing refresh token dies), and clears the password-failure lockout. The user must sign in again.

### 18.3 Transactional emails + unsubscribe

Outbound mail is fully queued — services enqueue typed jobs onto a BullMQ `email` queue, a worker renders Handlebars templates and ships them via Resend. No request path blocks on email.

| Event | Fires from | Template |
|---|---|---|
| User signed up | `POST /auth/register/email`, `POST /auth/google` (new user) | `welcome` |
| Email change requested | `PATCH /me/email` | `email-change` |
| Partner approved | `POST /admin/partners/:id/approve` | `partner-approved` |
| Partner rejected | `POST /admin/partners/:id/reject` | `partner-rejected` |
| Order confirmed | `PATCH /admin/orders/:id/status` → `CONFIRMED` | `order-confirmed` |
| Order shipped / delivered / cancelled | `PATCH /admin/orders/:id/status` → `SHIPPED` / `DELIVERED` / `CANCELLED` | `order-status-change` |
| Password reset requested | `POST /auth/password/forgot` | `password-reset` |

- The OTP signup branch (`POST /auth/otp/verify` first-signup) is phone-only — no welcome email there.
- `PENDING_PAYMENT` orders never email the customer; the first customer email arrives on the `→ CONFIRMED` transition.
- Every email carries a one-click unsubscribe link in the footer. Hitting it adds the address to a server-side suppression list — every future send for that address is silently dropped (logged as `email.suppressed`).

```
GET /email/unsubscribe?token=<signed-token>      # Public
→ 200 text/html   # confirmation page
→ 400 INVALID_UNSUBSCRIBE_TOKEN
```

The token is HMAC-signed with `EMAIL_UNSUBSCRIBE_SECRET` and carries the email itself — no DB lookup to verify, no expiry. Suppression is all-or-nothing for MVP (no per-template preferences).

---

## 19. What's NOT yet built (Sprint 7+)

Don't try these endpoints — they don't exist yet. Tracking shipped/not-shipped here so your Claude doesn't hallucinate them:

- **Live payment gateway** (Sprint 7+): orders sit at `PENDING_PAYMENT` until admin manually flips them to `CONFIRMED`. No Razorpay/Stripe yet.
- **Refund tracking** (post-payment-gateway): for MVP, returning an order just flips status — no refund record.
- **Live courier / 3PL tracking sync**: shipment tracking is manual admin entry only.
- **Signed download URLs for ticket attachments / KYC docs** — responses carry raw object keys for now.
- **Per-template unsubscribe preferences** — current suppression is all-or-nothing per email address.
- **`report.export.ready` email** — admins still poll `GET /admin/reports/exports/:id` (post-MVP).
- **Variant-specific image presign endpoint** — for now upload via the product presign and write keys into a variant via PATCH (see §7.6)
- **Public category image presign** — admin can attach an `imageObjectKey` to a category, but there's no dedicated presign endpoint; reuse the product flow's S3 bucket if you need to upload one
- **Real DLT-branded SMS sender** — currently using Fast2SMS `otp` route; you won't see your brand in the SMS yet
- **Signed-GET URLs for KYC docs** — admin UI shows objectKey only for now; ping backend if you need a signed URL endpoint

---

## 20. Quick reference — typical user flows

### Flow A — Email signup → first login → update profile
```
POST /auth/register/email     → user, accessToken, rt cookie
GET  /me                      → user (phoneRequired: true)
POST /me/phone/request-otp    → SMS sent
POST /me/phone/verify-otp     → user (phoneRequired: false)
PATCH /me                     → update name/profilePicUrl
```

### Flow B — Google signup → add phone → become partner
```
POST /auth/google             → user (phoneRequired: true)
POST /me/phone/request-otp    → SMS
POST /me/phone/verify-otp     → user with phone
POST /partners/upgrade        → kycStatus=PENDING, role still CUSTOMER
POST /partners/kyc-docs/presign  → S3 upload URL
PUT  <uploadUrl>              → upload doc directly to S3
POST /partners/kyc-docs/confirm  → register doc
... admin reviews ...
GET  /me                      → role=PARTNER, kycStatus=VERIFIED
```

### Flow C — Phone-only signup
```
POST /auth/otp/request                              → SMS sent
POST /auth/otp/verify { phone, code }               → 400 NAME_REQUIRED_FOR_SIGNUP
POST /auth/otp/verify { phone, code, name: 'X' }    → user, tokens
```

### Flow D — Admin approves a partner
```
(admin login via /auth/login/email)
GET  /admin/partners?status=PENDING       → list
GET  /admin/partners/:id                  → detail + kycDocuments
POST /admin/partners/:id/approve          → role=PARTNER, kycStatus=VERIFIED
```

### Flow E — Refresh on 401
```
(any request) → 401
POST /auth/refresh   (cookie sent automatically)    → new accessToken + rotated cookie
(replay the request with new accessToken)           → 200
```

If `/auth/refresh` itself returns 401 → user is logged out, redirect to login.

### Flow F — Catalog browse + PDP
```
GET /categories                                 → tree (cache it; 5min TTL on backend)
GET /products?category=smartphones&limit=24     → filtered list + facets
GET /products/:slug                             → product detail (pricing.basePrice + finalPrice + gst)
GET /products?search=iphone%20256gb             → tsvector ranked results (sort param ignored)
```

Catalog responses are identical for every role — cache freely on the frontend without per-role keying. Role-aware discounts will arrive via the Sprint-3 coupon engine, applied at cart time, not in the catalog payload.

### Flow G — Admin: build a product from scratch
```
POST /admin/categories  { name: 'Smartphones' }                          → category
POST /admin/products    { name: 'iPhone 15', categoryId, basePrice: ...  → product (DRAFT)
                          description, hsnCode: '8517' }
POST /admin/products/:id/variants  { sku: 'IP15-256', attributes: {...}  → variant
                                     priceOverride: ... }
POST /admin/products/:id/images/presign  { contentType, contentLength }  → uploadUrl + objectKey
PUT  <uploadUrl>  (binary body, same Content-Type)                       → S3 200
POST /admin/products/:id/images/confirm  { objectKeys: [...] }           → product.images updated
PATCH /admin/products/:id  { status: 'ACTIVE' }                          → product live
                                                                         → invalidates category cache + appears in /products
```

### Flow H — Admin: bulk CSV import
```
POST /admin/products/import  (multipart file=catalog.csv)                → { jobId }
loop:
  GET /admin/products/import/:jobId                                      → state in {waiting, active}
  sleep 1–2s
GET /admin/products/import/:jobId                                        → state='completed', result.{imported, skipped, errors[]}
                                                                         → render errors[] inline; user re-uploads a corrected CSV if needed
```

A `state='failed'` with non-null `failedReason` means the worker itself crashed (e.g. CSV header malformed). Distinguish from `state='completed' && errors.length > 0`, which is the normal partial-success path.

### Flow I — Customer applies a coupon
```
POST /cart/items { productId, qty: 1 }                                   → CartResponse with availableCoupons.customer on the line
PATCH /cart/items/:id { customerCouponApplied: true }                    → discount.customer, GST recomputed on lineSubtotal
PATCH /cart/items/:id { customerCouponApplied: false }                   → discount cleared
```

If the admin pauses or detaches the coupon mid-session, `GET /cart` returns the line with `discount.customer = 0` plus an entry in `staleApplications`. The DB flag stays `true` — the next `PATCH` call writes `false` to clean it up.

### Flow J — Verified partner stacks both coupons
```
PATCH /cart/items/:id { retailCouponApplied: true }                      → discount.retail (% off)
PATCH /cart/items/:id { customerCouponApplied: true }                    → discount.customer stacks on top
```
Math: `discountedUnit = max(0, basePrice × (1 − retailPct/100) − customerFixed)`.

### Flow K — Admin builds a coupon and attaches it
```
POST /admin/coupons { name: "New Year Sale", type: "CUSTOMER_FIXED" }   → { id, ... }
PUT  /admin/products/<id>/coupons/customer { couponId, value: 1000 }    → { slot: 'customer', value: 1000, ... }
GET  /products/<slug>                                                    → availableCoupons.customer now appears
```
Replace the slot by calling `PUT` again with a different `couponId`. Detach with `DELETE /admin/products/<id>/coupons/customer` (no-op if already empty).

### Flow L — Wishlist → Cart
```
POST /wishlist/items { productId }                                       → WishlistResponse
POST /wishlist/items/:id/move-to-cart { qty: 2 }                         → { cart: CartResponse, wishlist: WishlistResponse }
```
Atomic — if the cart write fails, the wishlist row stays.

### Flow M — Checkout end-to-end
```
POST /me/addresses { ... }                        → address.id
POST /cart/items   { productId, qty: 2 }          → cart populated
POST /checkout     { addressId, idempotencyKey }  → { orderId, orderNumber, status: 'PENDING_PAYMENT', grandTotal }
GET  /me/orders/:id                               → invoice.downloadUrl = null
... poll a few times (worker typically lands in ~1s) ...
GET  /me/orders/:id                               → invoice.downloadUrl = '<signed S3 URL, 5min TTL>'
GET  <downloadUrl>                                → application/pdf
```

If the user double-clicks "Place Order", reuse the same `idempotencyKey` — the second call returns the same `orderId` rather than charging twice.

### Flow N — Customer cancels within window
```
GET  /me/orders                                   → list
POST /me/orders/:id/cancel { reason: 'changed mind' }
                                                  → status='CANCELLED'; stock restored automatically
```
Refused with 409 `CANCEL_NOT_ALLOWED` once status passes `CONFIRMED` — show "contact support" instead.

### Flow O — Customer returns delivered order
```
GET  /me/orders/:id                               → status='DELIVERED', deliveredAt within last 7 days
POST /me/orders/:id/return-request
     { reason: 'DAMAGED', note: 'arrived cracked' }
                                                  → status='RETURN_REQUESTED'
```
After 7 days → 409 `RETURN_WINDOW_EXPIRED`. Stock is **not** restored at this step — admin completes the return via `→ RETURNED`.

### Flow P — Admin drives the order through to delivery
```
PATCH /admin/orders/:id/status { toStatus: 'CONFIRMED' }    → status='CONFIRMED'
PATCH /admin/orders/:id/status { toStatus: 'PROCESSING' }   → status='PROCESSING'
PATCH /admin/orders/:id/status { toStatus: 'SHIPPED' }      → status='SHIPPED'
PATCH /admin/orders/:id/status { toStatus: 'DELIVERED' }    → status='DELIVERED', deliveredAt set
```
Each call returns `{ status }`; refresh detail to get the updated `legalTransitions` for the next button.

### Flow Q — Admin completes a return
```
GET   /admin/orders?status=RETURN_REQUESTED              → list
PATCH /admin/orders/:id/status { toStatus: 'RETURNED' }  → status='RETURNED'; stock restored
```

### Flow R — Admin creates a phone order
```
POST /admin/orders
{
  userId: '<customer cuid>',
  addressId: '<one of their addresses>',
  items: [{ productId: '<id>', variantId: '<id>', qty: 1 }],
  idempotencyKey: '<uuid>'
}
                                                          → { orderId, orderNumber, status: 'PENDING_PAYMENT', grandTotal }
```
Customer sees this order under their own `/me/orders` next time they log in. Same idempotency rules as `/checkout`.

---

## 21. Local dev quick-start

If you want a local API instead of hitting production:

```bash
git clone git@github.com:Dextechlabs/cell-phone-nest.git
cd cell-phone-nest
docker compose up -d                         # postgres on :5433, redis on :6380
cd apps/api
cp .env.example .env                         # works as-is for local
pnpm install
pnpm prisma migrate deploy
pnpm db:seed                                 # creates 1 admin + 2 customers + 2 partners
pnpm start:dev                               # API on http://localhost:4000
```

**Seeded admin login:** `admin@cellphonecrowd.in` / `Admin@123` (use `POST /auth/login/email`).

OTPs in dev are mocked — when you call `/auth/otp/request`, the API logs `[OTP MOCK] phone=+91... code=123456` to the console. Read it from there instead of waiting for an SMS.
