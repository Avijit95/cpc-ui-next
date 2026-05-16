# cpc-ui-next — Project Status

_Snapshot: 2026-05-16 · audited against the `cell-phone-nest` API after Sprint 6 close-out (commit `8e13c75`)._
_Last updated: 2026-05-16. **S4–S6 UI catch-up complete** (Phases 6–11 shipped 2026-05-15 → 2026-05-16). The UI is now wired end-to-end against every shipped backend surface. Backend gaps surfaced during S3 wiring are tracked at `../../../docs/backend-gaps.md`._

This doc maps every endpoint the backend currently exposes to its wiring state in the UI, so we know what's safe to demo, what's still on mocks, and where backend work hasn't reached the UI yet.

For request/response shapes, error codes, and end-to-end flows, see the integration guide at `../api-integration.md` (synced from `cell-phone-nest/docs/api-integration.md` on 2026-05-15).

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
| **S3 — PricingService** | ✅ embedded in `/products` + `/cart` responses | ➖ no separate client needed | ✅ `finalPrice` surfaced via `ListCard`, `ProductDetail.pricing`, and `CartView` summary |
| **S4 — Orders / Addresses / Invoices** | ✅ shipped 2026-05-14 | ✅ `addressesApi`, `ordersApi`, `invoicesApi`, `checkoutApi` | ✅ `/account/orders` + `/account/orders/[id]` + `/account/addresses` + `/checkout` + `/admin/orders` + `/admin/orders/[id]` all wired |
| **S5a — Admin Ops** | ✅ shipped 2026-05-14 | ✅ extended `adminApi` (+14 methods) | ✅ `/admin` dashboard live, `/admin/analytics` reports + exports live, `/admin/logs` activity feed live, `/admin/users` extended with role/suspend |
| **S5b — CMS / Support / Shipping** | ✅ shipped 2026-05-14 | ✅ `bannersApi` + `ticketsApi` + admin extensions | ✅ home `HeroBanner` consumes `/banners/active`; `/admin/cms` full CRUD; `/admin/support` + `/account/support` ticket flow wired |
| **S6 — Reviews + Transactional Emails + Password Reset** | ✅ shipped 2026-05-15 | ✅ `reviewsApi` + auth `passwordForgot`/`passwordReset` | ✅ PDP reviews tab live; PDP + ProductCard rating shows live aggregate; `/forgot-password` + `/reset-password` flow wired |

**Status (2026-05-16):** S4–S6 UI catch-up complete. Every shipped backend endpoint now has a UI surface. Outstanding work is now polish + the remaining genuine backend gaps in Section 6.

---

## 1. Backend endpoint inventory

Pulled from `apps/api/src/modules/*/*.controller.ts`. ~100 endpoints across 34 controllers after S4–S6.

### Auth (`auth.controller.ts`) — Sprint 1 (+ password reset in Sprint 6)
| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/otp/request` | Send OTP to phone |
| POST | `/auth/otp/verify` | Verify OTP, signup or login |
| POST | `/auth/google` | Google ID-token login |
| POST | `/auth/register/email` | Email/password signup |
| POST | `/auth/login/email` | Email/password login |
| POST | `/auth/password/forgot` | **S6** — request password-reset email |
| POST | `/auth/password/reset` | **S6** — consume reset token, revoke all sessions |
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

### Addresses (`addresses.controller.ts`) — **Sprint 4**
| Method | Path | Purpose |
|---|---|---|
| GET | `/me/addresses` | List user's addresses |
| POST | `/me/addresses` | Create address |
| PATCH | `/me/addresses/:id` | Update address |
| POST | `/me/addresses/:id/set-default` | Make this the default (one-default-per-user) |
| DELETE | `/me/addresses/:id` | Delete address |

### Checkout (`checkout.controller.ts`) — **Sprint 4**
| Method | Path | Purpose |
|---|---|---|
| POST | `/checkout` | Locks stock + creates Order/Invoice in a serializable tx (idempotency-keyed) |

### Customer orders (`me-orders.controller.ts` + `me-invoices.controller.ts`) — **Sprint 4**
| Method | Path | Purpose |
|---|---|---|
| GET | `/me/orders` | Paginated list with status filter |
| GET | `/me/orders/:id` | Full detail + signed `invoice.downloadUrl` |
| POST | `/me/orders/:id/cancel` | Customer self-cancel (PENDING_PAYMENT/CONFIRMED only) |
| POST | `/me/orders/:id/return-request` | DELIVERED + ≤7 days |
| GET | `/me/invoices/:id/download` | Signed S3 URL (5-min TTL) |

### Admin orders (`admin-orders.controller.ts`) — **Sprint 4**
| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/orders` | List with filters (status, userId, q, dates) |
| GET | `/admin/orders/:id` | Detail + `legalTransitions[]` |
| PATCH | `/admin/orders/:id/status` | State-machine validated transition |
| POST | `/admin/orders` | Manual order creation (idempotency-keyed) |
| POST | `/admin/orders/:id/regenerate-invoice` | Re-enqueue PDF worker |

