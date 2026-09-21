export interface TweetAuthor {
  name: string;
  handle: string;
  avatarUrl?: string;
  verified?: boolean;
}

export interface TweetMetrics {
  replies?: number;
  retweets?: number;
  likes?: number;
  views?: string | number;
}

export interface Tweet {
  id: string;
  text: string;
  author: TweetAuthor;
  createdAt: string; // ISO string e.g. 2012-05-14T10:20:00Z
  metrics: TweetMetrics;
  urls: string[];
  domains: string[];
  replyTo?: string;
  isRetweet?: boolean;
}

export interface ExtractedDomain {
  domain: string;
  count: number;
  sampleUrls: string[];
  registrarUrl: string;
  whoisUrl: string;
}

export interface ScrapeRequest {
  target: string; // @handle or https://x.com/username
  startDate?: string;
  endDate?: string;
  adapter?: "direct" | "official";
  cursor?: string;
  fromBeginning?: boolean;
}

export interface ScrapeResponse {
  success: boolean;
  profile?: {
    name: string;
    handle: string;
    avatarUrl?: string;
    bio?: string;
    joinedDate?: string;
    followersCount?: number;
    followingCount?: number;
    tweetsCount?: number;
    verified?: boolean;
  };
  tweets: Tweet[];
  domains: ExtractedDomain[];
  nextToken?: string;
  adapterUsed: "direct" | "official";
  error?: string;
}
