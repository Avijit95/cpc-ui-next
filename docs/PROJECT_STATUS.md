# cpc-ui-next — Project Status

_Snapshot: 2026-05-08 · audited against the `cell-phone-nest` API after Sprint 3 close-out (commit `613b9ca`)._
_Last updated: 2026-05-08 (**all 5 phases of `tasks/sprint-3-ui-wiring.md` shipped** — public catalog + cart + wishlist + admin coupons + product↔coupon attach wired). Backend gaps surfaced during the wiring are tracked at `../../../docs/backend-gaps.md`._

This doc maps every endpoint the backend currently exposes to its wiring state in the UI, so we know what's safe to demo, what's still on mocks, and where Sprint 3's work hasn't reached the UI yet.

Legend: ✅ wired in UI · 🟡 client exists but UI still uses mocks · ❌ missing (no client, UI on mocks) · ➖ N/A

---

## TL;DR

| Sprint | Backend | UI Client | UI Pages |
|---|---|---|---|
| S1 — Auth / Me / Partners | ✅ shipped | ✅ full coverage | ✅ login, register, dealer KYC, admin partner approval all live |
| S2 / S2.5 — Catalog (admin) | ✅ shipped | ✅ full coverage | ✅ admin categories + products + variants + images + import all live |
| S2 / S2.5 — Catalog (public) | ✅ shipped | ✅ full coverage | ✅ **PLP, PDP, and home `ProductSection` wired to `catalogApi`** (Phase 1 — 2026-05-08) |
| **S3 — Cart** | ✅ shipped | ✅ `cartApi` | ✅ `/cart` wired (Phase 2 — 2026-05-08); Add to Cart on PDP + ProductCard wired |
| **S3 — Wishlist** | ✅ shipped | ✅ `wishlistApi` + `WishlistProvider` | ✅ `/wishlist` wired (Phase 3 — 2026-05-08); heart icons on PDP + ProductCard wired |
| **S3 — Coupons (admin)** | ✅ shipped | ✅ `adminApi` | ✅ `/admin/pricing` Coupons tab wired (Phase 4 — 2026-05-08) |
| **S3 — PricingService** | ✅ embedded in `/products` + `/cart` responses | ➖ no separate client needed | ❌ UI never reads `finalPrice` because PLP/PDP aren't calling `/products` |

**The headline gap:** Sprint 3 backend (cart, wishlist, coupons, pricing-aware product responses) is fully shipped server-side, but **none of it is wired in the UI**. There are no API client modules for cart/wishlist/coupons, and the public catalog client that does exist (`catalogApi`) has zero callers.

---

## 1. Backend endpoint inventory

Pulled from `apps/api/src/modules/*/*.controller.ts`. 56 endpoints across 9 modules.

### Auth (`auth.controller.ts`) — Sprint 1
| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/otp/request` | Send OTP to phone |
| POST | `/auth/otp/verify` | Verify OTP, signup or login |
| POST | `/auth/google` | Google ID-token login |
| POST | `/auth/register/email` | Email/password signup |
| POST | `/auth/login/email` | Email/password login |
| POST | `/auth/refresh` | Rotate refresh, return new access |
| POST | `/auth/logout` | Revoke current session |
| POST | `/auth/logout-all` | Revoke all sessions for user |

### Me (`users.controller.ts`) — Sprint 1
| Method | Path | Purpose |
|---|---|---|
| GET | `/me` | Current user |
| PATCH | `/me` | Update name / profilePicUrl |
| PATCH | `/me/email` | Request email-change confirmation |
| POST | `/me/email/confirm` | Confirm email change with token |
| POST | `/me/profile-pic/presign` | Presign S3 PUT for profile pic |
| POST | `/me/phone/request-otp` | Request OTP for adding/changing phone |
| POST | `/me/phone/verify-otp` | Verify OTP, attach phone to user |

### Partners (`partners.controller.ts`) — Sprint 1
| Method | Path | Purpose |
|---|---|---|
| POST | `/partners/upgrade` | Apply for partner status (companyName, GST) |
| POST | `/partners/kyc-docs/presign` | Presign S3 PUT for KYC doc |
| POST | `/partners/kyc-docs/confirm` | Attach uploaded docs to application |

### Admin Partners (`admin-partners.controller.ts`) — Sprint 1
| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/partners` | List partner applications |
| GET | `/admin/partners/:id` | One application + KYC docs |
| POST | `/admin/partners/:id/approve` | Approve → role=PARTNER |
| POST | `/admin/partners/:id/reject` | Reject with reason |

