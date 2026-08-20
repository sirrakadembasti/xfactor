# Frontend Mimari ve Uygulama Alt-Talimatnamesi

## 1. Genel Mimari Yaklaşım
* **Framework:** Next.js 14+ (App Router mimarisi, React Server Components (RSC) ve Client Components ayrımı).
* **Styling & UI Kit:** Tailwind CSS, `clsx` / `tailwind-merge` utility'leri, Lucide React ikon seti.
* **State Yönetimi:** Server State için Server Components / Actions; Client-side interaktif filtreler ve formlar için React State / Hook Form.
* **Harita Bileşenleri:** Leaflet + React-Leaflet (Next.js dynamic import ve SSR: false ile dinamik yükleme).

---

## 2. Dizin ve Dosya Yapısı (App Router)