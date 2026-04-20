"use client";

import { useState } from "react";
import { Phone, Mail, MapPin, Send } from "lucide-react";

const footerLinks = {
  "Quick Links": ["Home", "Products", "New Arrivals", "Best Sellers", "Today's Deals"],
  "Customer Care": ["My Account", "Track Order", "Returns & Refunds", "Raise a Ticket", "FAQs"],
  "Categories": ["Smartphones", "Cameras", "Speakers", "Earphones", "Smartwatches", "Accessories"],
};

export default function Footer() {
  const [email, setEmail] = useState("");

  return (
    <footer className="bg-gray-900 text-gray-400">
      {/* Newsletter */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-700 py-10 px-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-white text-xl font-bold mb-1">Stay in the loop</h3>
            <p className="text-blue-200 text-sm">Subscribe for the latest deals, launches & offers.</p>
          </div>
          <div className="flex w-full max-w-md bg-white/10 border border-white/20 rounded-full overflow-hidden focus-within:border-white/60 transition-all">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address"
              className="flex-1 bg-transparent text-white placeholder-blue-300 text-sm px-5 py-3 outline-none"
            />
            <button className="flex items-center gap-2 bg-white text-blue-700 font-semibold text-sm px-5 py-3 hover:bg-blue-50 transition-colors flex-shrink-0">
              <Send size={15} /> Subscribe
            </button>
          </div>
        </div>
      </div>

      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-4 py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8">
        {/* Brand */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Phone size={16} className="text-white" />
            </div>
            <span className="text-white font-bold text-lg">CellPhone Crowd</span>
          </div>
          <p className="text-sm leading-relaxed mb-5">
            Your trusted destination for the latest smartphones, cameras, speakers and accessories. Genuine products at the best prices.
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2"><Phone size={14} /> +91 98765 43210</div>
            <div className="flex items-center gap-2"><Mail size={14} /> support@cellphonecrowd.in</div>
            <div className="flex items-center gap-2"><MapPin size={14} /> Mumbai, Maharashtra, India</div>
          </div>
          <div className="flex gap-3 mt-5">
            {["f", "𝕏", "in", "▶"].map((label, i) => (
              <a key={i} href="#" className="w-9 h-9 bg-gray-800 hover:bg-blue-600 rounded-lg flex items-center justify-center transition-colors text-white text-xs font-bold">
                {label}
              </a>
            ))}
          </div>
        </div>

        {/* Links */}
        {Object.entries(footerLinks).map(([title, links]) => (
          <div key={title}>
            <h4 className="text-white font-semibold text-sm mb-4 uppercase tracking-wide">{title}</h4>
            <ul className="space-y-2">
              {links.map((link) => (
                <li key={link}>
                  <a href="#" className="text-sm hover:text-white hover:translate-x-1 inline-block transition-all">
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-gray-800 py-5 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <p>© 2024 CellPhone Crowd. All rights reserved.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors">Terms of Use</a>
            <a href="#" className="hover:text-white transition-colors">Sitemap</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