### Activity Log (`activity-log.controller.ts`) — **Sprint 5a**
| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/activity-logs` | Filterable audit trail of admin mutations |

### Admin Users (`admin-users.controller.ts`) — **Sprint 5a**
| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/users` | List users |
| GET | `/admin/users/:id` | User detail |
| PATCH | `/admin/users/:id/role` | Change role |
| PATCH | `/admin/users/:id/status` | Suspend / unsuspend |

### Admin Dashboard + Reports (`admin-dashboard.controller.ts`, `admin-reports.controller.ts`, `report-export.controller.ts`) — **Sprint 5a**
| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/dashboard` | Today's orders, revenue, pending partners, low-stock |
| GET | `/admin/reports/sales` | Date-range + group by day/week/month |
| GET | `/admin/reports/partners` | Partner performance |
| GET | `/admin/reports/products` | Top sellers, slow movers |
| POST | `/admin/reports/{sales,partners,products}/export` | Enqueue CSV export |
| GET | `/admin/reports/exports` | List async export jobs |
| GET | `/admin/reports/exports/:id` | Poll one export's state |

### Banners (`banners.controller.ts`, `admin-banners.controller.ts`) — **Sprint 5b**
| Method | Path | Purpose |
|---|---|---|
| GET | `/banners/active` | Public banners filtered by schedule window |
| POST | `/admin/banners/presign` | Presign S3 PUT for banner image |
| GET / POST / PATCH / DELETE | `/admin/banners[/:id]` | Banner CRUD |

### Shipping + Delivery Zones (`shipping.controller.ts`, `admin-delivery-zones.controller.ts`) — **Sprint 5b**
| Method | Path | Purpose |
|---|---|---|
| GET | `/shipping/quote` | Quote shipping for an address/cart |
| GET / POST / PATCH / DELETE | `/admin/delivery-zones[/:id]` | Zone CRUD (flat rate + free-ship threshold) |

### Support Tickets (`support.controller.ts`, `admin-support.controller.ts`) — **Sprint 5b**
| Method | Path | Purpose |
|---|---|---|
| POST | `/me/tickets/attachments/presign` | Presign S3 PUT |
| GET / POST | `/me/tickets` | List own / create |
| GET | `/me/tickets/:id` | View own (internal notes filtered out) |
| POST | `/me/tickets/:id/messages` | Reply on own ticket |
| GET | `/admin/tickets` | List all (filter by status/assignee) |
| GET | `/admin/tickets/:id` | Full thread |
| PATCH | `/admin/tickets/:id` | Update status / assignee |
| POST | `/admin/tickets/:id/messages` | Post reply or internal note |

### Reviews (`reviews.controller.ts`, `product-reviews.controller.ts`, `admin-reviews.controller.ts`) — **Sprint 6**
| Method | Path | Purpose |
|---|---|---|
| POST | `/reviews/photos/presign` | Presign S3 PUT for review photos |
| POST | `/reviews` | Create review (DELIVERED-order eligibility) |
| PATCH | `/reviews/:id` | Owner edit |
| DELETE | `/reviews/:id` | Owner delete |
| GET | `/products/:slug/reviews` | Paginated list + `aggregate: { count, average }` |
| GET | `/admin/reviews` | Admin moderation list |
| PATCH | `/admin/reviews/:id` | Hide / unhide via `isApproved` |

### Email infra (`email.controller.ts`) — **Sprint 6**
| Method | Path | Purpose |
|---|---|---|
| GET | `/email/unsubscribe` | One-click unsubscribe (HMAC token) |

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
| `addressesApi` | `endpoints/addresses.ts` | ✅ all 5 endpoints | Used by `/account/addresses` + `/checkout` |
| `checkoutApi` | `endpoints/checkout.ts` | ✅ `submit({ addressId, idempotencyKey })` | Used by `/checkout` |
| `ordersApi` (customer) | `endpoints/orders.ts` | ✅ list/get/cancel/returnRequest | Used by `/account/orders` + `/account/orders/[id]` |
| `invoicesApi` | `endpoints/invoices.ts` | ✅ `download(id)` | Available; order-detail page reads `invoice.downloadUrl` directly |
| `adminApi` (orders) | `endpoints/admin.ts` | ✅ list/get/patchStatus/regenerateInvoice | Used by `/admin/orders` + `/admin/orders/[id]` |
| `adminApi` (activity logs / users / dashboard / reports + exports) | `endpoints/admin.ts` | ✅ all S5a endpoints (+14 methods) | Used by `/admin` dashboard, `/admin/analytics`, `/admin/logs`, `/admin/users` |
| `bannersApi` | `endpoints/banners.ts` | ✅ `getActive` (public) | Used by `HeroBanner` |
| `adminApi` (banners) | `endpoints/admin.ts` | ✅ CRUD + presign + `uploadBannerImage` helper | Used by `/admin/cms` |
| `ticketsApi` (customer) | `endpoints/tickets.ts` | ✅ list/get/create/postMessage/presignAttachment | Used by `/account/support` + `/account/support/[id]` |
| `adminApi` (tickets) | `endpoints/admin.ts` | ✅ list/get/updateTicket/postTicketMessage | Used by `/admin/support` |
| `authApi` (password reset) | `endpoints/auth.ts` | ✅ `passwordForgot` + `passwordReset` | Used by `/forgot-password` + `/reset-password` |
| `reviewsApi` | `endpoints/reviews.ts` | ✅ list/create/update/remove/presignPhoto | Used by `/products/[slug]` Reviews tab |
| `shippingApi` (cart quote) | — | ❌ not yet | S5b shipped; cart summary doesn't surface shipping yet (deferred polish) |
| `emailApi` (unsubscribe) | — | ❌ not yet | `GET /email/unsubscribe` is hit by the one-click footer link in emails — no in-app surface needed |

Types in `lib/api/types.ts` cover the full shipped backend surface: auth, me, partners, admin (partners + categories + products + variants + images + import + coupons + orders + banners + activity logs + admin users + dashboard + reports + exports + tickets), catalog, cart, wishlist, addresses, orders, invoices, checkout, banners, reviews, tickets, password reset.

---

## 3. Page-level wire-up

### Customer-facing
| Route | API used | Status | Notes |
|---|---|---|---|
| `/` (home) | `catalogApi.listProducts` + `bannersApi.getActive` | ✅ | `ProductSection` wired (BESTSELLING→`popular`, NEW ARRIVALS→`newest`). `HeroBanner` consumes `/banners/active` with two slots (`home_hero`, `home_side`); falls back to static design when no banners are configured. `DealsSection`, `BrandSection`, `CategorySection` still static |
| `/products` (PLP) | `catalogApi.listProducts(query)` | ✅ | Single-select category + brand (radios). Brand list is dynamic from `facets.brands`. Price slider → `priceMax`. Sort: Featured / Price asc / Price desc / Newest. Skeleton grid loading. "Top Rated" sort + rating filter hidden (`GET /products` doesn't expose per-product aggregates yet — see `backend-gaps.md` §5 follow-up) |
| `/products/[slug]` (PDP) | `catalogApi.getProduct(slug)` + `reviewsApi.listForProduct(slug)` | ✅ | Image gallery, description, specs, breadcrumbs, variants all live. Rating row reads `reviewsResp.aggregate` (live count + average). Reviews tab shows aggregate header, write/edit/delete-your-review CTA (auth gated), inline 5-star form, real review list with photo thumbnails |
| `/cart` | `cartApi.{view,addItem,updateItem,removeItem}` | ✅ | Auth-gated → redirects to `/login?next=/cart`. Optimistic qty updates with rollback. Per-line coupon chips driven by `availableCoupons` / `appliedCoupons` (PATCH with `customerCouponApplied`/`retailCouponApplied`). Summary uses API `subtotal`/`discountTotal`/`gstTotal`/`grandTotal`. Stock warnings + stale-application banner from API. **Known gap:** API doesn't return product image on cart line — UI shows gray placeholder box. Add to Cart on PDP + ProductCard quick-add wired with inline 'Added ✓' confirmation; logged-out clicks redirect to `/login?next=<current>` |
| `/wishlist` | `wishlistApi.{view,addItem,removeItem,moveToCart}` | ✅ | Auth-gated → redirects to `/login?next=/wishlist`. Tile shape uses live API (`primaryImageUrl`, `finalPrice`/`basePrice`, `brand` label, `badges[0]`). Move-to-cart shows inline "Moved ✓" then tile leaves the grid. Clear All triggers a confirm modal then fans out N parallel `removeItem` calls. State synced via `WishlistProvider` so heart icons stay accurate across surfaces |
| `/login` | `authApi.requestOtp/verifyOtp/loginEmail/google` | ✅ | |
| `/dealer/register` | `authApi` + `partnersApi.upgrade` | ✅ | |
| `/dealer` (dashboard) | none | ❌ | All static; no partner-dashboard endpoints in S1–S3 anyway |
| `/account` | `useAuth()` (→ `meApi.get`) | 🟡 | Profile is live. The "recent orders" widget on the dashboard still hard-codes `[]` — could be wired to `ordersApi.list({ limit: 3 })` as polish |
| `/account/orders` | `ordersApi.list` | ✅ | Status filter chips (9 options), 20/page pagination, loading skeleton, empty state, real product thumbnails via `primaryImageUrl`. Rows link to detail |
| `/account/orders/[id]` | `ordersApi.{get,cancel,returnRequest}` | ✅ | Items table with HSN/GST split, shipping address snapshot, status history timeline, invoice download with auto-polling (1.5s × 20). Cancel modal (allowed in `PENDING_PAYMENT` / `CONFIRMED`). Return modal (allowed when `DELIVERED` AND ≤7 days from `deliveredAt`) |
| `/account/addresses` | `addressesApi.{list,create,update,setDefault,remove}` | ✅ | Auth-gated. Loading skeleton, empty state, Add/Edit modal with `<select>` of 35 ISO 3166-2:IN state codes (defaulted to WB per [[project_seller_state]]), set-default with optimistic flip + rollback, delete with confirm modal (surfaces `ADDRESS_IN_USE` 409) |
| `/checkout` | `cartApi.view` + `addressesApi.list` + `addressesApi.create` + `checkoutApi.submit` | ✅ | Parallel cart + addresses load, default address auto-picked, inline "Add new address" modal, UUID idempotency key generated once per page mount. Stale-coupon + stock-warning preflight banners. Place Order → `router.replace('/account/orders/<id>')` on success. `STOCK_INSUFFICIENT` 409 best-effort-parses shortages list from message |
| `/invoice` | (redirect helper) | ✅ | Repurposed from static demo. `?orderId=X` query → redirects to `/account/orders/X#invoice`. No-arg fallback shows "Go to My Orders" CTA |
| `/account/support` + `/account/support/[id]` | `ticketsApi.{list,get,create,postMessage}` | ✅ | List page with status badges + reply count + "New Ticket" modal. Detail page shows chat-style thread (initial body + replies); reply box disabled when ticket is `RESOLVED`/`CLOSED` |
| `/forgot-password` | `authApi.passwordForgot` | ✅ | Email input → constant-shape success message. Linked from `/login`'s "Forgot password?" |
| `/reset-password?token=X` | `authApi.passwordReset` | ✅ | Token from query string, new-password validation (≥8 + uppercase + digit, matches register-email rule), success → `router.replace('/login')` |
| Cart shipping line | none | ❌ | `GET /shipping/quote` (S5b) exists but cart summary doesn't surface a shipping line yet (deferred polish — `shippingTotal` lands on order post-commit) |

