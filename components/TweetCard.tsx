"use client";

import React, { useState } from "react";
import { Tweet } from "@/types/tweet";
import { tokenizeTweetText, extractDomain } from "@/lib/parser";
import { MessageCircle, Repeat2, Heart, Share, ExternalLink, Check, Copy } from "lucide-react";

interface TweetCardProps {
  tweet: Tweet;
  onFilterDomain?: (domain: string) => void;
}

export const TweetCard: React.FC<TweetCardProps> = ({ tweet, onFilterDomain }) => {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const formattedDate = React.useMemo(() => {
    try {
      const d = new Date(tweet.createdAt);
      if (isNaN(d.getTime())) return tweet.createdAt;
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return tweet.createdAt;
    }
  }, [tweet.createdAt]);

  const timeTitle = React.useMemo(() => {
    try {
      return new Date(tweet.createdAt).toUTCString();
    } catch {
      return tweet.createdAt;
    }
  }, [tweet.createdAt]);

  const tokens = React.useMemo(() => {
    return tokenizeTweetText(tweet.text);
  }, [tweet.text]);

  const handleCopy = (url: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 1800);
  };

  // Avatar initials fallback
  const initials = tweet.author.name
    ? tweet.author.name
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : tweet.author.handle.slice(0, 2).toUpperCase();

  return (
    <article className="px-4 py-3 bg-white dark:bg-black border-b border-[#F3F4F6] dark:border-[#1F2937] transition-colors hover:bg-neutral-50/50 dark:hover:bg-neutral-900/30">
      <div className="flex gap-3">
        {/* Author Avatar */}
        <div className="flex-shrink-0">
          {tweet.author.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tweet.author.avatarUrl}
              alt={tweet.author.name}
              className="w-10 h-10 rounded-full object-cover bg-neutral-200 dark:bg-neutral-800"
              onError={(e) => {
                // If remote image fails to load, fallback to text avatar
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-semibold flex items-center justify-center text-xs select-none">
              {initials}
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 min-w-0">
          {/* Header Row: Name, Handle, Timestamp */}
          <div className="flex items-center gap-1.5 text-sm leading-5 mb-1 flex-wrap">
            <span className="font-bold text-[#0F1419] dark:text-[#F7F9F9] truncate hover:underline cursor-pointer">
              {tweet.author.name}
            </span>

            {tweet.author.verified && (
              <span className="text-[#1D9BF0] inline-flex items-center" title="Verified">
                <svg viewBox="0 0 24 24" aria-label="Verified" className="w-4 h-4 fill-current">
                  <g>
                    <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z" />
                  </g>
                </svg>
              </span>
            )}

            <span className="text-[#536471] dark:text-[#71767B] truncate text-xs">
              @{tweet.author.handle}
            </span>

            <span className="text-[#536471] dark:text-[#71767B] text-xs">·</span>

            <time
              dateTime={tweet.createdAt}
              title={timeTitle}
              className="text-[#536471] dark:text-[#71767B] text-xs hover:underline cursor-pointer whitespace-nowrap"
            >
              {formattedDate}
            </time>
          </div>

          {/* Post Text with Tokenized Highlighting */}
          <div className="text-[15px] leading-relaxed text-[#0F1419] dark:text-[#E7E9EA] whitespace-pre-wrap break-words">
            {tokens.map((token, index) => {
              if (token.type === "url") {
                return (
                  <a
                    key={index}
                    href={token.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#1D9BF0] hover:underline break-all inline-flex items-center gap-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span>{token.value}</span>
                  </a>
                );
              }
              if (token.type === "mention") {
                return (
                  <a
                    key={index}
                    href={`https://x.com/${token.handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#1D9BF0] hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {token.value}
                  </a>
                );
              }
              if (token.type === "hashtag") {
                return (
                  <a
                    key={index}
                    href={`https://x.com/search?q=%23${token.tag}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#1D9BF0] hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {token.value}
                  </a>
                );
              }
              return <span key={index}>{token.value}</span>;
            })}
          </div>

          {/* Extracted Outbound Link Pill Shelf (Flat, clean, compact) */}
          {tweet.urls && tweet.urls.length > 0 && (
            <div className="mt-2.5 pt-2 border-t border-[#F3F4F6] dark:border-[#1F2937]/70 flex flex-wrap gap-1.5 items-center">
              <span className="text-[11px] font-medium text-[#536471] dark:text-[#71767B] uppercase tracking-wider mr-1">
                Outbound:
              </span>
              {tweet.urls.map((url, i) => {
                const domain = extractDomain(url) || "link";
                const isCopied = copiedUrl === url;

                return (
                  <div
                    key={i}
                    className="group inline-flex items-center gap-1.5 bg-neutral-100 dark:bg-[#16181C] text-neutral-800 dark:text-neutral-200 text-xs px-2.5 py-1 rounded-full hover:bg-neutral-200 dark:hover:bg-[#202327] transition-colors border border-transparent"
                  >
                    <button
                      onClick={() => onFilterDomain && onFilterDomain(domain)}
                      title={`Filter posts by ${domain}`}
                      className="font-mono text-[11px] font-medium text-[#0F1419] dark:text-[#F7F9F9] hover:text-[#1D9BF0]"
                    >
                      {domain}
                    </button>

                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={url}
                      className="text-[#536471] dark:text-[#71767B] hover:text-[#0F1419] dark:hover:text-[#F7F9F9] inline-flex items-center"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>

                    <button
                      onClick={(e) => handleCopy(url, e)}
                      title="Copy URL"
                      className="text-[#536471] dark:text-[#71767B] hover:text-[#0F1419] dark:hover:text-[#F7F9F9]"
                    >
                      {isCopied ? (
                        <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Action Metrics Row (Authentic X style, neutral, uncluttered) */}
          <div className="flex items-center justify-between max-w-md mt-3 text-xs text-[#536471] dark:text-[#71767B] select-none">
            {/* Reply */}
            <div className="flex items-center gap-1.5 group cursor-pointer hover:text-[#1D9BF0] transition-colors">
              <div className="p-1.5 rounded-full group-hover:bg-[#1D9BF0]/10 transition-colors">
                <MessageCircle className="w-4 h-4" />
              </div>
              <span>{tweet.metrics?.replies ?? 0}</span>
            </div>

            {/* Retweet */}
            <div className="flex items-center gap-1.5 group cursor-pointer hover:text-emerald-500 transition-colors">
              <div className="p-1.5 rounded-full group-hover:bg-emerald-500/10 transition-colors">
                <Repeat2 className="w-4 h-4" />
              </div>
              <span>{tweet.metrics?.retweets ?? 0}</span>
            </div>

            {/* Like */}
            <div className="flex items-center gap-1.5 group cursor-pointer hover:text-rose-500 transition-colors">
              <div className="p-1.5 rounded-full group-hover:bg-rose-500/10 transition-colors">
                <Heart className="w-4 h-4" />
              </div>
              <span>{tweet.metrics?.likes ?? 0}</span>
            </div>

            {/* Share */}
            <div className="flex items-center gap-1.5 group cursor-pointer hover:text-[#1D9BF0] transition-colors">
              <div className="p-1.5 rounded-full group-hover:bg-[#1D9BF0]/10 transition-colors">
                <Share className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
};
