"use client";

import React, { useState } from "react";
import {
  Search,
  Calendar,
  Download,
  Globe,
  Link2,
  Loader2,
  ChevronDown,
  FileSpreadsheet,
  FileCode,
  FileText,
  Key,
  Sparkles,
  Zap,
  History,
  ArrowUpDown,
} from "lucide-react";

interface HeaderSearchProps {
  targetInput: string;
  setTargetInput: (val: string) => void;
  startDate: string;
  setStartDate: (val: string) => void;
  endDate: string;
  setEndDate: (val: string) => void;
  scrapeMode: "puppeteer" | "archive" | "official";
  setScrapeMode: (val: "puppeteer" | "archive" | "official") => void;
  scrollCount: number;
  setScrollCount: (val: number) => void;
  authToken: string;
  setAuthToken: (val: string) => void;
  csrfToken: string;
  setCsrfToken: (val: string) => void;
  onFetch: () => void;
  isLoading: boolean;

  // Client-side search and filters
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  onlyLinks: boolean;
  setOnlyLinks: (val: boolean) => void;
  selectedDomain: string | null;
  setSelectedDomain: (val: string | null) => void;

  // Domain Drawer
  uniqueDomainsCount: number;
  onOpenDomainDrawer: () => void;

  // Exports
  onExportCsv: () => void;
  onExportTxt: () => void;
  onExportJson: () => void;

  // Stats
  totalTweets: number;
  filteredCount: number;

  // Beginning & Sort order
  fromBeginning: boolean;
  setFromBeginning: (val: boolean) => void;
  sortOrder: "asc" | "desc";
  setSortOrder: (val: "asc" | "desc") => void;

  // Tab controls
  activeTab: "feed" | "domains" | "urls" | "bridge" | "paste";
  setActiveTab: (tab: "feed" | "domains" | "urls" | "bridge" | "paste") => void;
}

