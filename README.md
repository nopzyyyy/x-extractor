# X (Twitter) Scraper & Outbound Domain Inspector Dashboard

A clean, high-performance web tool and analytical dashboard that scrapes public timelines from any given X (formerly Twitter) profile, renders them in an authentic flat X-style feed, and provides advanced client-side search along with an automated root domain and link extraction filter.

![Dashboard Preview](https://raw.githubusercontent.com/nopzyyyy/x-extractor/main/preview.png)

---

## Features

- **⚡ Live Headless Browser Scraper (`puppeteer-core`)**: Drives local Chromium headlessly to scrape live public profiles directly from `x.com` with dynamic scrolling.
- **⏳ "From Beginning" Founding Era Scraper**: Automatically identifies the account's creation date (e.g. June 2010 for Cristiano Ronaldo) and extracts their earliest historical posts in chronological order.
- **🌐 Domain Intelligence & Registrar Availability Table**: Automatically aggregates every unique root domain (`bit.ly`, `mobypicture.com`, `twitpic.com`, `yfrog.com`, custom domains) and creates direct 1-click links to check registrar availability on **Namecheap** and look up **WHOIS**.
- **🔗 Outbound URLs Registry**: Searchable database of every destination URL extracted across the scraped feed.
- **🚀 1-Click In-Browser Live Bridge (Bookmarklet)**: Drag-and-drop bookmarklet to scrape any live profile directly from your authenticated browser tab on `x.com` with zero rate limits!
- **Strict Flat Minimal Design**: Zero drop shadows (`box-shadow: none !important`), hairline `#F3F4F6` / `#1F2937` dividers, and system typography.
- **Batch Data Exporters**: Instant downloads for CSV (links table), TXT (domain and URL list), and JSON (complete posts dataset).

---

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **UI & Styling**: React 19, Tailwind CSS, Lucide React
- **Browser Automation**: Puppeteer-Core
- **Language**: TypeScript

---

## Getting Started

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/nopzyyyy/x-extractor.git
cd x-extractor
npm install
```

### 2. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) (or `3002`) in your browser.

### 3. Production Build
```bash
npm run build
npm start
```

---

## License
MIT License
