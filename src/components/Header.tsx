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
  MapPin,
} from "lucide-react";

const navLinks = [
  { name: "Smartphones", href: "#", hasDropdown: true },
  { name: "Cameras", href: "#", hasDropdown: true },
  { name: "Speakers", href: "#", hasDropdown: false },
  { name: "Earphones", href: "#", hasDropdown: false },
  { name: "Smartwatches", href: "#", hasDropdown: false },
  { name: "Accessories", href: "#", hasDropdown: false },
  { name: "Deals", href: "#", hasDropdown: false },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <header className="w-full sticky top-0 z-50 shadow-md">
      {/* Top Bar */}
      <div className="bg-gray-900 text-gray-300 text-xs py-2 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Phone size={12} />
              +91 98765 43210
            </span>
            <span className="hidden sm:flex items-center gap-1">
              <MapPin size={12} />
              Free delivery on orders above ₹999
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#" className="hover:text-white transition-colors">Track Order</a>
            <a href="#" className="hover:text-white transition-colors">Become a Partner</a>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <div className="bg-white border-b border-gray-200 py-3 px-4">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          {/* Logo */}
          <a href="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
              <Phone size={20} className="text-white" />
            </div>
            <div>
              <span className="text-lg font-bold text-gray-900 leading-none block">CellPhone</span>
              <span className="text-xs font-semibold text-blue-600 leading-none block tracking-widest">CROWD</span>
            </div>
          </a>

          {/* Search */}
          <div className="flex-1 max-w-2xl hidden md:flex items-center bg-gray-100 rounded-full px-4 py-2 border border-transparent focus-within:border-blue-400 focus-within:bg-white transition-all">
            <Search size={18} className="text-gray-400 flex-shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search phones, cameras, speakers..."
              className="flex-1 bg-transparent outline-none text-sm ml-2 text-gray-700 placeholder-gray-400"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 ml-auto">
            <a href="#" className="hidden md:flex flex-col items-center text-gray-600 hover:text-blue-600 transition-colors">
              <User size={22} />
              <span className="text-[10px] mt-0.5">Account</span>
            </a>
            <a href="#" className="hidden md:flex flex-col items-center text-gray-600 hover:text-blue-600 transition-colors relative">
              <Heart size={22} />
              <span className="text-[10px] mt-0.5">Wishlist</span>
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center">3</span>
            </a>
            <a href="#" className="flex flex-col items-center text-gray-600 hover:text-blue-600 transition-colors relative">
              <ShoppingCart size={22} />
              <span className="text-[10px] mt-0.5">Cart</span>
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 text-white text-[9px] rounded-full flex items-center justify-center">2</span>
            </a>
            <button
              className="md:hidden text-gray-700"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Search */}
        <div className="md:hidden mt-2 flex items-center bg-gray-100 rounded-full px-4 py-2">
          <Search size={16} className="text-gray-400" />
          <input
            type="text"
            placeholder="Search products..."
            className="flex-1 bg-transparent outline-none text-sm ml-2 text-gray-700"
          />
        </div>
      </div>

      {/* Nav Bar */}
      <nav className="bg-blue-600 hidden md:block">
        <div className="max-w-7xl mx-auto flex items-center">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              className="flex items-center gap-1 px-4 py-3 text-white text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              {link.name}
              {link.hasDropdown && <ChevronDown size={14} />}
            </a>
          ))}
          <a
            href="#"
            className="ml-auto flex items-center gap-1 px-4 py-3 text-yellow-300 text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            🔥 Today&apos;s Deals
          </a>
        </div>
      </nav>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-gray-200 shadow-lg">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              className="flex items-center justify-between px-4 py-3 text-gray-700 border-b border-gray-100 hover:bg-gray-50"
            >
              {link.name}
              {link.hasDropdown && <ChevronDown size={16} className="text-gray-400" />}
            </a>
          ))}
          <div className="flex gap-4 p-4 border-t border-gray-100">
            <a href="#" className="flex items-center gap-2 text-gray-600 text-sm">
              <User size={18} /> Account
            </a>
            <a href="#" className="flex items-center gap-2 text-gray-600 text-sm">
              <Heart size={18} /> Wishlist
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
