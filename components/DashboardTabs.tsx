"use client";

import React, { useState } from "react";
import { Tweet, ExtractedDomain } from "@/types/tweet";
import {
  Globe,
  ExternalLink,
  Copy,
  Check,
  Filter,
  Link2,
  Sparkles,
  Clipboard,
  Code,
  ShieldCheck,
  ArrowUpRight,
  Send,
} from "lucide-react";

interface DashboardTabsProps {
  activeTab: "feed" | "domains" | "urls" | "bridge" | "paste";
  domains: ExtractedDomain[];
  tweets: Tweet[];
  selectedDomain: string | null;
  onSelectDomain: (domain: string | null) => void;
  onIngestRawHtml: (html: string) => void;
  isLoading: boolean;
}

export const DashboardTabs: React.FC<DashboardTabsProps> = ({
  activeTab,
  domains,
  tweets,
  selectedDomain,
  onSelectDomain,
  onIngestRawHtml,
  isLoading,
}) => {
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [rawInput, setRawInput] = useState("");

  const handleCopy = (val: string, id: string) => {
    navigator.clipboard.writeText(val);
    setCopiedItem(id);
    setTimeout(() => setCopiedItem(null), 1800);
  };

  const totalLinkOccurrences = domains.reduce((acc, d) => acc + d.count, 0);

  // Collect all outbound URLs across tweets
  const allOutboundUrls = React.useMemo(() => {
    const list: { url: string; domain: string; tweetText: string; tweetId: string; tweetDate: string }[] = [];
    for (const t of tweets) {
      for (const u of t.urls) {
        const d = t.domains.find((dom) => u.includes(dom)) || "external";
        list.push({
          url: u,
          domain: d,
          tweetText: t.text,
          tweetId: t.id,
          tweetDate: t.createdAt,
        });
      }
    }
    return list;
  }, [tweets]);

  // Bookmarklet code string
  const bookmarkletCode = `javascript:(function(){const arts=Array.from(document.querySelectorAll('article'));if(!arts.length){alert('No tweets found on page. Scroll down or wait for x.com to load.');return;}const tweets=arts.map((art,idx)=>{const textEl=art.querySelector('[data-testid="tweetText"]');const text=textEl?textEl.innerText:(art.innerText||'');const timeEl=art.querySelector('time');const createdAt=timeEl?timeEl.getAttribute('datetime'):new Date().toISOString();const authorEl=art.querySelector('[data-testid="User-Name"]');const aText=authorEl?authorEl.innerText:'';const authorName=aText.split('\\n')[0]||'User';const handleMatch=aText.match(/@([a-zA-Z0-9_]+)/);const authorHandle=handleMatch?handleMatch[1]:window.location.pathname.replace(/^\\//,'').split('/')[0]||'user';const links=Array.from(art.querySelectorAll('a')).map(a=>a.href).filter(h=>(h.startsWith('http')||h.startsWith('https'))&&!h.includes('x.com/')&&!h.includes('twitter.com/'));const statusLink=art.querySelector('a[href*="/status/"]');const id=statusLink?statusLink.href.split('/status/')[1].split('/')[0]:'scraped-'+Date.now()+'-'+idx;return{id,text,authorName,authorHandle,createdAt,links};});fetch('http://localhost:3002/api/ingest-scraped',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile:{name:document.title.split('(')[0].trim()||'X User',handle:window.location.pathname.replace(/^\\//,'').split('/')[0]},tweets})}).then(r=>r.json()).then(d=>alert('✅ Scraped '+d.tweets.length+' real tweets and beamed directly to your X Scraper Dashboard!')).catch(e=>alert('Bridge Error: '+e.message));})();`;

  // TAB: DOMAINS
  if (activeTab === "domains") {
    return (
      <div className="p-4 bg-white dark:bg-black">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-base text-[#0F1419] dark:text-[#F7F9F9]">
              Domain Intelligence & Registrar Inspection
            </h3>
            <p className="text-xs text-[#536471] dark:text-[#71767B]">
              Aggregated root domains found across posts with instant registrar availability queries.
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs font-semibold text-[#0F1419] dark:text-[#F7F9F9]">
              {domains.length} Unique Domains
            </span>
            <span className="block text-[11px] text-[#536471] dark:text-[#71767B]">
              {totalLinkOccurrences} Link References
            </span>
          </div>
        </div>

        {domains.length === 0 ? (
          <div className="py-16 text-center text-xs text-neutral-400">
            No outbound domains detected yet. Scrape an account containing outbound links to see analytics.
          </div>
        ) : (
          <div className="border border-[#F3F4F6] dark:border-[#1F2937] rounded-xl overflow-hidden divide-y divide-[#F3F4F6] dark:divide-[#1F2937]">
            {/* Table Header */}
            <div className="grid grid-cols-12 px-4 py-2.5 bg-neutral-50 dark:bg-[#16181C] text-[11px] font-bold text-[#536471] dark:text-[#71767B] uppercase tracking-wider">
              <div className="col-span-4">Root Domain</div>
              <div className="col-span-2 text-center">References</div>
              <div className="col-span-2 text-center">Share</div>
              <div className="col-span-4 text-right">Actions</div>
            </div>

            {/* Table Rows */}
            {domains.map((d) => {
              const isSelected = selectedDomain === d.domain;
              const percentage = totalLinkOccurrences > 0
                ? Math.round((d.count / totalLinkOccurrences) * 100)
                : 0;

              return (
                <div
                  key={d.domain}
                  className={`grid grid-cols-12 px-4 py-3 items-center text-xs transition-colors ${
                    isSelected
                      ? "bg-[#1D9BF0]/5 dark:bg-[#1D9BF0]/10"
                      : "hover:bg-neutral-50/70 dark:hover:bg-neutral-900/30"
                  }`}
                >
                  {/* Domain Name & Sample */}
                  <div className="col-span-4 min-w-0 pr-2">
                    <span className="font-mono font-bold text-sm text-[#0F1419] dark:text-[#F7F9F9] block truncate">
                      {d.domain}
                    </span>
                    {d.sampleUrls && d.sampleUrls[0] && (
                      <span className="text-[11px] text-neutral-400 font-mono block truncate">
                        {d.sampleUrls[0]}
                      </span>
                    )}
                  </div>

                  {/* Occurrence Count */}
                  <div className="col-span-2 text-center">
                    <span className="inline-block px-2.5 py-0.5 rounded-full font-bold text-xs bg-neutral-100 dark:bg-neutral-800 text-[#0F1419] dark:text-[#F7F9F9]">
                      {d.count}
                    </span>
                  </div>

                  {/* Share % */}
                  <div className="col-span-2 text-center text-[#536471] dark:text-[#71767B] font-mono">
                    {percentage}%
                  </div>

                  {/* Action Buttons */}
                  <div className="col-span-4 flex items-center justify-end gap-1.5 flex-wrap">
                    {/* Filter feed button */}
                    <button
                      onClick={() => onSelectDomain(isSelected ? null : d.domain)}
                      title="Filter feed by this domain"
                      className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                        isSelected
                          ? "bg-[#1D9BF0] text-white"
                          : "bg-neutral-100 dark:bg-neutral-800 text-[#0F1419] dark:text-[#F7F9F9] hover:bg-neutral-200 dark:hover:bg-neutral-700"
                      }`}
                    >
                      <Filter className="w-3 h-3" />
                      <span>{isSelected ? "Filtered" : "Filter"}</span>
                    </button>

                    {/* Copy Domain */}
                    <button
                      onClick={() => handleCopy(d.domain, d.domain)}
                      title="Copy domain name"
                      className="p-1.5 rounded text-neutral-500 hover:text-[#0F1419] dark:hover:text-[#F7F9F9] bg-neutral-100 dark:bg-neutral-800 transition-colors"
                    >
                      {copiedItem === d.domain ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {/* Namecheap Registrar check */}
                    <a
                      href={d.registrarUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Check registrar availability on Namecheap"
                      className="px-2 py-1 rounded text-[11px] font-semibold bg-[#1D9BF0]/10 text-[#1D9BF0] hover:bg-[#1D9BF0]/20 inline-flex items-center gap-1 transition-colors"
                    >
                      <span>Namecheap</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </a>

                    {/* WHOIS lookup */}
                    <a
                      href={d.whoisUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="WHOIS lookup"
                      className="p-1.5 rounded text-neutral-500 hover:text-[#0F1419] dark:hover:text-[#F7F9F9] bg-neutral-100 dark:bg-neutral-800 transition-colors"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // TAB: OUTBOUND URLS DIRECTORY
  if (activeTab === "urls") {
    return (
      <div className="p-4 bg-white dark:bg-black">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-base text-[#0F1419] dark:text-[#F7F9F9]">
              Outbound URL Registry
            </h3>
            <p className="text-xs text-[#536471] dark:text-[#71767B]">
              Every external link extracted across the target posts timeline.
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-[#0F1419] dark:text-[#F7F9F9]">
            {allOutboundUrls.length} URLs
          </span>
        </div>

        {allOutboundUrls.length === 0 ? (
          <div className="py-16 text-center text-xs text-neutral-400">
            No external outbound links extracted from current posts.
          </div>
        ) : (
          <div className="border border-[#F3F4F6] dark:border-[#1F2937] rounded-xl overflow-hidden divide-y divide-[#F3F4F6] dark:divide-[#1F2937]">
            {allOutboundUrls.map((item, idx) => (
              <div
                key={idx}
                className="p-3 hover:bg-neutral-50/70 dark:hover:bg-neutral-900/30 transition-colors flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[#0F1419] dark:text-[#F7F9F9]">
                      {item.domain}
                    </span>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-[#1D9BF0] hover:underline truncate block max-w-md"
                    >
                      {item.url}
                    </a>
                  </div>
                  <p className="text-[11px] text-[#536471] dark:text-[#71767B] truncate">
                    Tweet: &ldquo;{item.tweetText}&rdquo;
                  </p>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleCopy(item.url, `url-${idx}`)}
                    className="p-1.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:text-[#0F1419] dark:hover:text-[#F7F9F9] transition-colors"
                    title="Copy URL"
                  >
                    {copiedItem === `url-${idx}` ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:text-[#1D9BF0] transition-colors"
                    title="Open destination URL"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // TAB: LIVE BRIDGE & BOOKMARKLET
  if (activeTab === "bridge") {
    return (
      <div className="p-5 bg-white dark:bg-black space-y-6 text-xs">
        <div>
          <h3 className="font-bold text-base text-[#0F1419] dark:text-[#F7F9F9] mb-1">
            🚀 1-Click In-Browser Scraping Bridge for Real x.com
          </h3>
          <p className="text-[#536471] dark:text-[#71767B]">
            Scrape directly from your own authenticated browser tab on <strong>x.com</strong> with zero rate limits!
          </p>
        </div>

        {/* Method 1: Bookmarklet */}
        <div className="p-4 rounded-xl border border-[#F3F4F6] dark:border-[#1F2937] bg-neutral-50/50 dark:bg-[#0B0E11]">
          <h4 className="font-bold text-sm text-[#0F1419] dark:text-[#F7F9F9] mb-2 flex items-center gap-2">
            <span>Method 1: Drag-and-Drop Bookmarklet</span>
          </h4>
          <p className="text-[#536471] dark:text-[#71767B] mb-3">
            Drag the button below directly into your Chrome/Edge bookmarks bar. Whenever you are browsing any profile on <code>x.com</code>, simply click the bookmark to instantly send all visible and loaded tweets into this Dashboard!
          </p>

          <div className="py-2">
            <a
              href={bookmarkletCode}
              onClick={(e) => {
                // Prevent navigation if accidentally clicked directly
                if (window.location.protocol.startsWith("http")) {
                  e.preventDefault();
                  alert("Drag this button to your browser Bookmarks Bar, then click it while viewing any profile on x.com!");
                }
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1D9BF0] hover:bg-[#1A8CD8] text-white font-bold rounded-full text-xs cursor-grab active:cursor-grabbing transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              <span>𝕏 Scrape to Dashboard</span>
            </a>
          </div>
        </div>

        {/* Method 2: DevTools 1-liner */}
        <div className="p-4 rounded-xl border border-[#F3F4F6] dark:border-[#1F2937] bg-neutral-50/50 dark:bg-[#0B0E11]">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-bold text-sm text-[#0F1419] dark:text-[#F7F9F9] flex items-center gap-2">
              <Code className="w-4 h-4 text-emerald-500" />
              <span>Method 2: 1-Line Console Snippet</span>
            </h4>
            <button
              onClick={() => handleCopy(bookmarkletCode.replace(/^javascript:/, ""), "console-snippet")}
              className="px-2.5 py-1 bg-neutral-200 dark:bg-neutral-800 text-[#0F1419] dark:text-[#F7F9F9] rounded-md font-semibold flex items-center gap-1 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors"
            >
              {copiedItem === "console-snippet" ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Snippet</span>
                </>
              )}
            </button>
          </div>
          <p className="text-[#536471] dark:text-[#71767B] mb-2">
            Open any profile on <code>x.com</code>, press <code>F12</code> (or right click &rarr; Inspect &rarr; Console), paste this 1-liner and hit Enter:
          </p>
          <pre className="p-3 bg-neutral-900 text-neutral-200 rounded-lg overflow-x-auto text-[11px] font-mono leading-relaxed select-all">
            {bookmarkletCode.replace(/^javascript:/, "")}
          </pre>
        </div>
      </div>
    );
  }

  // TAB: RAW INGEST
  if (activeTab === "paste") {
    return (
      <div className="p-5 bg-white dark:bg-black space-y-4 text-xs">
        <div>
          <h3 className="font-bold text-base text-[#0F1419] dark:text-[#F7F9F9] mb-1">
            Raw HTML & JSON Ingestion
          </h3>
          <p className="text-[#536471] dark:text-[#71767B]">
            Paste raw HTML copied from <code>x.com</code> Elements or tweet text to instantly extract all URLs and root domains.
          </p>
        </div>

        <div className="space-y-2">
          <textarea
            rows={10}
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder="Paste HTML source from x.com or raw tweet text here..."
            className="w-full p-3 font-mono text-xs bg-neutral-50 dark:bg-[#16181C] text-[#0F1419] dark:text-[#F7F9F9] border border-[#E5E7EB] dark:border-[#2F3336] rounded-xl focus:border-[#1D9BF0] focus:outline-none"
          />

          <div className="flex justify-end">
            <button
              onClick={() => {
                if (rawInput.trim()) {
                  onIngestRawHtml(rawInput);
                  setRawInput("");
                }
              }}
              disabled={!rawInput.trim() || isLoading}
              className="px-4 py-2 bg-[#0F1419] dark:bg-[#EFF3F4] text-white dark:text-[#0F1419] rounded-full font-bold flex items-center gap-2 hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Analyze & Extract Outbound Domains</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