### Admin
| Route | API used | Status | Notes |
|---|---|---|---|
| `/admin` (dashboard) | `adminApi.{getDashboard,listOrders}` | ✅ | Today's orders + revenue, MTD revenue, pending partners, top-5 products, low-stock alerts panel, recent-5-orders table |
| `/admin/login` | `authApi.loginEmail` | ✅ | |
| `/admin/users` | `adminApi.listAdminUsers/patchUserRole/patchUserStatus` + partner-approval | ✅ | Customers tab: real `listAdminUsers({ role: 'CUSTOMER' })`. Admins tab: `role: 'ADMIN'`. Partners tab: kept from S1. Suspend/Unsuspend + Make-admin/Demote actions with self-edit guard |
| `/admin/categories` (+ add/edit) | `adminApi.{list,get,create,update,delete}Category` | ✅ | |
| `/admin/products` (+ add/edit) | `adminApi.{list,get,create,update,archive}Product` + variant + image presign/confirm | ✅ | |
| `/admin/pricing` | `adminApi.{listCoupons,createCoupon,updateCoupon,deleteCoupon}` | ✅ | Coupons tab live with full CRUD. Pricing rules + Campaigns tabs disabled — no API |
| `/admin/products/[id]/edit` | `adminApi.{attachProductCoupon,detachProductCoupon}` + product CRUD | 🟡 | `<CouponAttachments>` works but still uses the client-side coupon scan (see `backend-gaps.md` §2 — resolved). Swap for the inline `coupons` payload as polish |
| `/admin/orders` | `adminApi.listOrders` | ✅ | Real list with 4 server-side filters (status, q-prefix, from, to), clickable summary cards, pagination, parallel count fetches per status |
| `/admin/orders/[id]` | `adminApi.{getOrder,patchOrderStatus,regenerateInvoice}` | ✅ | State-machine action buttons driven by `legalTransitions[]`, transition modal (note required on `→ CANCELLED`), invoice download + regenerate, items table, address snapshot, status history |
| `/admin/invoices` | (pointer page) | ✅ | Collapsed to a pointer card CTA → `/admin/orders` (invoice data lives on Order; no standalone endpoint) |
| `/admin/analytics` | `adminApi.{getSalesReport,getPartnersReport,getProductsReport,enqueue*Export,listReportExports,getReportExport}` | ✅ | 3 tabs (Sales/Partners/Products), date range filters, group-by/sort selectors, CSS bar chart, full report tables, async CSV export with optimistic enqueue + background poll, Recent exports panel |
| `/admin/cms` | `adminApi.{listBanners,createBanner,updateBanner,deleteBanner,uploadBannerImage,presignBanner}` | ✅ | Full banner CRUD grouped by position, image upload via presign + S3 PUT, datetime-local active window, active toggle, delete-with-confirm |
| `/admin/logs` | `adminApi.listActivityLogs` | ✅ | Paginated feed (25/page), filters: action substring + target type + from/to date, collapsible rows showing target/IP/UA/diff JSON |
| `/admin/support` | `adminApi.{listTickets,getTicket,updateTicket,postTicketMessage}` | ✅ | Two-pane layout. Status filter cards, ticket list, full thread, status `<select>`, reply box with optional internal-note toggle |
| `/admin/reviews` (moderation) | none | ❌ | **API shipped (S6)** — `/admin/reviews` + hide/unhide. UI page doesn't exist yet (out of scope for this catch-up) |