### Catalog public (`public-*.controller.ts`) — Sprint 2 / 2.5
| Method | Path | Purpose |
|---|---|---|
| GET | `/categories` | Tree of categories |
| GET | `/products` | Filter/sort/paginate products + facets |
| GET | `/products/:slug` | PDP detail (uses `OptionalJwtAuthGuard` to unlock partner-coupon visibility via PricingService) |

### Catalog admin (`admin-*.controller.ts`) — Sprint 2 / 2.5
| Method | Path | Purpose |
|---|---|---|
| GET / POST / PATCH / DELETE | `/admin/categories[/:id]` | CRUD categories |
| GET / POST / PATCH | `/admin/products[/:id]` | CRUD products (no DELETE — archive instead) |
| POST | `/admin/products/:id/archive` | Soft-archive |
| POST / PATCH / DELETE | `/admin/products/:productId/variants[/:variantId]` | CRUD variants |
| POST | `/admin/products/:productId/images/presign` | Presign S3 PUT |
| POST | `/admin/products/:productId/images/confirm` | Persist objectKeys + sort order |
| POST | `/admin/products/import` | Multipart CSV → BullMQ job |
| GET | `/admin/products/import/:jobId` | Poll job state / progress |

### Cart (`cart.controller.ts`) — **Sprint 3**
| Method | Path | Purpose |
|---|---|---|
| GET | `/cart` | View cart with PricingService-resolved totals |
| POST | `/cart/items` | Add (or merge by variant) |
| PATCH | `/cart/items/:id` | Update qty |
| DELETE | `/cart/items/:id` | Remove line |

### Wishlist (`wishlist.controller.ts`) — **Sprint 3**
| Method | Path | Purpose |
|---|---|---|
| GET | `/wishlist` | View wishlist |
| POST | `/wishlist/items` | Add product/variant |
| DELETE | `/wishlist/items/:id` | Remove |
| POST | `/wishlist/items/:id/move-to-cart` | One-shot move with qty |

