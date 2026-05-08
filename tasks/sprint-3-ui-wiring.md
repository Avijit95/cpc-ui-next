# Sprint 3 UI Wiring — connect cpc-ui-next to the live API

_Companion to `docs/PROJECT_STATUS.md` (audit dated 2026-05-08)._
_Status: **✅ closed out 2026-05-08** — all 5 phases shipped. Backend gaps surfaced are in `../../../docs/backend-gaps.md`._

**Goal:** make every Sprint 1–3 backend endpoint reachable from the UI, replacing mock data in `src/data/products.ts` and the local `useState` cart/wishlist with real API calls. This brings the UI in line with what the API already ships through Sprint 3 (cart, wishlist, coupons, PricingService).

---

## Ground rules (read before touching code)

1. **No UI design changes without approval.** Any markup, layout, color, spacing, typography, or component-structure change requires asking the user first. Once approved, match the existing design language exactly — same Tailwind classes, same `lucide-react` icons, same card/border/rounded/shadow conventions, same color palette (`#129cd3` primary, etc.).
2. **API client work is not a UI change.** New files in `src/lib/api/endpoints/`, new types in `src/lib/api/types.ts`, and new hooks/data-loading code do **not** need pre-approval.
3. **Replacing mock data with live data IS a UI change** because it changes what the user sees: loading states, empty states, error states, real product images. Ask before flipping a page from mock → live, and describe the new visual states you'd add (skeleton? spinner? empty-state copy?).
4. **Read `node_modules/next/dist/docs/` before writing any Next.js code.** Per the repo's `AGENTS.md` — this version has breaking changes from training-data Next.js.
5. **Keep changes small and reviewable.** One phase at a time, one PR per phase if possible.

---

## Phase 0 — Foundation (no UI changes)

Type and infrastructure work needed before any wiring. Pure additions, safe to land first.

- [ ] **0.1** Add Sprint 3 types to `src/lib/api/types.ts`:
  - `Cart`, `CartItem`, `CartViewResponse` (mirror `apps/api/src/modules/cart/cart.service.ts` `CartViewResponse`)
  - `Wishlist`, `WishlistItem`
  - `Coupon`, `CouponKind`, `CouponStatus`, `ListCouponsQuery`
  - `ProductCouponSlot` (`'customer' | 'retail'`)
  - Pricing-related fields already on `ListCard` / `ProductDetail` (`finalPrice`, etc.) — confirm they're sufficient, add `appliedCoupons` shape if cart/PDP responses carry it
- [ ] **0.2** Verify `request<T>()` in `client.ts` handles every method we need (GET/POST/PATCH/PUT/DELETE) — already does, just sanity-check.
- [ ] **0.3** Add a tiny `useApiResource` (or similar) hook if we don't already have one, to standardize `loading | error | data` state shape across pages — **only if it removes duplication across phases 1–4**, otherwise skip and let each page do its own `useState`/`useEffect`.

---

## Phase 1 — Public catalog wiring (Sprint 2 / 2.5 backfill)

The typed `catalogApi` already exists in `src/lib/api/endpoints/catalog.ts` but has zero callers. Wiring this is prerequisite to S3 because cart/wishlist need real product/variant IDs.

**Endpoints in play:** `GET /categories`, `GET /products`, `GET /products/:slug` — all already in `catalogApi`.

