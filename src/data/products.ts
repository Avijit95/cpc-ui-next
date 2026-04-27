export type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  originalPrice?: number;
  image: string;
  badge?: string;
  rating: number;
  reviews: number;
  isNew?: boolean;
  isBestSeller?: boolean;
};

export type Category = {
  id: number;
  name: string;
  icon: string;
  count: number;
  color: string;
};

export const categories: Category[] = [
  { id: 1, name: "Smartphones", icon: "📱", count: 120, color: "bg-blue-50" },
  { id: 2, name: "Cameras", icon: "📷", count: 45, color: "bg-purple-50" },
  { id: 3, name: "Speakers", icon: "🔊", count: 38, color: "bg-green-50" },
  { id: 4, name: "Smartwatches", icon: "⌚", count: 29, color: "bg-yellow-50" },
  { id: 5, name: "Earphones", icon: "🎧", count: 67, color: "bg-pink-50" },
  { id: 6, name: "Accessories", icon: "🔌", count: 95, color: "bg-orange-50" },
];

export const products: Product[] = [
  {
    id: 1,
    name: "iPhone 15 Pro Max",
    category: "Smartphones",
    price: 134900,
    originalPrice: 149900,
    image: "/iPhone 15 Pro Max.jpg",
    badge: "10% OFF",
    rating: 4.8,
    reviews: 2340,
    isBestSeller: true,
  },
  {
    id: 2,
    name: "Samsung Galaxy S24 Ultra",
    category: "Smartphones",
    price: 129999,
    originalPrice: 144999,
    image: "/Samsung Galaxy S24 Ultra.webp",
    badge: "HOT",
    rating: 4.7,
    reviews: 1876,
    isBestSeller: true,
  },
  {
    id: 3,
    name: "Sony Alpha ZV-E10",
    category: "Cameras",
    price: 59990,
    originalPrice: 72000,
    image: "/Sony Alpha ZV-E10.jpeg",
    badge: "17% OFF",
    rating: 4.6,
    reviews: 654,
    isBestSeller: true,
  },
  {
    id: 4,
    name: "JBL Charge 5",
    category: "Speakers",
    price: 15999,
    originalPrice: 19999,
    image: "/JBL Charge 5.jpg",
    badge: "20% OFF",
    rating: 4.5,
    reviews: 3210,
    isBestSeller: true,
  },
  {
    id: 5,
    name: "OnePlus 12",
    category: "Smartphones",
    price: 64999,
    originalPrice: 69999,
    image: "/OnePlus 12.png",
    badge: "NEW",
    rating: 4.6,
    reviews: 987,
    isNew: true,
  },
  {
    id: 6,
    name: "Apple Watch Series 9",
    category: "Smartwatches",
    price: 41900,
    originalPrice: 45900,
    image: "/Apple Watch Series 9.webp",
    badge: "NEW",
    rating: 4.7,
    reviews: 1123,
    isNew: true,
  },
  {
    id: 7,
    name: "Sony WH-1000XM5",
    category: "Earphones",
    price: 28990,
    originalPrice: 34990,
    image: "/Sony WH-1000XM5.webp",
    badge: "17% OFF",
    rating: 4.9,
    reviews: 4520,
    isNew: true,
  },
  {
    id: 8,
    name: "Google Pixel 8 Pro",
    category: "Smartphones",
    price: 106999,
    originalPrice: 119999,
    image: "/Google Pixel 8 Pro.webp",
    badge: "NEW",
    rating: 4.5,
    reviews: 765,
    isNew: true,
  },
];

export const brands = [
  { id: 1, name: "Apple" },
  { id: 2, name: "Samsung" },
  { id: 3, name: "Sony" },
  { id: 4, name: "OnePlus" },
  { id: 5, name: "JBL" },
  { id: 6, name: "Google" },
  { id: 7, name: "Xiaomi" },
];

export const heroSlides = [
  {
    id: 1,
    title: "iPhone 15 Pro Max",
    subtitle: "Titanium. So strong. So light. So Pro.",
    cta: "Shop Now",
    badge: "Just Launched",
    bgColor: "from-slate-900 to-blue-900",
    textColor: "text-white",
    image: "/slide1.jpg",
    discount: "Up to 10% OFF",
  },
  {
    id: 2,
    title: "Samsung Galaxy S24",
    subtitle: "Galaxy AI is here. The future unfolds.",
    cta: "Explore Now",
    badge: "Best Seller",
    bgColor: "from-indigo-900 to-purple-900",
    textColor: "text-white",
    image: "/slide2.jpg",
    discount: "Up to ₹15,000 OFF",
  },
  {
    id: 3,
    title: "Sony Alpha Series",
    subtitle: "Capture every moment in stunning detail.",
    cta: "View Cameras",
    badge: "New Arrival",
    bgColor: "from-gray-900 to-red-900",
    textColor: "text-white",
    image: "/slide3.jpg",
    discount: "Starting ₹49,999",
  },
];