---

## 4. Sprint 3 catch-up retrospective

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

Historical Sprint 3 UI catch-up plan below (phases 1–5, all done). Suggested phases 6–11 for the next round (S4–S6 UI catch-up) are in the "Update 2026-05-15" block at the end of this section.

1. ~~**Wire PLP + PDP to `catalogApi`.**~~ **✅ Done (Phase 1, 2026-05-08).** PDP routes by slug now. `ProductCard` consumes `ListCard` shape. Home `ProductSection` wired. Visual decisions made: rating row kept as gray-star placeholder; brand label replaces category label on cards; PLP filters single-select; rating filter and "Top Rated" sort hidden until reviews API ships.
2. ~~**Add `cartApi` and wire `/cart`.**~~ **✅ Done (Phase 2, 2026-05-08).** Cart page reads from `cartApi.view`, qty +/- optimistic with rollback, per-line coupon chips replace the old textbox, summary uses API totals. Add to Cart wired on PDP and ProductCard with inline 'Added ✓' confirmation. Auth gate redirects to `/login?next=...`.
3. ~~**Add `wishlistApi` and wire `/wishlist`.**~~ **✅ Done (Phase 3, 2026-05-08).** New `WishlistProvider` (loads on auth, exposes `isWishlisted` + `add`/`remove`). Heart icons on PDP and ProductCard reflect real wishlist membership and toggle via the provider. `/wishlist` page reads from the provider, has a confirm-modal Clear-All, and a Move-to-Cart that uses `wishlistApi.moveToCart` (returns updated cart + wishlist).
4. ~~**Add `couponsApi` (admin) and wire `/admin/pricing`.**~~ **✅ Done (Phase 4, 2026-05-08).** Coupons tab CRUD wired with create/edit modal (type immutable on edit) and delete-confirm modal (surfaces `COUPON_HAS_ATTACHMENTS`). Stat cards now show Total / Active / Paused. Pricing rules and Campaigns tabs disabled with "Coming in Sprint 4+" tooltip.
5. ~~**Product↔coupon attach inside `/admin/products/[id]/edit`.**~~ **✅ Done (Phase 5, 2026-05-08).** New `<CouponAttachments>` component with two slots (Customer ₹ / Partner %), dropdown of ACTIVE coupons per type, value input with bounds, attach/detach + currently-attached display. Backend gaps logged in `docs/backend-gaps.md`.