- [ ] **1.1** PDP route change: `/products/[id]/page.tsx` is keyed by numeric id (`Number(params.id)`), but the API is slug-based. Rename the segment to `[slug]` and switch to `catalogApi.getProduct(slug)`. **This is a routing change — confirm with user before doing it (changes URLs).**
- [ ] **1.2** Wire `/products` (PLP) to `catalogApi.listProducts(query)`. Replace the `products.filter(...)` in-memory pipeline. Map filters/sort to `ListProductsQuery`. **Ask before changing UI:** filter sidebar today is hard-coded `categoryOptions` / `brandOptions`; the API returns dynamic `facets.brands` and `facets.priceBuckets` — do we keep static options or switch to facets?
- [ ] **1.3** Wire `/products/[slug]` (PDP) to `catalogApi.getProduct(slug)` once 1.1 lands. Variant picker reads from `ProductDetail.variants`. The `mockSpecs` and `mockReviews` blocks at the top of that file stay as fallbacks — note them as "out of scope, no specs/reviews API yet."
- [ ] **1.4** Home page sections (`HeroBanner`, `ProductSection`, `DealsSection`, `BrandSection`) currently read from `data/products.ts`. Decide per section:
  - `ProductSection` (Best Sellers / New Arrivals tabs) → `catalogApi.listProducts({ sort: 'popular' | 'newest', limit: N })`
  - `DealsSection` → unclear what the source of truth is; check if the API has a "deals" filter (likely not — list as out-of-scope until we add one).
  - `BrandSection` → can read from `/categories` or facets; or stay static for now.
  - `HeroBanner` → `heroSlides` is CMS-style content with no backend; **leave as-is**, flag in `docs/PROJECT_STATUS.md` as "needs CMS API (S4+)".
- [ ] **1.5** Once PLP/PDP/home ProductSections are live, decide whether to delete `src/data/products.ts` entirely or keep just the `Product` type + `categories` array as scaffolding. **Ask before deleting** — there are 9 importers across components/pages and the diff will be large.
- [ ] **1.6** Update `ProductCard.tsx` to accept the API's `ListCard` shape (id is `string`, has `slug`, `finalPrice` instead of `price` + `originalPrice`). This is a prop-shape change, not a visual change — but confirm `formatPrice` and the badge/strikethrough rendering still match the existing design.

---

## Phase 2 — Cart wiring (Sprint 3)

**Endpoints:** `GET /cart`, `POST /cart/items`, `PATCH /cart/items/:id`, `DELETE /cart/items/:id`.