### Coupons (`admin-*.controller.ts`) — **Sprint 3**
| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/coupons` | List with filters |
| GET | `/admin/coupons/:id` | Detail |
| POST | `/admin/coupons` | Create |
| PATCH | `/admin/coupons/:id` | Update |
| DELETE | `/admin/coupons/:id` | Delete |
| PUT | `/admin/products/:id/coupons/:type` | Attach customer/retail coupon to product |
| DELETE | `/admin/products/:id/coupons/:type` | Detach |

### Pricing (`pricing.service.ts`) — **Sprint 3**
No controller. PricingService is consumed server-side by `/products`, `/products/:slug`, and `/cart` so their response payloads carry `basePrice`, `finalPrice`, GST info, applied coupons, etc. The UI just needs to call those endpoints and render the fields.

### Health
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness (db + redis) |

---

## 2. UI client coverage (`src/lib/api`)

| Module | File | Status | Notes |
|---|---|---|---|
| `authApi` | `endpoints/auth.ts` | ✅ all 8 endpoints | Used by `AuthProvider`, `/login`, `/admin/login`, `/dealer/register` |
| `meApi` | `endpoints/me.ts` | ✅ all 7 + `uploadProfilePic` helper | Used by `AuthProvider` |
| `partnersApi` | `endpoints/partners.ts` | ✅ all 3 + `uploadKycDoc` helper | Used by `/dealer/register` |
| `adminApi` | `endpoints/admin.ts` | ✅ partners + categories + products + variants + images + import | Used by all `/admin/*` CRUD pages |
| `catalogApi` | `endpoints/catalog.ts` | ✅ all 3 public endpoints typed | Used by `/products`, `/products/[slug]`, `ProductSection` |
| `healthApi` | `endpoints/health.ts` | ✅ | Not currently called from any page |
| `cartApi` | `endpoints/cart.ts` | ✅ all 4 endpoints typed | No callers yet — Phase 2 |
| `wishlistApi` | `endpoints/wishlist.ts` | ✅ all 4 endpoints typed | No callers yet — Phase 3 |
| `adminApi` (coupons) | `endpoints/admin.ts` | ✅ list/get/create/update/delete + product-coupon attach/detach | No callers yet — Phase 4 / 5 |

Types in `lib/api/types.ts` cover auth/me/partners/admin/catalog/cart/wishlist/coupons.

---

## 3. Page-level wire-up

### Customer-facing
| Route | API used | Status | Notes |
|---|---|---|---|
| `/` (home) | `catalogApi.listProducts` (in `ProductSection`) | 🟡 | `ProductSection` wired (BESTSELLING→`popular`, NEW ARRIVALS→`newest`; FEATURED + TOP BRANDS tabs hidden — no API). `HeroBanner`, `DealsSection`, `BrandSection`, `CategorySection` still static |
| `/products` (PLP) | `catalogApi.listProducts(query)` | ✅ | Single-select category + brand (radios). Brand list is dynamic from `facets.brands`. Price slider → `priceMax`. Sort: Featured / Price asc / Price desc / Newest. Skeleton grid loading. "Top Rated" sort + rating filter hidden (no reviews API) |
| `/products/[slug]` (PDP) | `catalogApi.getProduct(slug)` | ✅ | URL switched from `/products/<id>` to `/products/<slug>`. Image gallery uses `images[]` sorted by `sortOrder`. Description from `product.description`, specs from `product.specs`. Reviews tab still uses `mockReviews` block (no API). Add to Cart / Buy Now / Wishlist buttons remain non-functional pending Phases 2–3 |
| `/cart` | `cartApi.{view,addItem,updateItem,removeItem}` | ✅ | Auth-gated → redirects to `/login?next=/cart`. Optimistic qty updates with rollback. Per-line coupon chips driven by `availableCoupons` / `appliedCoupons` (PATCH with `customerCouponApplied`/`retailCouponApplied`). Summary uses API `subtotal`/`discountTotal`/`gstTotal`/`grandTotal`. Stock warnings + stale-application banner from API. **Known gap:** API doesn't return product image on cart line — UI shows gray placeholder box. Add to Cart on PDP + ProductCard quick-add wired with inline 'Added ✓' confirmation; logged-out clicks redirect to `/login?next=<current>` |
| `/wishlist` | `wishlistApi.{view,addItem,removeItem,moveToCart}` | ✅ | Auth-gated → redirects to `/login?next=/wishlist`. Tile shape uses live API (`primaryImageUrl`, `finalPrice`/`basePrice`, `brand` label, `badges[0]`). Move-to-cart shows inline "Moved ✓" then tile leaves the grid. Clear All triggers a confirm modal then fans out N parallel `removeItem` calls. State synced via `WishlistProvider` so heart icons stay accurate across surfaces |
| `/login` | `authApi.requestOtp/verifyOtp/loginEmail/google` | ✅ | |
| `/dealer/register` | `authApi` + `partnersApi.upgrade` | ✅ | |
| `/dealer` (dashboard) | none | ❌ | All static; no partner-dashboard endpoints in S1–S3 anyway |
| `/account` | `useAuth()` (→ `meApi.get`) | 🟡 | Profile is live; "recent orders" hard-coded `[]` (orders endpoints aren't shipped) |
| `/account/orders` | none | ❌ | No orders API exists yet |
| `/account/addresses` | none | ❌ | No addresses API exists yet |
| `/invoice` | none | ❌ | Static demo |

### Admin
| Route | API used | Status | Notes |
|---|---|---|---|
| `/admin` (dashboard) | none | ❌ | Static stats |
| `/admin/login` | `authApi.loginEmail` | ✅ | |
| `/admin/users` | `adminApi.listPartners/approvePartner/rejectPartner` | ✅ | |
| `/admin/categories` (+ add/edit) | `adminApi.{list,get,create,update,delete}Category` | ✅ | |
| `/admin/products` (+ add/edit) | `adminApi.{list,get,create,update,archive}Product` + variant + image presign/confirm | ✅ | |
| `/admin/pricing` | `adminApi.{listCoupons,createCoupon,updateCoupon,deleteCoupon}` | ✅ | Coupons tab is fully live: list with skeleton loading, Create / Edit modals (Type immutable on Edit per server `COUPON_TYPE_IMMUTABLE`), Delete with confirm modal that also surfaces `COUPON_HAS_ATTACHMENTS`. Stat cards swapped to Total / Active / Paused. Pricing rules + Campaigns tabs disabled with "Coming in Sprint 4+" tooltip (no API). Coupons table preserves all original columns; fields the API doesn't expose (Value / Min Order / Usage / Expires) render as em-dash |
| `/admin/products/[id]/edit` | `adminApi.{attachProductCoupon,detachProductCoupon}` (in addition to the product CRUD wiring) | ✅ | New `<CouponAttachments>` sibling section below `ProductForm`. Two slots (Customer / Partner). Each shows currently-attached coupon via a client-side scan (see `backend-gaps.md` §2). Dropdown filtered to ACTIVE coupons of matching type, value input enforces customer > 0 and 0 < retail ≤ 100. Replaces existing slot atomically on attach |
| `/admin/orders` | none | ❌ | No orders API yet |
| `/admin/invoices` | none | ❌ | No invoices API yet |
| `/admin/analytics` | none | ❌ | No analytics API yet |
| `/admin/cms` | none | ❌ | No CMS API yet |
| `/admin/logs` | none | ❌ | No logs API yet |
| `/admin/support` | none | ❌ | No support API yet |

---

## 4. Sprint 3 status (the headline)

| S3 deliverable | API | UI client | UI page |
|---|---|---|---|
| Cart CRUD | ✅ `/cart`, `/cart/items*` | ✅ | ✅ `/cart` |
| Wishlist CRUD + move-to-cart | ✅ `/wishlist*` | ✅ | ✅ `/wishlist` |
| Admin coupons CRUD | ✅ `/admin/coupons*` | ✅ | ✅ `/admin/pricing` (Coupons tab) |
| Product↔coupon attach | ✅ `/admin/products/:id/coupons/:type` | ✅ | ✅ inside `/admin/products/[id]/edit` |
| PricingService output (basePrice/finalPrice/discount) | ✅ embedded in `/products`, `/products/:slug`, `/cart` | ➖ (no separate client) | ✅ — surfaced via `ListCard.finalPrice`, `ProductDetail.pricing`, `CartView` summary |

**Sprint 3 UI catch-up complete (Phases 1–5 done).** Every Sprint 1–3 backend endpoint is now reachable from the UI. Backend gaps surfaced during the catch-up are tracked in `../../../docs/backend-gaps.md`.

---

## 5. Wiring order (live status)

To unblock end-to-end S3 demos with the smallest blast radius:

1. ~~**Wire PLP + PDP to `catalogApi`.**~~ **✅ Done (Phase 1, 2026-05-08).** PDP routes by slug now. `ProductCard` consumes `ListCard` shape. Home `ProductSection` wired. Visual decisions made: rating row kept as gray-star placeholder; brand label replaces category label on cards; PLP filters single-select; rating filter and "Top Rated" sort hidden until reviews API ships.
2. ~~**Add `cartApi` and wire `/cart`.**~~ **✅ Done (Phase 2, 2026-05-08).** Cart page reads from `cartApi.view`, qty +/- optimistic with rollback, per-line coupon chips replace the old textbox, summary uses API totals. Add to Cart wired on PDP and ProductCard with inline 'Added ✓' confirmation. Auth gate redirects to `/login?next=...`.
3. ~~**Add `wishlistApi` and wire `/wishlist`.**~~ **✅ Done (Phase 3, 2026-05-08).** New `WishlistProvider` (loads on auth, exposes `isWishlisted` + `add`/`remove`). Heart icons on PDP and ProductCard reflect real wishlist membership and toggle via the provider. `/wishlist` page reads from the provider, has a confirm-modal Clear-All, and a Move-to-Cart that uses `wishlistApi.moveToCart` (returns updated cart + wishlist).
4. ~~**Add `couponsApi` (admin) and wire `/admin/pricing`.**~~ **✅ Done (Phase 4, 2026-05-08).** Coupons tab CRUD wired with create/edit modal (type immutable on edit) and delete-confirm modal (surfaces `COUPON_HAS_ATTACHMENTS`). Stat cards now show Total / Active / Paused. Pricing rules and Campaigns tabs disabled with "Coming in Sprint 4+" tooltip.
5. ~~**Product↔coupon attach inside `/admin/products/[id]/edit`.**~~ **✅ Done (Phase 5, 2026-05-08).** New `<CouponAttachments>` component with two slots (Customer ₹ / Partner %), dropdown of ACTIVE coupons per type, value input with bounds, attach/detach + currently-attached display. Backend gaps logged in `docs/backend-gaps.md`.

Items 2–3 likely belong inside an "S3 UI catch-up" sprint before any new backend work, since right now there is no path for a customer to actually *use* anything from S3.

---

## 6. Out-of-scope for current backend

These pages are already built in the UI but have **no backend** at all (S4+ territory):
- `/account/orders`, `/admin/orders`, `/admin/invoices`, `/invoice` — no orders/invoices API
- `/account/addresses` — no addresses API
- `/admin/analytics`, `/admin/cms`, `/admin/logs`, `/admin/support` — no APIs
- `/dealer` (partner dashboard) — partner-side read endpoints not yet shipped

Worth keeping these in the doc so we don't mistakenly count them as "UI gaps" — they're "API gaps" still ahead of the UI.
