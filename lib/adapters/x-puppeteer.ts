import puppeteer from "puppeteer-core";
import { Tweet, ScrapeResponse } from "@/types/tweet";
import { extractUrls, extractDomainsFromUrls, aggregateDomains } from "@/lib/parser";
import { fetchWithDirectScraper } from "./x-scraper";

const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

export interface ScrapeOptions {
  scrollCount?: number;
  authToken?: string;
  csrfToken?: string;
  fromBeginning?: boolean;
  startDate?: string;
  endDate?: string;
}

export async function scrapeRealXProfile(
  username: string,
  options: number | ScrapeOptions = 3,
  legacyAuthToken?: string,
  legacyCsrfToken?: string
): Promise<ScrapeResponse> {
  const opts: ScrapeOptions =
    typeof options === "number"
      ? { scrollCount: options, authToken: legacyAuthToken, csrfToken: legacyCsrfToken }
      : options;

  const {
    scrollCount = 3,
    authToken,
    csrfToken,
    fromBeginning = false,
    startDate,
    endDate,
  } = opts;

  const targetUrl = `https://x.com/${encodeURIComponent(username)}`;

  // Find valid browser executable
  let executablePath = "";
  const fs = await import("fs");
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) {
      executablePath = p;
      break;
    }
  }

  if (!executablePath) {
    throw new Error(
      "No supported browser executable (Google Chrome or Microsoft Edge) found on the system."
    );
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
      "--window-size=1280,900",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );

    // If session cookies are provided, set them
    if (authToken) {
      await page.setCookie({
        name: "auth_token",
        value: authToken,
        domain: ".x.com",
        path: "/",
        httpOnly: true,
        secure: true,
      });
    }
    if (csrfToken) {
      await page.setCookie({
        name: "ct0",
        value: csrfToken,
        domain: ".x.com",
        path: "/",
        secure: true,
      });
    }

    // Navigate to profile to inspect joined date and timeline
    await page.goto(targetUrl, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    await new Promise((r) => setTimeout(r, 2000));

    // Detect joined date from header
    const profileMeta = await page.evaluate((uname) => {
      const nameEl = document.querySelector("h1, h2") as HTMLElement | null;
      const displayName = nameEl ? nameEl.innerText.split("\n")[0] : uname;

      const avatarEl = document.querySelector(
        'img[src*="profile_images"]'
      ) as HTMLImageElement | null;
      const avatarUrl = avatarEl ? avatarEl.src : undefined;

      const bioEl = document.querySelector('div[data-testid="UserDescription"]');
      const bio = bioEl ? (bioEl as HTMLElement).innerText : "";

      const headerItems = document.querySelector(
        '[data-testid="UserProfileHeader_Items"]'
      ) as HTMLElement | null;
      const headerText = headerItems ? headerItems.innerText : "";
      const joinedMatch = headerText.match(/Joined\s+([A-Za-z]+\s+\d{4})/i);
      const joinedDate = joinedMatch ? joinedMatch[1] : undefined;

      return {
        displayName,
        avatarUrl,
        bio,
        joinedDate,
        verified: !!document.querySelector('[data-testid="icon-verified"]'),
      };
    }, username);

    // If user requested "From Beginning" and has an authToken, we can query X search for the founding era
    let searchUrl: string | null = null;
    let joinedYear: number | null = null;
    if (profileMeta.joinedDate) {
      const yMatch = profileMeta.joinedDate.match(/\d{4}/);
      if (yMatch) joinedYear = parseInt(yMatch[0], 10);
    }

    if (fromBeginning && authToken && joinedYear) {
      const untilYear = joinedYear + 1;
      searchUrl = `https://x.com/search?q=(from%3A${encodeURIComponent(
        username
      )})%20until%3A${untilYear}-01-01&src=typed_query&f=live`;
      try {
        await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 25000 });
        await new Promise((r) => setTimeout(r, 2000));
      } catch {
        // fallback to profile timeline
      }
    }

    // Scroll down to load posts
    for (let s = 0; s < scrollCount; s++) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 1.5);
      });
      await new Promise((r) => setTimeout(r, 1200));
    }

    // Extract articles from DOM with clean parsing
    const rawData = await page.evaluate((uname, defaultName, defaultAvatar) => {
      const articles = document.querySelectorAll("article");
      const scraped: any[] = [];
      const seenIds = new Set<string>();

      articles.forEach((art, idx) => {
        const statusLink = art.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null;
        let tweetId = `live-${idx}`;
        if (statusLink) {
          const match = statusLink.href.match(/\/status\/(\d+)/);
          if (match) tweetId = match[1];
        }

        if (seenIds.has(tweetId)) return;
        seenIds.add(tweetId);

        // Author details
        const authorNameEl = art.querySelector('[data-testid="User-Name"]');
        const authorText = authorNameEl ? (authorNameEl as HTMLElement).innerText : "";
        const lines = authorText.split("\n").map((l) => l.trim()).filter(Boolean);
        const tweetAuthorName = lines[0] || defaultName;
        const handleMatch = authorText.match(/@([a-zA-Z0-9_]+)/);
        const tweetHandle = handleMatch ? handleMatch[1] : uname;

        const tweetAvatarEl = art.querySelector('img[src*="profile_images"]') as HTMLImageElement | null;
        const tweetAvatar = tweetAvatarEl ? tweetAvatarEl.src : defaultAvatar;

        // Extract Timestamp
        const timeEl = art.querySelector("time");
        let createdAt = timeEl ? timeEl.getAttribute("datetime") : null;
        if (!createdAt && timeEl) {
          createdAt = (timeEl as HTMLElement).innerText;
        }
        if (!createdAt) {
          createdAt = new Date().toISOString();
        }

        // Clean Tweet Text: Target specific tweet text container
        const tweetTextEl = art.querySelector('[data-testid="tweetText"]') || art.querySelector("div[lang]");
        let text = "";

        if (tweetTextEl) {
          text = (tweetTextEl as HTMLElement).innerText.trim();
        } else {
          // Clone and strip unwanted header/footer elements
          const clone = art.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('[data-testid="User-Name"], [role="group"], time, img, svg, button').forEach((el) => el.remove());
          text = clone.innerText.trim();
          // Remove leading author names or @handle leftovers
          text = text.replace(/^.*?@\w+\s*[·•]?\s*\w*\s*\d*\s*/i, "").trim();
          // Remove trailing metric blocks like "2.5k7.1k86k"
          text = text.replace(/[\d,.]+[kmb]?[\d,.]+[kmb]?.*$/i, "").trim();
        }

        // Outbound links
        const anchorTags = Array.from(art.querySelectorAll("a")) as HTMLAnchorElement[];
        const extractedHrefs: string[] = [];

        anchorTags.forEach((a) => {
          const href = a.href;
          if (
            !href.includes("x.com/") &&
            !href.includes("twitter.com/") &&
            (href.startsWith("http://") || href.startsWith("https://"))
          ) {
            extractedHrefs.push(href);
          } else if (href.includes("t.co/")) {
            extractedHrefs.push(href);
          }
        });

        // Metrics
        const groupEl = art.querySelector('[role="group"]');
        let replies = 0;
        let retweets = 0;
        let likes = 0;

        if (groupEl) {
          const ariaText = groupEl.getAttribute("aria-label") || "";
          const repMatch = ariaText.match(/(\d+[\d,.]*[kmb]?)\s+repl/i);
          const retMatch = ariaText.match(/(\d+[\d,.]*[kmb]?)\s+repost/i);
          const likeMatch = ariaText.match(/(\d+[\d,.]*[kmb]?)\s+like/i);

          if (repMatch) replies = parseInt(repMatch[1].replace(/,/g, "")) || 0;
          if (retMatch) retweets = parseInt(retMatch[1].replace(/,/g, "")) || 0;
          if (likeMatch) likes = parseInt(likeMatch[1].replace(/,/g, "")) || 0;
        }

        scraped.push({
          id: tweetId,
          text,
          authorName: tweetAuthorName,
          authorHandle: tweetHandle,
          authorAvatar: tweetAvatar,
          createdAt,
          metrics: { replies, retweets, likes },
          links: extractedHrefs,
        });
      });

      return scraped;
    }, username, profileMeta.displayName, profileMeta.avatarUrl);

    // If user asked "From Beginning" without auth cookie, live timeline only shows newest posts.
    // In this case, if the live posts are all modern (e.g. 2024/2026), fetch the founding era archive!
    if (fromBeginning && rawData.length > 0) {
      const isOnlyModern = rawData.every((t) => {
        const year = new Date(t.createdAt).getFullYear();
        return isNaN(year) || year >= 2023;
      });

      if (isOnlyModern) {
        // Fallback to beginning archive for this account's founding era
        const archive = await fetchWithDirectScraper(
          username,
          joinedYear ? `${joinedYear}-01-01` : "2010-01-01",
          joinedYear ? `${joinedYear + 2}-12-31` : "2013-12-31"
        );
        if (archive.tweets.length > 0) {
          return {
            ...archive,
            profile: {
              ...archive.profile,
              ...profileMeta,
              name: profileMeta.displayName,
              handle: username,
              avatarUrl: profileMeta.avatarUrl || archive.profile?.avatarUrl,
              joinedDate: profileMeta.joinedDate,
            },
            error: `Showing founding posts from account creation (${profileMeta.joinedDate || "the beginning"}). To scrape live search on x.com, paste your auth_token in Options or use the 1-Click Live Bridge!`,
          };
        }
      }
    }

    // Process and enrich scraped tweets
    const parsedTweets: Tweet[] = rawData.map((t: any) => {
      const regexUrls = extractUrls(t.text);
      const combinedUrls = Array.from(new Set([...t.links, ...regexUrls]));
      const domains = extractDomainsFromUrls(combinedUrls);

      return {
        id: t.id,
        text: t.text,
        author: {
          name: t.authorName,
          handle: t.authorHandle,
          avatarUrl: t.authorAvatar,
          verified: profileMeta.verified,
        },
        createdAt: t.createdAt,
        metrics: t.metrics,
        urls: combinedUrls,
        domains,
      };
    });

    const domains = aggregateDomains(parsedTweets);

    return {
      success: true,
      profile: {
        name: profileMeta.displayName,
        handle: username,
        avatarUrl: profileMeta.avatarUrl,
        bio: profileMeta.bio,
        joinedDate: profileMeta.joinedDate,
        verified: profileMeta.verified,
        tweetsCount: parsedTweets.length,
      },
      tweets: parsedTweets,
      domains,
      adapterUsed: "direct",
    };
  } finally {
    await browser.close();
  }
}
