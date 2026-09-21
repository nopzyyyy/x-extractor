import { NextRequest, NextResponse } from "next/server";
import { Tweet, ScrapeResponse } from "@/types/tweet";
import { extractUrls, extractDomainsFromUrls, aggregateDomains } from "@/lib/parser";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { profile, tweets: incomingTweets, rawHtml } = body;

    let processedTweets: Tweet[] = [];

    if (Array.isArray(incomingTweets)) {
      processedTweets = incomingTweets.map((t: any, idx: number) => {
        const text = t.text || "";
        const regexUrls = extractUrls(text);
        const combinedUrls = Array.from(new Set([...(t.urls || t.links || []), ...regexUrls]));
        const domains = extractDomainsFromUrls(combinedUrls);

        return {
          id: t.id || `ingested-${Date.now()}-${idx}`,
          text,
          author: {
            name: t.author?.name || t.authorName || profile?.name || "X User",
            handle: t.author?.handle || t.authorHandle || profile?.handle || "user",
            avatarUrl: t.author?.avatarUrl || t.authorAvatar || profile?.avatarUrl,
            verified: t.author?.verified ?? profile?.verified,
          },
          createdAt: t.createdAt || new Date().toISOString(),
          metrics: t.metrics || { replies: 0, retweets: 0, likes: 0 },
          urls: combinedUrls,
          domains,
        };
      });
    } else if (rawHtml && typeof rawHtml === "string") {
      // Parse raw HTML pasted from x.com
      // Extract links from href
      const hrefMatches = Array.from(rawHtml.matchAll(/href=["']([^"']+)["']/g)).map(m => m[1]);
      const externalUrls = hrefMatches.filter(u => 
        (u.startsWith("http://") || u.startsWith("https://")) &&
        !u.includes("x.com/") &&
        !u.includes("twitter.com/")
      );

      const regexUrls = extractUrls(rawHtml);
      const combinedUrls = Array.from(new Set([...externalUrls, ...regexUrls]));
      const domains = extractDomainsFromUrls(combinedUrls);

      processedTweets = [
        {
          id: `html-import-${Date.now()}`,
          text: rawHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500),
          author: {
            name: profile?.name || "HTML Import",
            handle: profile?.handle || "import",
            avatarUrl: profile?.avatarUrl,
            verified: false,
          },
          createdAt: new Date().toISOString(),
          metrics: { replies: 0, retweets: 0, likes: 0 },
          urls: combinedUrls,
          domains,
        },
      ];
    }

    const domains = aggregateDomains(processedTweets);

    const response: ScrapeResponse = {
      success: true,
      profile: profile || {
        name: processedTweets[0]?.author.name || "Live Ingest",
        handle: processedTweets[0]?.author.handle || "live",
        tweetsCount: processedTweets.length,
      },
      tweets: processedTweets,
      domains,
      adapterUsed: "direct",
    };

    return NextResponse.json(response, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  } catch (error: any) {
    console.error("Ingest error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to ingest data." },
      { status: 400 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
