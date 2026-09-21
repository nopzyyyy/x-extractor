"use client";

import React, { useState } from "react";
import { ExtractedDomain } from "@/types/tweet";
import { Globe, ExternalLink, Copy, Check, Filter, X, Search, ShieldCheck } from "lucide-react";

interface DomainSummaryProps {
  domains: ExtractedDomain[];
  selectedDomain: string | null;
  onSelectDomain: (domain: string | null) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const DomainSummary: React.FC<DomainSummaryProps> = ({
  domains,
  selectedDomain,
  onSelectDomain,
  isOpen,
  onClose,
}) => {
  const [search, setSearch] = useState("");
  const [copiedDomain, setCopiedDomain] = useState<string | null>(null);

  if (!isOpen) return null;

  const filteredDomains = domains.filter((d) =>
    d.domain.toLowerCase().includes(search.toLowerCase().trim())
  );

  const handleCopy = (domain: string) => {
    navigator.clipboard.writeText(domain);
    setCopiedDomain(domain);
    setTimeout(() => setCopiedDomain(null), 1800);
  };

  const totalLinkOccurrences = domains.reduce((acc, d) => acc + d.count, 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[2px]">
      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Drawer Container (Flat, crisp, borderless, zero shadows) */}
      <div className="relative w-full max-w-md bg-white dark:bg-[#0B0E11] h-full flex flex-col border-l border-[#F3F4F6] dark:border-[#1F2937] z-10">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#F3F4F6] dark:border-[#1F2937] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-[#1D9BF0]" />
            <div>
              <h2 className="font-bold text-base text-[#0F1419] dark:text-[#F7F9F9]">
                Domain Inspector
              </h2>
              <p className="text-xs text-[#536471] dark:text-[#71767B]">
                {domains.length} unique domains · {totalLinkOccurrences} total link references
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search input inside drawer */}
        <div className="p-4 border-b border-[#F3F4F6] dark:border-[#1F2937]">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search extracted domains..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-neutral-100 dark:bg-[#16181C] text-[#0F1419] dark:text-[#F7F9F9] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1D9BF0] border border-transparent placeholder:text-neutral-400"
            />
          </div>
        </div>

        {/* Active filter alert if one is selected */}
        {selectedDomain && (
          <div className="px-4 py-2 bg-[#1D9BF0]/10 border-b border-[#1D9BF0]/20 flex items-center justify-between text-xs text-[#1D9BF0]">
            <span>
              Timeline filtered to: <strong>{selectedDomain}</strong>
            </span>
            <button
              onClick={() => onSelectDomain(null)}
              className="font-medium underline hover:text-[#1A8CD8]"
            >
              Clear filter
            </button>
          </div>
        )}

        {/* Domain List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#F3F4F6] dark:divide-[#1F2937]">
          {filteredDomains.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-400">
              No matching domains found.
            </div>
          ) : (
            filteredDomains.map((d) => {
              const isSelected = selectedDomain === d.domain;
              const isCopied = copiedDomain === d.domain;

              return (
                <div
                  key={d.domain}
                  className={`p-4 transition-colors ${
                    isSelected
                      ? "bg-[#1D9BF0]/5 dark:bg-[#1D9BF0]/10"
                      : "hover:bg-neutral-50 dark:hover:bg-neutral-900/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Domain & occurrence count */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-semibold text-[#0F1419] dark:text-[#F7F9F9] truncate">
                          {d.domain}
                        </span>
                        <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                          {d.count} {d.count === 1 ? "link" : "links"}
                        </span>
                      </div>

                      {/* Sample URL snippet */}
                      {d.sampleUrls && d.sampleUrls.length > 0 && (
                        <p className="text-[11px] text-neutral-400 truncate max-w-xs font-mono">
                          eg: {d.sampleUrls[0]}
                        </p>
                      )}
                    </div>

                    {/* Quick action buttons */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Filter timeline */}
                      <button
                        onClick={() => {
                          if (isSelected) {
                            onSelectDomain(null);
                          } else {
                            onSelectDomain(d.domain);
                            onClose();
                          }
                        }}
                        title={isSelected ? "Remove filter" : "Filter feed by this domain"}
                        className={`p-1.5 rounded text-xs inline-flex items-center gap-1 transition-colors ${
                          isSelected
                            ? "bg-[#1D9BF0] text-white"
                            : "text-neutral-500 hover:text-[#1D9BF0] hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        }`}
                      >
                        <Filter className="w-3.5 h-3.5" />
                      </button>

                      {/* Copy Domain */}
                      <button
                        onClick={() => handleCopy(d.domain)}
                        title="Copy domain name"
                        className="p-1.5 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
                      >
                        {isCopied ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {/* Registrar Check (Namecheap) */}
                      <a
                        href={d.registrarUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Check Registrar Availability on Namecheap"
                        className="p-1.5 text-[#1D9BF0] hover:bg-[#1D9BF0]/10 rounded transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>

                      {/* WHOIS link */}
                      <a
                        href={d.whoisUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Lookup WHOIS"
                        className="p-1.5 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="p-4 border-t border-[#F3F4F6] dark:border-[#1F2937] text-[11px] text-neutral-400 flex items-center justify-between">
          <span>Click domain to filter feed</span>
          <span>Click link to check registrar availability</span>
        </div>
      </div>
    </div>
  );
};
