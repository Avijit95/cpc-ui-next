# Cell Phone Crowd — API Integration Guide

**Audience:** Frontend / mobile developer integrating against the Cell Phone Crowd backend.
**Status:** Sprints 1, 1.5, **2 (Catalog)** shipped. Auth, Users, Partners + Admin, and the full Catalog (browse + admin CRUD + image upload + CSV import + tsvector search) are live in production.
**Base URL (prod):** `https://api.cpc24.co.in`
**Base URL (local dev):** `http://localhost:4000`
**Last updated:** 2026-05-06

> **For your Claude:** This doc is the single source of truth for what's currently shipped. Everything here is verified against the deployed code (commit `b6526b2`). Endpoints not listed here don't exist yet.

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

## 8. Error code catalogue

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

For codes not in this table (e.g. `Invalid credentials` 401, throttler 429, generic DTO 400 with array `message`), fall back to `error` + `message`.

---

## 9. What's NOT yet built (Sprint 3+)

Don't try these endpoints — they don't exist yet. Tracking shipped/not-shipped here so your Claude doesn't hallucinate them:

- **Cart + Coupons** (Sprint 3): `/cart`, `/cart/items`, `/cart/coupon`, `/wishlist/*`
- **Checkout + Orders + Invoices** (Sprint 4): `/checkout`, `/orders`, `/orders/:id`, `/invoices/:id/download`, address management
- **Admin operations** (Sprint 5): banners, support tickets, dashboard, reports, activity-logs, real `popular` sort on `/products`
- **Reviews** (Sprint 6): `/reviews`, `/products/:slug/reviews`
- **Welcome / order / partner-approved emails** (Sprint 6 — only email-change is wired today)
- **Variant-specific image presign endpoint** — for now upload via the product presign and write keys into a variant via PATCH (see §7.6)
- **Public category image presign** — admin can attach an `imageObjectKey` to a category, but there's no dedicated presign endpoint; reuse the product flow's S3 bucket if you need to upload one
- **Real DLT-branded SMS sender** — currently using Fast2SMS `otp` route; you won't see your brand in the SMS yet
- **Signed-GET URLs for KYC docs** — admin UI shows objectKey only for now; ping backend if you need a signed URL endpoint

---

## 10. Quick reference — typical user flows

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

---

## 11. Local dev quick-start

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
