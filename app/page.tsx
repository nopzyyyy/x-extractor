"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Tweet, ExtractedDomain, ScrapeResponse } from "@/types/tweet";
import { HeaderSearch } from "@/components/HeaderSearch";
import { TweetCard } from "@/components/TweetCard";
import { DomainSummary } from "@/components/DomainSummary";
import { DashboardTabs } from "@/components/DashboardTabs";
import { aggregateDomains } from "@/lib/parser";
import {
  AlertCircle,
  Inbox,
  Link2,
  Globe,
  Share2,
  CheckCircle2,
  FileSpreadsheet,
  Activity,
} from "lucide-react";

export default function Home() {
  // Scraper controls state
  const [targetInput, setTargetInput] = useState("@cristiano");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [scrapeMode, setScrapeMode] = useState<"puppeteer" | "archive" | "official">("puppeteer");
  const [scrollCount, setScrollCount] = useState<number>(2);
  const [authToken, setAuthToken] = useState("");
  const [csrfToken, setCsrfToken] = useState("");
  const [fromBeginning, setFromBeginning] = useState(true);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Tab state
  const [activeTab, setActiveTab] = useState<"feed" | "domains" | "urls" | "bridge" | "paste">("feed");

  // Ingestion status
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrapeNotice, setScrapeNotice] = useState<string | null>(null);

  // Ingested data
  const [profile, setProfile] = useState<ScrapeResponse["profile"] | null>(null);
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [domains, setDomains] = useState<ExtractedDomain[]>([]);

  // Client-side instant search & domain filter
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyLinks, setOnlyLinks] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  // Domain Drawer
  const [isDomainDrawerOpen, setIsDomainDrawerOpen] = useState(false);

  // Primary Scrape Action
  const fetchArchive = useCallback(
    async (
      overrideTarget?: string,
      overrideMode?: "puppeteer" | "archive" | "official",
      overrideScroll?: number,
      overrideFromBeginning?: boolean
    ) => {
      const target = overrideTarget || targetInput;
      const mode = overrideMode || scrapeMode;
      const scrolls = overrideScroll !== undefined ? overrideScroll : scrollCount;
      const beginning = overrideFromBeginning !== undefined ? overrideFromBeginning : fromBeginning;

      if (!target.trim()) return;

      setIsLoading(true);
      setError(null);
      setScrapeNotice(null);

      try {
        const res = await fetch("/api/scrape-x", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target,
            mode,
            scrollCount: scrolls,
            fromBeginning: beginning,
            authToken: authToken.trim() || undefined,
            csrfToken: csrfToken.trim() || undefined,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
          }),
        });

        const data: ScrapeResponse = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to fetch posts from x.com");
        }

        setProfile(data.profile || null);
        setTweets(data.tweets || []);
        setDomains(data.domains || []);

        if (data.error) {
          setScrapeNotice(data.error);
        }
      } catch (err: any) {
        setError(err.message || "An unexpected error occurred during scraping.");
      } finally {
        setIsLoading(false);
      }
    },
    [targetInput, scrapeMode, scrollCount, authToken, csrfToken, startDate, endDate]
  );

  // Raw HTML or JSON ingestion handler
  const handleIngestRaw = async (rawHtml: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ingest-scraped", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawHtml }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to parse raw HTML input.");
      }
      setProfile(data.profile);
      setTweets(data.tweets);
      setDomains(data.domains);
      setActiveTab("feed");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load: fast preload starting from the beginning
  useEffect(() => {
    fetchArchive("@cristiano", "archive", 2, true);
  }, []);

  // Client-side filtering and sorting logic
  const filteredTweets = useMemo(() => {
    const list = tweets.filter((t) => {
      if (onlyLinks && (!t.urls || t.urls.length === 0)) {
        return false;
      }
      if (selectedDomain && !t.domains.includes(selectedDomain)) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesText = t.text.toLowerCase().includes(query);
        const matchesAuthor =
          t.author.name.toLowerCase().includes(query) ||
          t.author.handle.toLowerCase().includes(query);
        const matchesDate = t.createdAt.toLowerCase().includes(query);
        const matchesUrls = t.urls.some((u) => u.toLowerCase().includes(query));
        const matchesDomains = t.domains.some((d) => d.toLowerCase().includes(query));

        if (!matchesText && !matchesAuthor && !matchesDate && !matchesUrls && !matchesDomains) {
          return false;
        }
      }
      return true;
    });

    return [...list].sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      if (isNaN(timeA) || isNaN(timeB)) return 0;
      return sortOrder === "asc" ? timeA - timeB : timeB - timeA;
    });
  }, [tweets, onlyLinks, selectedDomain, searchQuery, sortOrder]);

  // Aggregate domains dynamically
  const computedDomains = useMemo(() => {
    return domains.length > 0 ? domains : aggregateDomains(tweets);
  }, [domains, tweets]);

  const totalLinkOccurrences = useMemo(() => {
    return computedDomains.reduce((acc, d) => acc + d.count, 0);
  }, [computedDomains]);

  // Exporters
  const exportCsv = () => {
    if (tweets.length === 0) return;
    const rows = [["Tweet ID", "Created At", "Author Handle", "Domain", "Extracted URL", "Tweet Text"]];
    for (const t of tweets) {
      if (t.urls.length > 0) {
        for (const u of t.urls) {
          const d = t.domains.find((dom) => u.includes(dom)) || "";
          rows.push([
            `"${t.id}"`,
            `"${t.createdAt}"`,
            `"@${t.author.handle}"`,
            `"${d}"`,
            `"${u}"`,
            `"${t.text.replace(/"/g, '""')}"`,
          ]);
        }
      } else {
        rows.push([
          `"${t.id}"`,
          `"${t.createdAt}"`,
          `"@${t.author.handle}"`,
          '""',
          '""',
          `"${t.text.replace(/"/g, '""')}"`,
        ]);
      }
    }
    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.href = encodedUri;
    link.download = `x-scrape-${profile?.handle || "tweets"}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportTxt = () => {
    if (tweets.length === 0) return;
    const allUrls = Array.from(new Set(tweets.flatMap((t) => t.urls)));
    const allDomains = computedDomains.map((d) => `${d.domain} (${d.count} occurrences)`);
    const content = [
      `=== EXTRACTED DOMAINS (${computedDomains.length}) ===`,
      ...allDomains,
      "",
      `=== EXTRACTED OUTBOUND URLS (${allUrls.length}) ===`,
      ...allUrls,
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `x-urls-${profile?.handle || "links"}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportJson = () => {
    if (tweets.length === 0) return;
    const exportData = {
      scrapedAt: new Date().toISOString(),
      engine: scrapeMode,
      profile,
      summary: {
        totalTweets: tweets.length,
        totalUniqueDomains: computedDomains.length,
        totalLinkReferences: totalLinkOccurrences,
      },
      domains: computedDomains,
      tweets,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `x-scraped-${profile?.handle || "feed"}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-black text-[#0F1419] dark:text-[#F7F9F9] flex justify-center">
      {/* Central Timeline & Dashboard Container */}
      <div className="w-full max-w-3xl bg-white dark:bg-black min-h-screen border-x border-[#F3F4F6] dark:border-[#1F2937] flex flex-col">
        {/* Header & Scraper Controls */}
        <HeaderSearch
          targetInput={targetInput}
          setTargetInput={setTargetInput}
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
          scrapeMode={scrapeMode}
          setScrapeMode={setScrapeMode}
          scrollCount={scrollCount}
          setScrollCount={setScrollCount}
          authToken={authToken}
          setAuthToken={setAuthToken}
          csrfToken={csrfToken}
          setCsrfToken={setCsrfToken}
          onFetch={() => fetchArchive()}
          isLoading={isLoading}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onlyLinks={onlyLinks}
          setOnlyLinks={setOnlyLinks}
          selectedDomain={selectedDomain}
          setSelectedDomain={setSelectedDomain}
          uniqueDomainsCount={computedDomains.length}
          onOpenDomainDrawer={() => setIsDomainDrawerOpen(true)}
          onExportCsv={exportCsv}
          onExportTxt={exportTxt}
          onExportJson={exportJson}
          totalTweets={tweets.length}
          filteredCount={filteredTweets.length}
          fromBeginning={fromBeginning}
          setFromBeginning={setFromBeginning}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />

        {/* Scrape Notice or Error alert */}
        {error && (
          <div className="m-4 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-400 flex items-start gap-3 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <strong className="font-semibold block mb-0.5">Scraping Note</strong>
              <p>{error}</p>
            </div>
          </div>
        )}

        {scrapeNotice && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{scrapeNotice}</span>
          </div>
        )}

        {/* Profile Card & KPI Metrics Banner */}
        {profile && (
          <div className="px-5 py-4 border-b border-[#F3F4F6] dark:border-[#1F2937] bg-white dark:bg-black">
            <div className="flex items-start gap-3 mb-3">
              {profile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatarUrl}
                  alt={profile.name}
                  className="w-12 h-12 rounded-full object-cover bg-neutral-200 dark:bg-neutral-800 flex-shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-neutral-200 dark:bg-neutral-800 text-[#0F1419] dark:text-[#F7F9F9] font-bold text-base flex items-center justify-center flex-shrink-0">
                  {profile.name.slice(0, 2).toUpperCase()}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h1 className="text-base font-bold text-[#0F1419] dark:text-[#F7F9F9] truncate">
                    {profile.name}
                  </h1>
                  {profile.verified && (
                    <span className="text-[#1D9BF0]" title="Verified">
                      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                        <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z" />
                      </svg>
                    </span>
                  )}
                  <span className="text-xs text-[#536471] dark:text-[#71767B]">
                    @{profile.handle}
                  </span>
                  {profile.joinedDate && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <span>Joined {profile.joinedDate}</span>
                      {fromBeginning && <span>· Day 1 Founding Era</span>}
                    </span>
                  )}
                  <a
                    href={`https://x.com/${profile.handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[#1D9BF0] hover:underline"
                  >
                    Open on x.com ↗
                  </a>
                </div>

                {profile.bio && (
                  <p className="text-xs text-[#0F1419] dark:text-[#E7E9EA] mt-1 line-clamp-2">
                    {profile.bio}
                  </p>
                )}
              </div>
            </div>

            {/* Dashboard KPI Grid */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#F3F4F6] dark:border-[#1F2937]">
              <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-[#16181C]">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#536471] dark:text-[#71767B] block">
                  Scraped Posts
                </span>
                <span className="text-base font-bold text-[#0F1419] dark:text-[#F7F9F9]">
                  {tweets.length}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-[#16181C]">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#536471] dark:text-[#71767B] block">
                  Unique Root Domains
                </span>
                <span className="text-base font-bold text-[#1D9BF0]">
                  {computedDomains.length}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-[#16181C]">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#536471] dark:text-[#71767B] block">
                  Outbound Links
                </span>
                <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                  {totalLinkOccurrences}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content Rendering */}
        <div className="flex-1">
          {activeTab === "feed" ? (
            <main className="divide-y divide-[#F3F4F6] dark:divide-[#1F2937]">
              {isLoading && tweets.length === 0 ? (
                <div className="py-24 text-center text-[#536471] dark:text-[#71767B]">
                  <div className="inline-block animate-spin mb-3">
                    <svg className="w-7 h-7 text-[#1D9BF0]" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold">Scraping real posts directly from x.com...</p>
                </div>
              ) : filteredTweets.length === 0 ? (
                <div className="py-20 px-6 text-center text-[#536471] dark:text-[#71767B]">
                  <Inbox className="w-10 h-10 mx-auto mb-3 opacity-40 text-neutral-400" />
                  <h3 className="font-semibold text-sm text-[#0F1419] dark:text-[#F7F9F9] mb-1">
                    No matching posts found
                  </h3>
                  <p className="text-xs max-w-sm mx-auto mb-4">
                    {tweets.length === 0
                      ? "Enter an X profile URL above and click 'Scrape x.com' to fetch live posts."
                      : "No posts match your current search query or domain filter."}
                  </p>
                  {(searchQuery || onlyLinks || selectedDomain) && (
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setOnlyLinks(false);
                        setSelectedDomain(null);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-[#1D9BF0] border border-[#1D9BF0] rounded-full hover:bg-[#1D9BF0]/10 transition-colors"
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
              ) : (
                filteredTweets.map((tweet) => (
                  <TweetCard
                    key={tweet.id}
                    tweet={tweet}
                    onFilterDomain={(domain) => setSelectedDomain(domain)}
                  />
                ))
              )}
            </main>
          ) : (
            <DashboardTabs
              activeTab={activeTab}
              domains={computedDomains}
              tweets={tweets}
              selectedDomain={selectedDomain}
              onSelectDomain={setSelectedDomain}
              onIngestRawHtml={handleIngestRaw}
              isLoading={isLoading}
            />
          )}
        </div>

        {/* Drawer for Domain Inspector */}
        <DomainSummary
          domains={computedDomains}
          selectedDomain={selectedDomain}
          onSelectDomain={setSelectedDomain}
          isOpen={isDomainDrawerOpen}
          onClose={() => setIsDomainDrawerOpen(false)}
        />
      </div>
    </div>
  );
}
