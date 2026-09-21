import { Tweet, ScrapeResponse } from "@/types/tweet";
import { extractUrls, extractDomainsFromUrls, aggregateDomains } from "@/lib/parser";

export async function fetchWithOfficialApi(
  username: string,
  startDate?: string,
  endDate?: string,
  cursor?: string
): Promise<ScrapeResponse> {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) {
    throw new Error(
      "X_BEARER_TOKEN is not configured in environment variables. Please supply a Bearer Token or use the Direct Scraper adapter."
    );
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // 1. Fetch user by username
  const userRes = await fetch(
    `https://api.twitter.com/2/users/by/username/${encodeURIComponent(
      username
    )}?user.fields=description,profile_image_url,public_metrics,verified`,
    { headers }
  );

  if (!userRes.ok) {
    if (userRes.status === 404) {
      throw new Error(`Profile @${username} was not found on X.`);
    }
    if (userRes.status === 401 || userRes.status === 403) {
      throw new Error("Invalid or unauthorized X_BEARER_TOKEN. Check your API permissions.");
    }
    const errText = await userRes.text();
    throw new Error(`X API Error (${userRes.status}): ${errText}`);
  }

  const userData = await userRes.json();
  if (userData.errors && userData.errors.length > 0) {
    throw new Error(userData.errors[0].detail || `Error retrieving user @${username}`);
  }

  const user = userData.data;
  if (!user) {
    throw new Error(`Profile @${username} does not exist or has been deleted.`);
  }

  // 2. Fetch user tweets
  const params = new URLSearchParams({
    max_results: "100",
    "tweet.fields": "created_at,public_metrics,entities",
    exclude: "retweets",
  });

  if (startDate) {
    params.set("start_time", new Date(startDate).toISOString());
  }
  if (endDate) {
    params.set("end_time", new Date(endDate).toISOString());
  }
  if (cursor) {
    params.set("pagination_token", cursor);
  }

  const tweetsRes = await fetch(
    `https://api.twitter.com/2/users/${user.id}/tweets?${params.toString()}`,
    { headers }
  );

  if (!tweetsRes.ok) {
    const errText = await tweetsRes.text();
    throw new Error(`Failed to fetch posts from X API: ${errText}`);
  }

  const tweetsData = await tweetsRes.json();
  const rawTweets = tweetsData.data || [];

  const parsedTweets: Tweet[] = rawTweets.map((t: any) => {
    // Extract expanded URLs from entities if available, otherwise regex parse
    const entityUrls: string[] = (t.entities?.urls || [])
      .map((u: any) => u.expanded_url || u.url)
      .filter(Boolean);

    const regexUrls = extractUrls(t.text);
    const combinedUrls = Array.from(new Set([...entityUrls, ...regexUrls]));
    const domains = extractDomainsFromUrls(combinedUrls);

    return {
      id: t.id,
      text: t.text,
      author: {
        name: user.name,
        handle: user.username,
        avatarUrl: user.profile_image_url,
        verified: user.verified,
      },
      createdAt: t.created_at || new Date().toISOString(),
      metrics: {
        replies: t.public_metrics?.reply_count || 0,
        retweets: t.public_metrics?.retweet_count || 0,
        likes: t.public_metrics?.like_count || 0,
        views: t.public_metrics?.impression_count,
      },
      urls: combinedUrls,
      domains,
    };
  });

  const domains = aggregateDomains(parsedTweets);

  return {
    success: true,
    profile: {
      name: user.name,
      handle: user.username,
      avatarUrl: user.profile_image_url,
      bio: user.description,
      followersCount: user.public_metrics?.followers_count,
      followingCount: user.public_metrics?.following_count,
      tweetsCount: user.public_metrics?.tweet_count,
      verified: user.verified,
    },
    tweets: parsedTweets,
    domains,
    nextToken: tweetsData.meta?.next_token,
    adapterUsed: "official",
  };
}