- [ ] **2.1** Create `src/lib/api/endpoints/cart.ts` with `cartApi.{view, addItem, updateItem, removeItem}`. Bodies/responses pulled from `apps/api/src/modules/cart/cart.service.ts` (`AddCartItemDto`, `UpdateCartItemDto`, `CartViewResponse`).
- [ ] **2.2** Re-export `cartApi` from `src/lib/api/index.ts`.
- [ ] **2.3** Add `cartApi` types to `types.ts` if not done in 0.1 (Cart, CartItem, totals).
- [ ] **2.4** Wire `/cart/page.tsx`:
  - Replace `initialCart` mock with `cartApi.view()` on mount.
  - Replace `updateQty(id, delta)` with `cartApi.updateItem(itemId, { qty })`.
  - Replace `removeItem(id)` with `cartApi.removeItem(itemId)`.
  - The "Apply coupon" button currently `setCouponApplied(true)` locally — wire to `POST /cart/coupons` if such an endpoint exists; if not (PricingService applies coupons automatically based on the user's role + product attachments), just remove the input or hide it pending S3 manual-coupon-code support.
  - Totals (subtotal, discount, grandTotal) come from the cart response (PricingService computes them server-side) — don't reconstruct in the UI.
  - **Ask before changing UI:** loading + empty states (the page today renders the cart synchronously). Propose: skeleton row × 3 while loading; existing "empty cart" empty state if `cartItems.length === 0`.
- [ ] **2.5** Hook up "Add to Cart" buttons elsewhere (PDP, ProductCard quick-add if it exists) — `cartApi.addItem({ productId | variantId, qty })`.

---

## Phase 3 — Wishlist wiring (Sprint 3)

**Endpoints:** `GET /wishlist`, `POST /wishlist/items`, `DELETE /wishlist/items/:id`, `POST /wishlist/items/:id/move-to-cart`.

- [ ] **3.1** Create `src/lib/api/endpoints/wishlist.ts` with `wishlistApi.{view, addItem, removeItem, moveToCart}`.
- [ ] **3.2** Re-export from `src/lib/api/index.ts`.
- [ ] **3.3** Wire `/wishlist/page.tsx`:
  - Replace `products.slice(0, 4)` with `wishlistApi.view()`.
  - "Move to cart" button → `wishlistApi.moveToCart(itemId, { qty: 1 })`.
  - "Remove" → `wishlistApi.removeItem(itemId)`.
  - "Clear All" — backend has no bulk-delete endpoint; either fan out N `removeItem` calls or hide the button. **Ask which.**
  - **Ask before changing UI:** loading + empty states (existing empty state already styled — reuse it).
- [ ] **3.4** Heart-icon toggles on PDP and `ProductCard` → `wishlistApi.addItem(...)` / `removeItem(...)`. Decide where wishlist membership lookup lives (probably a top-level wishlist context that loads once on app mount).

---

## Phase 4 — Admin coupons wiring (Sprint 3)

**Endpoints:** `GET/POST/PATCH/DELETE /admin/coupons[/:id]`.

- [ ] **4.1** Add coupon CRUD to `src/lib/api/endpoints/admin.ts` (or split into `admin-coupons.ts` if `admin.ts` is getting long): `adminApi.{listCoupons, getCoupon, createCoupon, updateCoupon, deleteCoupon}`.
- [ ] **4.2** Add `Coupon` and `ListCouponsQuery` types to `types.ts`.
- [ ] **4.3** Wire `/admin/pricing/page.tsx` Coupons tab:
  - Replace the hard-coded `coupons` array with `adminApi.listCoupons()`.
  - Add Create/Edit/Delete actions backed by the live API.
  - **Ask before changing UI:** the existing tab is read-only with hard-coded rows; adding Create/Edit modals is a real UI addition. Propose: reuse the `ProductForm` / `CategoryForm` modal pattern (same styling, same field-validation idiom).
- [ ] **4.4** Mark the **Rules** and **Campaigns** tabs as out-of-scope: no backend exists. Either disable the tabs with a "Coming in Sprint 4+" note (preferred — preserves design) or hide them. **Ask which.**

---

## Phase 5 — Product↔coupon attachment (Sprint 3)

**Endpoints:** `PUT /admin/products/:id/coupons/:type`, `DELETE /admin/products/:id/coupons/:type` where `:type ∈ {customer, retail}`.

- [ ] **5.1** Add `adminApi.attachProductCoupon(productId, slot, body)` and `detachProductCoupon(productId, slot)`.
- [ ] **5.2** Add a "Coupon attachments" section to `/admin/products/[id]/edit/page.tsx` (inside `ProductForm` if natural, otherwise a sibling section below).
  - Two slots: Customer coupon, Retail (partner) coupon.
  - Each slot: dropdown of available coupons (from `adminApi.listCoupons()`) + Attach / Detach buttons.
  - **Ask before changing UI:** this is a new section. Propose: same card style as existing "Variants" section in `ProductForm`, two small panels side-by-side or stacked depending on width.

---

## Acceptance — when is Sprint 3 UI complete?

- [ ] A logged-out user can browse the home page, PLP, and PDP using only live API data; no `data/products.ts` reads remain on those routes.
- [ ] A logged-in customer can add to cart, change qty, remove, and see the PricingService-computed totals — round-trip to `/cart` endpoints.
- [ ] A logged-in customer can add to wishlist, remove, and move-to-cart — round-trip to `/wishlist` endpoints.
- [ ] An admin can list/create/edit/delete coupons in `/admin/pricing` — round-trip to `/admin/coupons*`.
- [ ] An admin can attach/detach a coupon to a product from the product edit page — round-trip to `/admin/products/:id/coupons/:type`.
- [ ] No UI design regressions: spacing, color, typography, and component patterns match what was there before. PR diffs are reviewable side-by-side without "where did this new style come from?" questions.

---

## Tracking notes

- The full audit lives in `docs/PROJECT_STATUS.md`. If you change wiring state, update that doc too so the gap matrix stays accurate.
- This file is for Sprint 3 UI catch-up only. Anything S4+ (orders, invoices, addresses, analytics, CMS, logs, support, partner dashboard) belongs in a separate task file once those backend endpoints land.
