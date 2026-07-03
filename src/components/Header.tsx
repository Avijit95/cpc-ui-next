"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import {
  Search,
  ShoppingCart,
  Heart,
  User,
  Menu,
  X,
  Phone,
  ChevronDown,
  Gift,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useActiveCategory } from "@/lib/nav/ActiveCategoryProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useWishlist } from "@/lib/wishlist/WishlistProvider";
import { useCart } from "@/lib/cart/CartProvider";
import { catalogApi } from "@/lib/api";
import type { SuggestItem } from "@/lib/api";

function formatPrice(price: number) {
  return "₹" + price.toLocaleString("en-IN");
}

type NavLink = {
  name: string;
  href: string;
  hasDropdown: boolean;
  badge?: string;
};

const HOME_LINK: NavLink = { name: "HOME", href: "/", hasDropdown: false };
const DEALS_LINK: NavLink = {
  name: "DEALS",
  href: "/products",
  hasDropdown: false,
  badge: "hot",
};
const CATEGORY_SLOTS = 5;

function NavBar({ navLinks }: { navLinks: NavLink[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { activeCategory } = useActiveCategory();

  const isNavActive = (href: string) => {
    try {
      const url = new URL(href, "http://x");
      if (url.pathname !== pathname) {
        // On a product detail page (/products/[slug]), match via activeCategory context
        if (pathname.startsWith("/products/") && activeCategory) {
          const linkCategory = url.searchParams.get("category");
          return linkCategory === activeCategory;
        }
        return false;
      }
      const linkCategory = url.searchParams.get("category");
      if (linkCategory) return searchParams.get("category") === linkCategory;
      return !searchParams.get("category");
    } catch { return false; }
  };

  return (
    <nav className="bg-[#129cd3] hidden md:block">
      <div className="max-w-7xl mx-auto flex items-center">
        {navLinks.map((link) => {
          const active = isNavActive(link.href);
          return (
            <Link
              key={link.name}
              href={link.href}
              className={`flex items-center gap-1.5 px-4 py-3 text-white text-sm font-medium transition-colors whitespace-nowrap ${
                active ? "bg-[#0a6d93] font-bold" : "hover:bg-[#0e87b5]"
              }`}
            >
              {link.name}
              {link.badge && (
                <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
                  {link.badge}
                </span>
              )}
              {link.hasDropdown && <ChevronDown size={13} />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

type HeaderProps = {
  /** Category-derived links to render between HOME and DEALS. If provided, no
   * client fetch happens; if omitted (legacy call sites), Header falls back to
   * fetching /categories itself. */
  initialNavLinks?: NavLink[];
};

export default function Header({ initialNavLinks }: HeaderProps = {}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestItem[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchBoxRef = useRef<HTMLFormElement>(null);

  const [navLinks, setNavLinks] = useState<NavLink[]>(
    initialNavLinks
      ? [HOME_LINK, ...initialNavLinks, DEALS_LINK]
      : [HOME_LINK, DEALS_LINK],
  );
  const router = useRouter();
  const { user, status } = useAuth();
  const isAuthed = status === "authenticated" && !!user;
  const accountHref = "/account";
  const { items: wishlistItems } = useWishlist();
  const { count: cartCount } = useCart();
  const wishlistCount = wishlistItems.length;

  useEffect(() => {
    if (initialNavLinks) return;
    const ac = new AbortController();
    catalogApi
      .getCategories(ac.signal)
      .then((all) => {
        if (ac.signal.aborted) return;
        const categoryLinks: NavLink[] = all
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .slice(0, CATEGORY_SLOTS)
          .map((c) => ({
            name: c.name.toUpperCase(),
            href: `/products?category=${encodeURIComponent(c.slug.toLowerCase())}`,
            hasDropdown: c.children.length > 0,
          }));
        const cameraLensLink: NavLink = {
          name: "CAMERA LENS",
          href: "/products?category=camera-lens",
          hasDropdown: false,
        };
        const cameraIdx = categoryLinks.findIndex((l) => l.href.includes("category=camera"));
        const insertAt = cameraIdx >= 0 ? cameraIdx + 1 : categoryLinks.length;
        const withLens = [
          ...categoryLinks.slice(0, insertAt),
          cameraLensLink,
          ...categoryLinks.slice(insertAt),
        ];
        setNavLinks([HOME_LINK, ...withLens, DEALS_LINK]);
      })
      .catch(() => {
        /* keep HOME + DEALS fallback */
      });
    return () => ac.abort();
  }, [initialNavLinks]);

  // Debounced typeahead: fetch suggestions ~250ms after the user stops typing.
  useEffect(() => {
    const q = searchQuery.trim();
    const ac = new AbortController();
    const t = setTimeout(() => {
      if (q.length < 2) {
        setSuggestions([]);
        setActiveIndex(-1);
        return;
      }
      catalogApi
        .suggest(q, 6, ac.signal)
        .then((items) => {
          setSuggestions(items);
          setShowSuggest(true);
          setActiveIndex(-1);
        })
        .catch(() => {
          /* aborted or failed — keep the box usable */
        });
    }, 250);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [searchQuery]);

  // Close the dropdown when clicking outside the search box.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (
        searchBoxRef.current &&
        !searchBoxRef.current.contains(e.target as Node)
      ) {
        setShowSuggest(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const goToProduct = (slug: string) => {
    setShowSuggest(false);
    setSearchQuery("");
    router.push(`/products/${slug}`);
  };

  const submitSearch = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setShowSuggest(false);
    router.push(`/products?search=${encodeURIComponent(trimmed)}`);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeIndex >= 0 && suggestions[activeIndex]) {
      goToProduct(suggestions[activeIndex].slug);
      return;
    }
    submitSearch(searchQuery);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggest || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Escape") {
      setShowSuggest(false);
    }
  };

  return (
    <header className="w-full sticky top-0 z-[9999] shadow-sm">
      {/* Top Bar */}
      <div className="bg-gray-100 border-b border-gray-200 text-gray-700 text-xs py-1.5 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <span>Free 2-day delivery and free returns within India.</span>
          <div className="hidden sm:flex items-center gap-4">
            {!isAuthed && (
              <Link href="/login" className="hover:text-[#129cd3] transition-colors flex items-center gap-1">
                <User size={11} /> Sign In
              </Link>
            )}
            <a href="#" className="hover:text-[#129cd3] transition-colors flex items-center gap-1">
              <Gift size={11} /> Gift Certificates
            </a>
            {isAuthed ? (
              <Link href={accountHref} className="hover:text-[#129cd3] transition-colors flex items-center gap-1">
                Hi, {user.name.split(" ")[0]} <ChevronDown size={10} />
              </Link>
            ) : (
              <Link href="/account" className="hover:text-[#129cd3] transition-colors flex items-center gap-1">
                My Account <ChevronDown size={10} />
              </Link>
            )}
            <span className="border-l border-gray-300 pl-3 flex items-center gap-1 cursor-pointer hover:text-[#129cd3] transition-colors">
              INR <ChevronDown size={10} />
            </span>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <div className="bg-white border-b border-gray-200 py-3 px-[7px] xs:px-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
          {/* Logo */}
          <Link href="/" className="flex items-center flex-shrink-0">
            <Image src="/logo-light.png" alt="CPC Logo" width={140} height={50} priority style={{ height: "auto" }} />
          </Link>

          {/* Search — drops to its own full-width row below md, inline from md up */}
          <form ref={searchBoxRef} onSubmit={handleSearch} className="relative order-last basis-full md:order-none md:basis-auto md:flex-1 flex items-center border-2 border-[#129cd3]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggest(true);
              }}
              placeholder="Search for products..."
              className="flex-1 outline-none text-sm px-[7px] py-2.5 xs:px-4 text-gray-700 placeholder-gray-400"
            />
            <button type="submit" className="bg-[#0a6e99] hover:bg-[#08597f] text-white px-5 py-2.5 flex items-center gap-2 transition-colors flex-shrink-0">
              <Search size={16} />
              <span className="hidden sm:inline text-sm font-semibold tracking-wide">SEARCH</span>
            </button>

            {/* Typeahead dropdown */}
            {showSuggest && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-b-lg shadow-lg z-[10000] max-h-[70vh] overflow-y-auto">
                {suggestions.map((s, i) => (
                  <button
                    type="button"
                    key={s.id}
                    // onMouseDown (not onClick) so the navigation fires before the
                    // input blur closes the dropdown.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      goToProduct(s.slug);
                    }}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                      i === activeIndex ? "bg-[#e8f7fc]" : "hover:bg-gray-50"
                    }`}
                  >
                    <span className="w-10 h-10 bg-gray-100 rounded flex-shrink-0 overflow-hidden flex items-center justify-center">
                      {s.primaryImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.primaryImageUrl}
                          alt={s.name}
                          className="w-full h-full object-contain p-0.5"
                        />
                      ) : null}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-gray-800 truncate">
                        {s.name}
                      </span>
                      {s.brand && (
                        <span className="block text-[11px] text-gray-400 truncate">
                          {s.brand}
                        </span>
                      )}
                    </span>
                    <span className="text-sm font-bold text-[#129cd3] flex-shrink-0">
                      {formatPrice(s.finalPrice)}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    submitSearch(searchQuery);
                  }}
                  className="w-full text-center px-3 py-2.5 text-xs font-semibold text-[#0a6e99] hover:bg-gray-50 border-t border-gray-100"
                >
                  See all results for “{searchQuery.trim()}”
                </button>
              </div>
            )}
          </form>

          {/* Phone */}
          <div className="hidden lg:flex items-center gap-3 flex-shrink-0">
            <div className="w-10 h-10 bg-[#129cd3] rounded-full flex items-center justify-center">
              <Phone size={18} className="text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-600">Call us:</p>
              <p className="text-sm font-semibold text-gray-800">+91 98765 43210</p>
            </div>
          </div>

          {/* Icons */}
          <div className="flex items-center gap-[15px] xs:gap-[10px] md:gap-4">
            <Link href="/wishlist" className="flex flex-col items-center text-gray-600 hover:text-[#129cd3] transition-colors relative">
              <Heart size={22} className="hidden xs:block" />
              <Heart size={18} className="xs:hidden" />
              {wishlistCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#129cd3] text-white text-[9px] rounded-full flex items-center justify-center font-bold">{wishlistCount}</span>
              )}
            </Link>
            <Link href="/cart" className="flex flex-col items-center text-gray-600 hover:text-[#129cd3] transition-colors relative">
              <ShoppingCart size={22} className="hidden xs:block" />
              <ShoppingCart size={18} className="xs:hidden" />
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#129cd3] text-white text-[9px] rounded-full flex items-center justify-center font-bold">{cartCount}</span>
              )}
            </Link>
            <Link
              href={accountHref}
              aria-label={isAuthed ? `Open ${user.name}'s profile` : "Sign in"}
              className="flex items-center text-gray-600 hover:text-[#129cd3] transition-colors"
            >
              {isAuthed ? (
                user.profilePicUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.profilePicUrl}
                    alt={user.name}
                    className="w-7 h-7 xs:w-9 xs:h-9 rounded-full object-cover ring-2 ring-[#129cd3]"
                  />
                ) : (
                  <span className="w-7 h-7 xs:w-9 xs:h-9 rounded-full bg-[#129cd3] text-white text-[10px] xs:text-xs font-bold flex items-center justify-center ring-2 ring-[#129cd3]/20">
                    {initials(user.name)}
                  </span>
                )
              ) : (
                <>
                  <User size={22} className="hidden xs:block" />
                  <User size={18} className="xs:hidden" />
                </>
              )}
            </Link>
            <button className="md:hidden text-gray-700" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Nav Bar */}
      <Suspense fallback={<nav className="bg-[#129cd3] hidden md:block h-[46px]" />}>
        <NavBar navLinks={navLinks} />
      </Suspense>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-gray-200 shadow-lg">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="flex items-center justify-between px-4 py-3 text-gray-700 border-b border-gray-100 hover:bg-[#e8f7fc] hover:text-[#129cd3] text-sm transition-colors"
            >
              <span className="flex items-center gap-2">
                {link.name}
                {link.badge && (
                  <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
                    {link.badge}
                  </span>
                )}
              </span>
              {link.hasDropdown && <ChevronDown size={14} className="text-gray-400" />}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