Items 2–3 likely belong inside an "S3 UI catch-up" sprint before any new backend work, since right now there is no path for a customer to actually *use* anything from S3.

**Update 2026-05-15:** S3 catch-up done, but backend has since shipped S4–S6 (orders/addresses/invoices, admin ops, CMS/support/shipping, reviews/emails/password-reset). Next round of wiring (S4–S6 UI catch-up) should be planned with the same shape as the S3 catch-up — small, page-scoped phases. Suggested order:

6. **S4 orders flow** — `addressesApi` + `checkoutApi` + customer `ordersApi`, wire `/account/orders`, `/account/orders/[id]`, `/account/addresses`, `/invoice` (download), and `/cart → /checkout` flow. Highest customer value of any remaining work.
7. **S6 reviews on PDP** — wire PDP Reviews tab + post-review form (DELIVERED-order eligibility); replace `mockReviews`. Add forgot-password flow on `/login`.
8. **S4 admin orders** — `/admin/orders` list/detail/state machine (use `legalTransitions[]` from the detail response). `/admin/invoices` rolls into the same page since invoice data lives on `Order`.
9. **S5b banners** — `bannersApi.getActive` on home `HeroBanner`; `/admin/cms` for admin CRUD.
10. **S5a admin ops** — dashboard, reports, exports, activity logs, admin users list (role/suspend).
11. **S5b support tickets** — `/admin/support` + customer ticket pages.

The "Top Rated" sort and rating-filter sidebar on `/products` stay deferred until catalog list query exposes per-product rating aggregates.

---

## 6. Out-of-scope for current backend

As of 2026-05-15, almost every page that was previously "API gap ahead of UI" has flipped to "API shipped, UI not wired" (S4–S6). See Section 3 for the page-by-page status. The remaining genuine backend gaps are:

- `/dealer` (partner dashboard) — partner-side read endpoints (own orders summary, payouts, etc.) still not shipped. The partner KYC + GST upgrade flow exists, but there's no dashboard data API.
- `ProductCard` "Top Rated" sort + rating sidebar filter on `/products` (PLP) — Reviews API ships per-product aggregates on `GET /products/:slug/reviews`, but `GET /products` list facets don't carry a `ratingAverage` per row yet. Tracked as a follow-up under `backend-gaps.md` §5.
- Pricing rules / Campaigns tabs on `/admin/pricing` — Sprint 4+ feature, tabs still disabled.

Everything else listed in the old Section 6 (orders, addresses, invoices, CMS, support, activity logs, analytics, reviews) has backend now — the work is **UI wiring**, not API gap.
