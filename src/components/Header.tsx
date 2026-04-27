"use client";

import { useState } from "react";
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
import { useRouter } from "next/navigation";

const navLinks = [
  { name: "HOME", href: "/", hasDropdown: false },
  { name: "SMARTPHONES", href: "/products", hasDropdown: true },
  { name: "CAMERAS", href: "/products", hasDropdown: true },
  { name: "AUDIO", href: "/products", hasDropdown: true },
  { name: "WEARABLES", href: "/products", hasDropdown: false },
  { name: "ACCESSORIES", href: "/products", hasDropdown: false },
  { name: "DEALS", href: "/products", hasDropdown: false, badge: "hot" },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) router.push(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
  };

  return (
    <header className="w-full sticky top-0 z-50 shadow-sm">
      {/* Top Bar */}
      <div className="bg-gray-100 border-b border-gray-200 text-gray-500 text-xs py-1.5 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <span>Free 2-day delivery and free returns within India.</span>
          <div className="hidden sm:flex items-center gap-4">
            <Link href="/login" className="hover:text-[#129cd3] transition-colors flex items-center gap-1">
              <User size={11} /> Sign In
            </Link>
            <a href="#" className="hover:text-[#129cd3] transition-colors flex items-center gap-1">
              <Gift size={11} /> Gift Certificates
            </a>
            <Link href="/account" className="hover:text-[#129cd3] transition-colors flex items-center gap-1">
              My Account <ChevronDown size={10} />
            </Link>
            <span className="border-l border-gray-300 pl-3 flex items-center gap-1 cursor-pointer hover:text-[#129cd3] transition-colors">
              INR <ChevronDown size={10} />
            </span>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <div className="bg-white border-b border-gray-200 py-3 px-4">
        <div className="max-w-7xl mx-auto flex items-center gap-5">
          {/* Logo */}
          <Link href="/" className="flex items-center flex-shrink-0">
            <Image src="/logo-light.png" alt="CPC Logo" width={140} height={50} />
          </Link>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 flex items-center border-2 border-[#129cd3] overflow-hidden">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for products..."
              className="flex-1 outline-none text-sm px-4 py-2.5 text-gray-700 placeholder-gray-400"
            />
            <button type="submit" className="bg-[#129cd3] hover:bg-[#0e87b5] text-white px-5 py-2.5 flex items-center gap-2 transition-colors flex-shrink-0">
              <Search size={16} />
              <span className="hidden sm:inline text-sm font-semibold tracking-wide">SEARCH</span>
            </button>
          </form>

          {/* Phone */}
          <div className="hidden lg:flex items-center gap-3 flex-shrink-0">
            <div className="w-10 h-10 bg-[#129cd3] rounded-full flex items-center justify-center">
              <Phone size={18} className="text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Call us:</p>
              <p className="text-sm font-semibold text-gray-800">+91 98765 43210</p>
            </div>
          </div>

          {/* Icons */}
          <div className="flex items-center gap-4">
            <Link href="/wishlist" className="hidden md:flex flex-col items-center text-gray-600 hover:text-[#129cd3] transition-colors relative">
              <Heart size={22} />
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#129cd3] text-white text-[9px] rounded-full flex items-center justify-center font-bold">3</span>
            </Link>
            <Link href="/cart" className="flex flex-col items-center text-gray-600 hover:text-[#129cd3] transition-colors relative">
              <ShoppingCart size={22} />
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#129cd3] text-white text-[9px] rounded-full flex items-center justify-center font-bold">2</span>
            </Link>
            <Link href="/account" className="hidden md:flex flex-col items-center text-gray-600 hover:text-[#129cd3] transition-colors">
              <User size={22} />
            </Link>
            <button className="md:hidden text-gray-700" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Nav Bar */}
      <nav className="bg-[#129cd3] hidden md:block">
        <div className="max-w-7xl mx-auto flex items-center">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className="flex items-center gap-1.5 px-4 py-3 text-white text-sm font-medium hover:bg-[#0e87b5] transition-colors whitespace-nowrap"
            >
              {link.name}
              {link.badge && (
                <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
                  {link.badge}
                </span>
              )}
              {link.hasDropdown && <ChevronDown size={13} />}
            </Link>
          ))}
        </div>
      </nav>

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
          <div className="flex gap-4 p-4 border-t border-gray-100">
            <Link href="/login" className="flex items-center gap-2 text-gray-600 text-sm hover:text-[#129cd3] transition-colors">
              <User size={16} /> Sign In
            </Link>
            <Link href="/wishlist" className="flex items-center gap-2 text-gray-600 text-sm hover:text-[#129cd3] transition-colors">
              <Heart size={16} /> Wishlist
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