export const HeaderSearch: React.FC<HeaderSearchProps> = ({
  targetInput,
  setTargetInput,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  scrapeMode,
  setScrapeMode,
  scrollCount,
  setScrollCount,
  authToken,
  setAuthToken,
  csrfToken,
  setCsrfToken,
  onFetch,
  isLoading,
  searchQuery,
  setSearchQuery,
  onlyLinks,
  setOnlyLinks,
  selectedDomain,
  setSelectedDomain,
  uniqueDomainsCount,
  onOpenDomainDrawer,
  onExportCsv,
  onExportTxt,
  onExportJson,
  totalTweets,
  filteredCount,
  fromBeginning,
  setFromBeginning,
  sortOrder,
  setSortOrder,
  activeTab,
  setActiveTab,
}) => {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading) {
      onFetch();
    }
  };

  const applyPreset = (handle: string, mode: "puppeteer" | "archive" = "puppeteer") => {
    setTargetInput(handle);
    setScrapeMode(mode);
  };

  return (
    <header className="sticky top-0 z-30 bg-white dark:bg-[#000000] border-b border-[#F3F4F6] dark:border-[#1F2937]">
      {/* Top Deck: Branding & Live Status */}
      <div className="px-4 py-2.5 border-b border-[#F3F4F6] dark:border-[#1F2937] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[#0F1419] dark:bg-[#EFF3F4] text-white dark:text-[#0F1419] flex items-center justify-center font-bold text-base select-none">
            𝕏
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-[#0F1419] dark:text-[#F7F9F9]">
                X Scraper Dashboard
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Chrome Engine
              </span>
            </div>
            <p className="text-[11px] text-[#536471] dark:text-[#71767B]">
              Real-time x.com public timeline scraper & outbound domain inspector
            </p>
          </div>
        </div>

        {/* Quick Export Controls */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={totalTweets === 0}
              className="px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 bg-neutral-100 dark:bg-[#16181C] text-[#0F1419] dark:text-[#F7F9F9] hover:bg-neutral-200 dark:hover:bg-[#202327] disabled:opacity-40 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
              <ChevronDown className="w-3 h-3 ml-0.5" />
            </button>

            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 mt-1.5 w-52 bg-white dark:bg-[#16181C] border border-[#E5E7EB] dark:border-[#2F3336] rounded-xl py-1.5 z-50 flex flex-col">
                  <button
                    onClick={() => {
                      onExportCsv();
                      setShowExportMenu(false);
                    }}
                    className="px-3 py-2 text-left text-xs text-[#0F1419] dark:text-[#F7F9F9] hover:bg-neutral-100 dark:hover:bg-[#202327] flex items-center gap-2 transition-colors"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Export Links Table (CSV)</span>
                  </button>
                  <button
                    onClick={() => {
                      onExportTxt();
                      setShowExportMenu(false);
                    }}
                    className="px-3 py-2 text-left text-xs text-[#0F1419] dark:text-[#F7F9F9] hover:bg-neutral-100 dark:hover:bg-[#202327] flex items-center gap-2 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-500" />
                    <span>Export URLs & Domains (TXT)</span>
                  </button>
                  <button
                    onClick={() => {
                      onExportJson();
                      setShowExportMenu(false);
                    }}
                    className="px-3 py-2 text-left text-xs text-[#0F1419] dark:text-[#F7F9F9] hover:bg-neutral-100 dark:hover:bg-[#202327] flex items-center gap-2 transition-colors"
                  >
                    <FileCode className="w-3.5 h-3.5 text-amber-500" />
                    <span>Export Scraped Data (JSON)</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Scraper Command Bar */}
      <div className="px-4 py-3 border-b border-[#F3F4F6] dark:border-[#1F2937] bg-white dark:bg-black">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Target Profile Input */}
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Enter real X profile URL or handle (e.g. x.com/jack or @jack)"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full pl-3.5 pr-28 py-2.5 text-xs sm:text-sm bg-neutral-100 dark:bg-[#16181C] text-[#0F1419] dark:text-[#F7F9F9] rounded-full border border-transparent focus:border-[#1D9BF0] focus:bg-white dark:focus:bg-black focus:outline-none transition-all placeholder:text-neutral-400 font-medium"
            />

            {/* Engine Select Badge inside input */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
              <select
                value={scrapeMode}
                onChange={(e) => setScrapeMode(e.target.value as any)}
                title="Select scraping engine"
                className="bg-neutral-200 dark:bg-[#25272C] text-[#0F1419] dark:text-[#F7F9F9] text-[11px] font-semibold rounded-full px-2 py-1 cursor-pointer focus:outline-none border-none"
              >
                <option value="puppeteer">⚡ Real Chrome</option>
                <option value="archive">🏛️ 2011–14 Archive</option>
                <option value="official">🔑 Official v2</option>
              </select>
            </div>
          </div>

          {/* From Beginning toggle button */}
          <button
            onClick={() => {
              const nextVal = !fromBeginning;
              setFromBeginning(nextVal);
              if (nextVal) {
                setSortOrder("asc");
              }
            }}
            title="Start from the account's beginning / earliest tweets"
            className={`px-3.5 py-2.5 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border ${
              fromBeginning
                ? "bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400"
                : "bg-neutral-100 dark:bg-[#16181C] border-transparent text-[#536471] dark:text-[#71767B] hover:text-[#0F1419] dark:hover:text-[#F7F9F9]"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>{fromBeginning ? "From Beginning (Active)" : "From Beginning"}</span>
          </button>

          {/* Advanced options button */}
          <button
            onClick={() => setShowOptions(!showOptions)}
            title="Configure scraper parameters, session cookies, and depth"
            className={`px-3 py-2.5 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border ${
              showOptions || authToken
                ? "bg-[#1D9BF0]/10 border-[#1D9BF0]/30 text-[#1D9BF0]"
                : "bg-neutral-100 dark:bg-[#16181C] border-transparent text-[#536471] dark:text-[#71767B] hover:text-[#0F1419] dark:hover:text-[#F7F9F9]"
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Options</span>
          </button>

          {/* Primary Scrape Button */}
          <button
            onClick={onFetch}
            disabled={isLoading || !targetInput.trim()}
            className="px-5 py-2.5 bg-[#0F1419] dark:bg-[#EFF3F4] text-white dark:text-[#0F1419] rounded-full text-xs sm:text-sm font-bold hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2 whitespace-nowrap"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Scraping x.com...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 fill-current text-amber-400" />
                <span>Scrape x.com</span>
              </>
            )}
          </button>
        </div>

        {/* Quick Presets row */}
        <div className="mt-2.5 flex items-center gap-1.5 flex-wrap text-xs text-[#536471] dark:text-[#71767B]">
          <span className="text-[11px] font-medium">Quick profiles:</span>
          <button
            onClick={() => {
              setTargetInput("cristiano");
              setFromBeginning(true);
              setSortOrder("asc");
            }}
            className="px-2 py-0.5 rounded text-[11px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 font-medium"
          >
            @cristiano (From Beginning 2010)
          </button>
          <button
            onClick={() => {
              setTargetInput("jack");
              setFromBeginning(true);
              setSortOrder("asc");
            }}
            className="px-2 py-0.5 rounded text-[11px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 font-medium"
          >
            @jack (From Beginning 2006)
          </button>
          <button
            onClick={() => {
              setTargetInput("cristiano");
              setFromBeginning(false);
              setSortOrder("desc");
            }}
            className="px-2 py-0.5 rounded text-[11px] bg-neutral-100 dark:bg-[#16181C] hover:bg-neutral-200 dark:hover:bg-[#25272c] text-[#0F1419] dark:text-[#F7F9F9]"
          >
            @cristiano (Recent Live)
          </button>
          <button
            onClick={() => applyPreset("elonmusk", "puppeteer")}
            className="px-2 py-0.5 rounded text-[11px] bg-neutral-100 dark:bg-[#16181C] hover:bg-neutral-200 dark:hover:bg-[#25272c] text-[#0F1419] dark:text-[#F7F9F9]"
          >
            @elonmusk (Live)
          </button>
          <button
            onClick={() => applyPreset("sama", "puppeteer")}
            className="px-2 py-0.5 rounded text-[11px] bg-neutral-100 dark:bg-[#16181C] hover:bg-neutral-200 dark:hover:bg-[#25272c] text-[#0F1419] dark:text-[#F7F9F9]"
          >
            @sama (Live)
          </button>
          <button
            onClick={() => applyPreset("jack", "archive")}
            className="px-2 py-0.5 rounded text-[11px] bg-neutral-100 dark:bg-[#16181C] hover:bg-neutral-200 dark:hover:bg-[#25272c] text-[#0F1419] dark:text-[#F7F9F9]"
          >
            @jack (2011–14 Legacy)
          </button>
        </div>

        {/* Expandable Advanced Options Drawer */}
        {showOptions && (
          <div className="mt-3 pt-3 border-t border-[#F3F4F6] dark:border-[#1F2937] text-xs space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Scroll Count / Depth */}
              <div>
                <label className="block text-[11px] font-semibold text-[#536471] dark:text-[#71767B] mb-1">
                  Timeline Scroll Depth:
                </label>
                <select
                  value={scrollCount}
                  onChange={(e) => setScrollCount(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-xs bg-neutral-100 dark:bg-[#16181C] text-[#0F1419] dark:text-[#F7F9F9] rounded-lg border border-transparent focus:border-[#1D9BF0] focus:outline-none"
                >
                  <option value={1}>1 Scroll (~5–8 posts)</option>
                  <option value={3}>3 Scrolls (~15–20 posts)</option>
                  <option value={5}>5 Scrolls (~25–35 posts)</option>
                  <option value={8}>8 Scrolls (~40–50 posts)</option>
                </select>
              </div>

              {/* Optional X Session Cookie auth_token */}
              <div>
                <label className="block text-[11px] font-semibold text-[#536471] dark:text-[#71767B] mb-1">
                  X auth_token (Optional session cookie):
                </label>
                <input
                  type="password"
                  placeholder="Paste auth_token from x.com cookies"
                  value={authToken}
                  onChange={(e) => setAuthToken(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-neutral-100 dark:bg-[#16181C] text-[#0F1419] dark:text-[#F7F9F9] rounded-lg border border-transparent focus:border-[#1D9BF0] focus:outline-none"
                />
              </div>

              {/* Optional X CSRF ct0 */}
              <div>
                <label className="block text-[11px] font-semibold text-[#536471] dark:text-[#71767B] mb-1">
                  X ct0 (Optional CSRF cookie):
                </label>
                <input
                  type="password"
                  placeholder="Paste ct0 token"
                  value={csrfToken}
                  onChange={(e) => setCsrfToken(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-neutral-100 dark:bg-[#16181C] text-[#0F1419] dark:text-[#F7F9F9] rounded-lg border border-transparent focus:border-[#1D9BF0] focus:outline-none"
                />
              </div>
            </div>

            <p className="text-[11px] text-[#536471] dark:text-[#71767B]">
              💡 <em>Tip:</em> To scrape deeper behind login walls without API limits, open Chrome DevTools on <code>x.com</code> &rarr; Application &rarr; Cookies &rarr; copy <code>auth_token</code>.
            </p>
          </div>
        )}
      </div>

      {/* Dashboard Navigation Tabs */}
      <div className="px-4 flex items-center justify-between border-b border-[#F3F4F6] dark:border-[#1F2937] overflow-x-auto bg-neutral-50/40 dark:bg-[#07090b]">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab("feed")}
            className={`px-3 py-2.5 text-xs font-bold transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === "feed"
                ? "border-[#1D9BF0] text-[#1D9BF0]"
                : "border-transparent text-[#536471] dark:text-[#71767B] hover:text-[#0F1419] dark:hover:text-[#F7F9F9]"
            }`}
          >
            <span>Timeline Feed</span>
            <span className="px-1.5 py-0.2 bg-neutral-200 dark:bg-neutral-800 rounded-full text-[10px]">
              {totalTweets}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("domains")}
            className={`px-3 py-2.5 text-xs font-bold transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === "domains"
                ? "border-[#1D9BF0] text-[#1D9BF0]"
                : "border-transparent text-[#536471] dark:text-[#71767B] hover:text-[#0F1419] dark:hover:text-[#F7F9F9]"
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Unique Domains</span>
            <span className="px-1.5 py-0.2 bg-[#1D9BF0]/15 text-[#1D9BF0] rounded-full text-[10px]">
              {uniqueDomainsCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("urls")}
            className={`px-3 py-2.5 text-xs font-bold transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === "urls"
                ? "border-[#1D9BF0] text-[#1D9BF0]"
                : "border-transparent text-[#536471] dark:text-[#71767B] hover:text-[#0F1419] dark:hover:text-[#F7F9F9]"
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Outbound URLs</span>
          </button>

          <button
            onClick={() => setActiveTab("bridge")}
            className={`px-3 py-2.5 text-xs font-bold transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === "bridge"
                ? "border-[#1D9BF0] text-[#1D9BF0]"
                : "border-transparent text-[#536471] dark:text-[#71767B] hover:text-[#0F1419] dark:hover:text-[#F7F9F9]"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>1-Click Live Bridge</span>
          </button>

          <button
            onClick={() => setActiveTab("paste")}
            className={`px-3 py-2.5 text-xs font-bold transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === "paste"
                ? "border-[#1D9BF0] text-[#1D9BF0]"
                : "border-transparent text-[#536471] dark:text-[#71767B] hover:text-[#0F1419] dark:hover:text-[#F7F9F9]"
            }`}
          >
            <span>Raw Ingest</span>
          </button>
        </div>
      </div>

      {/* Utility Shelf (Instant Search and Toggles) */}
      <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 bg-neutral-50/70 dark:bg-[#0B0E11]/70 border-b border-[#F3F4F6] dark:border-[#1F2937]">
        {/* Real-time search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search tweet text, URLs, domains, dates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-[#16181C] text-[#0F1419] dark:text-[#F7F9F9] rounded-full border border-[#E5E7EB] dark:border-[#2F3336] focus:border-[#1D9BF0] focus:outline-none placeholder:text-neutral-400 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Sort Order Toggle */}
          <button
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            title="Toggle sort order: Oldest First (Beginning) vs Newest First"
            className="px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 bg-white dark:bg-[#16181C] border border-[#E5E7EB] dark:border-[#2F3336] text-[#0F1419] dark:text-[#F7F9F9] hover:border-[#1D9BF0] transition-colors"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-[#1D9BF0]" />
            <span>{sortOrder === "asc" ? "Oldest (Beginning)" : "Newest First"}</span>
          </button>
          {/* Outbound Link Toggle */}
          <button
            onClick={() => setOnlyLinks(!onlyLinks)}
            title="Filter to posts with external outbound links"
            className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-colors border ${
              onlyLinks
                ? "bg-[#1D9BF0] border-[#1D9BF0] text-white"
                : "bg-white dark:bg-[#16181C] border-[#E5E7EB] dark:border-[#2F3336] text-[#536471] dark:text-[#71767B] hover:text-[#0F1419] dark:hover:text-[#F7F9F9]"
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Has Links Only</span>
          </button>

          {/* Domain Inspector quick trigger */}
          <button
            onClick={onOpenDomainDrawer}
            title="Open side drawer inspector"
            className="px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 bg-white dark:bg-[#16181C] border border-[#E5E7EB] dark:border-[#2F3336] text-[#0F1419] dark:text-[#F7F9F9] hover:border-[#1D9BF0] transition-colors"
          >
            <Globe className="w-3.5 h-3.5 text-[#1D9BF0]" />
            <span>Domain Drawer ({uniqueDomainsCount})</span>
          </button>

          {/* Active Domain chip */}
          {selectedDomain && (
            <div className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-[#1D9BF0]/10 text-[#1D9BF0] rounded-full border border-[#1D9BF0]/20 font-mono">
              <span>{selectedDomain}</span>
              <button
                onClick={() => setSelectedDomain(null)}
                className="hover:opacity-75 ml-0.5 font-bold"
              >
                ×
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Active Filter Row */}
      {(searchQuery || onlyLinks || selectedDomain) && (
        <div className="px-4 py-1.5 bg-neutral-100/60 dark:bg-neutral-900/60 border-t border-[#F3F4F6] dark:border-[#1F2937] flex items-center justify-between text-[11px] text-[#536471] dark:text-[#71767B]">
          <span>
            Showing <strong>{filteredCount}</strong> of {totalTweets} posts
          </span>
          <button
            onClick={() => {
              setSearchQuery("");
              setOnlyLinks(false);
              setSelectedDomain(null);
            }}
            className="hover:underline text-[#1D9BF0]"
          >
            Reset all filters
          </button>
        </div>
      )}
    </header>
  );
};
