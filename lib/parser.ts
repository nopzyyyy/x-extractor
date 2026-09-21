import { Tweet, ExtractedDomain } from "@/types/tweet";

/**
 * Regex to extract raw URLs from text
 */
export const URL_REGEX = /(https?:\/\/[^\s]+)/gi;

/**
 * Cleans trailing punctuation that may be captured at the end of a URL in sentences
 */
export function sanitizeUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  // Strip trailing punctuation like ., ), ], !, ? that often follow URLs in tweet text
  while (/[.,)\]!?:;'"]$/.test(url)) {
    // If the URL has an unclosed parenthesis like (https://example.com), don't strip if matched
    if (url.endsWith(")") && (url.match(/\(/g) || []).length >= (url.match(/\)/g) || []).length) {
      break;
    }
    url = url.slice(0, -1);
  }
  return url;
}

/**
 * Extracts all valid URLs from tweet text
 */
export function extractUrls(text: string): string[] {
  if (!text) return [];
  const matches = text.match(URL_REGEX);
  if (!matches) return [];

  const cleaned = matches.map(sanitizeUrl).filter((u) => {
    try {
      new URL(u);
      return true;
    } catch {
      return false;
    }
  });

  return Array.from(new Set(cleaned));
}

/**
 * Extracts the clean root hostname from a URL (e.g. "sub.example.com/path" -> "example.com" or clean hostname)
 */
export function extractDomain(urlStr: string): string | null {
  try {
    const parsed = new URL(urlStr);
    let host = parsed.hostname.toLowerCase();
    // remove leading www.
    if (host.startsWith("www.")) {
      host = host.substring(4);
    }
    // Remove port if present
    if (host.includes(":")) {
      host = host.split(":")[0];
    }
    return host || null;
  } catch {
    return null;
  }
}

/**
 * Extracts unique domains from an array of URLs
 */
export function extractDomainsFromUrls(urls: string[]): string[] {
  const domains = new Set<string>();
  for (const u of urls) {
    const d = extractDomain(u);
    if (d) domains.add(d);
  }
  return Array.from(domains);
}

/**
 * Aggregates all unique domains across a list of tweets, sorted by occurrence count descending
 */
export function aggregateDomains(tweets: Tweet[]): ExtractedDomain[] {
  const map = new Map<string, { count: number; sampleUrls: Set<string> }>();

  for (const tweet of tweets) {
    for (const url of tweet.urls) {
      const domain = extractDomain(url);
      if (!domain) continue;

      const existing = map.get(domain);
      if (existing) {
        existing.count += 1;
        if (existing.sampleUrls.size < 5) {
          existing.sampleUrls.add(url);
        }
      } else {
        map.set(domain, {
          count: 1,
          sampleUrls: new Set([url]),
        });
      }
    }
  }

  const result: ExtractedDomain[] = [];
  for (const [domain, data] of map.entries()) {
    result.push({
      domain,
      count: data.count,
      sampleUrls: Array.from(data.sampleUrls),
      registrarUrl: `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(domain)}`,
      whoisUrl: `https://who.is/whois/${encodeURIComponent(domain)}`,
    });
  }

  // Sort descending by count, then alphabetically
  return result.sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
}

/**
 * Sanitizes and extracts the username from various input formats:
 * - https://x.com/jack
 * - https://twitter.com/jack/status/123
 * - @jack
 * - jack
 */
export function extractHandle(input: string): string {
  if (!input) return "";
  let val = input.trim();

  // If full URL
  if (val.startsWith("http://") || val.startsWith("https://")) {
    try {
      const url = new URL(val);
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length > 0) {
        val = parts[0];
      }
    } catch {
      // Fallback
    }
  }

  // Strip leading @
  val = val.replace(/^@+/, "");

  // Strip trailing query params or slashes
  val = val.split(/[/?#]/)[0];

  return val.trim();
}

export type TextToken =
  | { type: "text"; value: string }
  | { type: "mention"; value: string; handle: string }
  | { type: "hashtag"; value: string; tag: string }
  | { type: "url"; value: string; href: string; displayDomain: string };

/**
 * Tokenizes tweet text into text, mentions, hashtags, and URLs for safe rich rendering
 */
export function tokenizeTweetText(text: string): TextToken[] {
  if (!text) return [];

  // Match URLs, mentions (@username), and hashtags (#topic)
  // Regex token pattern
  const tokenRegex = /(https?:\/\/[^\s]+)|(@[a-zA-Z0-9_]{1,30})|(#[\w\u0080-\uffff]+)/gi;

  const tokens: TextToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    const matchIndex = match.index;
    const matchStr = match[0];

    // Push plain text prior to match
    if (matchIndex > lastIndex) {
      tokens.push({
        type: "text",
        value: text.slice(lastIndex, matchIndex),
      });
    }

    if (matchStr.startsWith("http://") || matchStr.startsWith("https://")) {
      const cleaned = sanitizeUrl(matchStr);
      const domain = extractDomain(cleaned) || cleaned;
      tokens.push({
        type: "url",
        value: cleaned,
        href: cleaned,
        displayDomain: domain,
      });

      // Adjust last index if trailing characters were trimmed
      lastIndex = matchIndex + cleaned.length;
      tokenRegex.lastIndex = lastIndex;
      continue;
    } else if (matchStr.startsWith("@")) {
      const handle = matchStr.slice(1);
      tokens.push({
        type: "mention",
        value: matchStr,
        handle,
      });
    } else if (matchStr.startsWith("#")) {
      const tag = matchStr.slice(1);
      tokens.push({
        type: "hashtag",
        value: matchStr,
        tag,
      });
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({
      type: "text",
      value: text.slice(lastIndex),
    });
  }

  return tokens;
}
