"use client";

import { useState } from "react";
import Image from "next/image";
import { Mail } from "lucide-react";

const footerLinks = {
  "OUR SHOPS": ["New Arrivals", "Best Sellers", "Today's Deals", "Clearance Sale", "Gift Cards"],
  "INFORMATION": ["About Us", "Privacy Policy", "Terms & Conditions", "Blog", "Sitemap"],
  "BRANDS": ["Apple", "Samsung", "Sony", "OnePlus", "JBL", "Google"],
  "ALL CATEGORIES": ["Smartphones", "Cameras", "Speakers", "Earphones", "Smartwatches", "Accessories"],
};

// Public business identifiers — inlined at build time (same as the OAuth client
// ID). Each line renders only when its value is set.
const SELLER_GSTIN = process.env.NEXT_PUBLIC_SELLER_GSTIN;
const SELLER_IEC = process.env.NEXT_PUBLIC_SELLER_IEC;

export default function Footer() {
  const [email, setEmail] = useState("");

  return (
    <footer className="bg-gray-800 text-gray-400">
      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-4 py-10 grid grid-cols-2 xs:grid-cols-3 lg:grid-cols-6 gap-6 text-center xs:text-left">
        {/* Contact column */}
        <div className="col-span-2 xs:col-span-2">
          <h4 className="text-white font-bold text-xs uppercase tracking-wide mb-1">CONTACT US</h4>
          <div className="h-px bg-gradient-to-r from-transparent via-[#129cd3] to-transparent mb-3 xs:hidden" />
          <p className="text-xs text-gray-400 mb-3 leading-relaxed">
            Your trusted destination for premium electronics at the best prices in India.
          </p>
          <p className="text-xs mb-1">
            <span className="text-gray-300 font-semibold">Phone:</span> +91 98765 43210
          </p>
          <p className="text-xs mb-1">
            <span className="text-gray-300 font-semibold">Email:</span> support@cellphonecrowd.in
          </p>
          <p className="text-xs mb-1">
            <span className="text-gray-300 font-semibold">Hours:</span> Mon–Fri, 9am–6pm IST
          </p>
          {SELLER_GSTIN && (
            <p className="text-xs mb-1">
              <span className="text-gray-300 font-semibold">GSTIN:</span> {SELLER_GSTIN}
            </p>
          )}
          {SELLER_IEC && (
            <p className="text-xs mb-1">
              <span className="text-gray-300 font-semibold">IEC:</span> {SELLER_IEC}
            </p>
          )}
          <div className="flex gap-2 mt-4 mb-4 justify-center xs:justify-start">
            {["f", "𝕏", "in", "▶"].map((label, i) => (
              <a
                key={i}
                href="#"
                className="w-8 h-8 bg-gray-700 hover:bg-[#129cd3] rounded flex items-center justify-center transition-colors text-white text-xs font-bold"
              >
                {label}
              </a>
            ))}
          </div>
          <div className="flex gap-2 justify-center xs:justify-start">
            <a href="#" className="bg-gray-700 hover:bg-[#129cd3] text-white text-xs px-3 py-1.5 rounded transition-colors">
              App Store
            </a>
            <a href="#" className="bg-gray-700 hover:bg-[#129cd3] text-white text-xs px-3 py-1.5 rounded transition-colors">
              Google Play
            </a>
          </div>
          {/* MSME registration badge — white chip so the black logo stays legible on the dark footer */}
          <div className="mt-4 inline-block bg-white rounded p-2">
            <Image
              src="/msme.png"
              alt="Registered with Ministry of MSME, Govt. of India"
              width={120}
              height={66}
            />
          </div>
        </div>

        {/* Link columns */}
        {Object.entries(footerLinks).map(([title, links]) => (
          <div key={title}>
            <h4 className="text-white font-bold text-xs uppercase tracking-wide mb-1">{title}</h4>
            <div className="h-px bg-gradient-to-r from-transparent via-[#129cd3] to-transparent mb-3 xs:hidden" />
            <ul className="space-y-2">
              {links.map((link) => (
                <li key={link}>
                  <a href="#" className="text-xs hover:text-[#129cd3] transition-colors">
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Newsletter */}
      <div className="border-t border-gray-700 py-5 px-[10px] xs:px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-300 font-medium whitespace-nowrap">
            Subscribe for exclusive deals &amp; offers:
          </p>
          <div className="flex w-full max-w-sm">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address..."
              className="flex-1 bg-gray-700 text-white placeholder-gray-500 text-xs px-4 py-2.5 outline-none border border-gray-600 focus:border-[#129cd3] transition-colors"
            />
            <button className="bg-[#129cd3] hover:bg-[#0e87b5] text-white text-xs font-bold px-4 py-2.5 flex items-center gap-1.5 transition-colors flex-shrink-0">
              <Mail size={13} /> SUBSCRIBE
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="bg-gray-900 py-4 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
          <p>© 2024 CellPhone Crowd. All rights reserved.</p>
          <div className="flex gap-4 flex-wrap justify-center">
            <a href="#" className="hover:text-[#129cd3] transition-colors">HOME</a>
            <a href="#" className="hover:text-[#129cd3] transition-colors">SMARTPHONES</a>
            <a href="#" className="hover:text-[#129cd3] transition-colors">CAMERAS</a>
            <a href="#" className="hover:text-[#129cd3] transition-colors">AUDIO</a>
            <a href="#" className="hover:text-[#129cd3] transition-colors">DEALS</a>
            <a href="#" className="hover:text-[#129cd3] transition-colors">BLOG</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
