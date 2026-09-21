import { NextRequest, NextResponse } from "next/server";
import { extractHandle } from "@/lib/parser";
import { scrapeRealXProfile } from "@/lib/adapters/x-puppeteer";
import { fetchWithDirectScraper } from "@/lib/adapters/x-scraper";
import { fetchWithOfficialApi } from "@/lib/adapters/x-official";
import { ScrapeRequest, ScrapeResponse } from "@/types/tweet";

interface ExtendedScrapeRequest extends ScrapeRequest {
  mode?: "puppeteer" | "direct" | "official" | "cookie";
  scrollCount?: number;
  authToken?: string;
  csrfToken?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ExtendedScrapeRequest = await request.json();
    const {
      target,
      mode = "puppeteer",
      scrollCount = 3,
      authToken,
      csrfToken,
      fromBeginning = false,
      startDate,
      endDate,
      cursor,
    } = body;

    if (!target || typeof target !== "string" || target.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Please provide a valid X handle or profile URL (e.g. @jack or https://x.com/jack).",
          tweets: [],
          domains: [],
          adapterUsed: "direct",
        } as ScrapeResponse,
        { status: 400 }
      );
    }

    const username = extractHandle(target);
    if (!username) {
      return NextResponse.json(
        {
          success: false,
          error: "Could not extract a valid username from the input provided.",
          tweets: [],
          domains: [],
          adapterUsed: "direct",
        } as ScrapeResponse,
        { status: 400 }
      );
    }

    let response: ScrapeResponse;

    // 1. Live Puppeteer Real Browser Engine (Scrapes real x.com)
    if (mode === "puppeteer") {
      try {
        response = await scrapeRealXProfile(username, {
          scrollCount,
          authToken,
          csrfToken,
          fromBeginning,
          startDate,
          endDate,
        });
      } catch (puppeteerErr: any) {
        console.warn("Puppeteer real scraper encountered an issue:", puppeteerErr.message);
        // If Puppeteer fails for any reason, gracefully fallback to direct archive scraper
        response = await fetchWithDirectScraper(username, startDate, endDate, cursor);
        response.error = `Live browser scrape note: ${puppeteerErr.message}. Displaying cached archive data.`;
      }
    }
    // 2. Official X API v2
    else if (mode === "official") {
      try {
        response = await fetchWithOfficialApi(username, startDate, endDate, cursor);
      } catch (officialErr: any) {
        return NextResponse.json(
          {
            success: false,
            error: officialErr.message || "Failed to fetch tweets using Official X API v2.",
            tweets: [],
            domains: [],
            adapterUsed: "official",
          } as ScrapeResponse,
          { status: 400 }
        );
      }
    }
    // 3. Historical Archive Fallback mode
    else {
      response = await fetchWithDirectScraper(username, startDate, endDate, cursor);
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("API /api/scrape-x error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "An unexpected error occurred while processing the scrape request.",
        tweets: [],
        domains: [],
        adapterUsed: "direct",
      } as ScrapeResponse,
      { status: 500 }
    );
  }
}
