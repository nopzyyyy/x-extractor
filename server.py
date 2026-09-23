import os
import re
import sys
import json
import asyncio
from datetime import datetime
from urllib.parse import urlparse
from flask import Flask, request, jsonify, render_template, Response
from playwright.async_api import async_playwright

app = Flask(__name__)

# Permanent Auth Token provided by user
DEFAULT_AUTH_TOKEN = "2f35b33c411690dae748d149822b216bfe58bafd"
AUTH_TOKEN = os.environ.get("X_AUTH_TOKEN", DEFAULT_AUTH_TOKEN)

# Month map for parsing "Joined [Month] [Year]"
MONTH_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12
}

def find_browser_executable():
    """Detect installed Chrome/Chromium across Windows and Linux."""
    env_path = os.environ.get("CHROME_PATH")
    if env_path and os.path.exists(env_path):
        return env_path

    candidates = [
        # Linux
        "/snap/bin/chromium",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        # Windows
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return None

def extract_root_domain(url):
    """Clean and extract root domain (e.g. 'twitpic.com', 'bit.ly'). Filter out internal X domains."""
    if not url:
        return ""
    try:
        # Pre-clean
        clean_url = url.strip().rstrip(".,;:!?)'\"")
        p = urlparse(clean_url)
        netloc = p.netloc.lower()
        if not netloc:
            # Maybe schema is missing
            if clean_url.startswith("http://") or clean_url.startswith("https://"):
                pass
            else:
                p = urlparse("https://" + clean_url)
                netloc = p.netloc.lower()
                
        if not netloc:
            return ""

        # Remove port
        netloc = netloc.split(":")[0]

        # Strip www prefix
        if netloc.startswith("www."):
            netloc = netloc[4:]

        # Filter out Twitter / X internal domains
        internal_domains = {
            "x.com", "twitter.com", "t.co", "pic.twitter.com", 
            "pic.x.com", "api.twitter.com", "pbs.twimg.com",
            "abs.twimg.com", "mobile.twitter.com"
        }
        if netloc in internal_domains or netloc.endswith(".twitter.com") or netloc.endswith(".x.com") or netloc.endswith(".twimg.com"):
            return ""

        # Validate domain format (has at least one dot and valid tld)
        parts = netloc.split(".")
        if len(parts) >= 2 and len(parts[-1]) >= 2:
            # Handle common multi-part ccTLDs like .co.uk, .com.br, etc.
            two_part_tlds = {"co.uk", "org.uk", "gov.uk", "com.br", "co.jp", "com.au", "net.au"}
            last_two = ".".join(parts[-2:])
            if last_two in two_part_tlds and len(parts) >= 3:
                return ".".join(parts[-3:])
            return last_two
        return netloc
    except Exception:
        return ""

async def scrape_x_from_beginning(handle, max_scrolls=4, cutoff_override=None):
    """
    Scrape user posts starting from their account creation date (oldest first).
    Extracts all outbound URLs and filters unique root domains.
    """
    handle = handle.lstrip("@").strip()
    if "/" in handle:
        handle = handle.rstrip("/").split("/")[-1].lstrip("@")

    chrome_exec = find_browser_executable()
    if not chrome_exec:
        raise RuntimeError("No supported Chrome or Chromium executable found on the system.")

    result = {
        "handle": handle,
        "profile": {
            "name": handle,
            "handle": handle,
            "avatar": "",
            "bio": ""
        },
        "joined": "",
        "cutoff_date": "",
        "total_posts": 0,
        "unique_domains_count": 0,
        "domains": [],
        "posts": []
    }

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=chrome_exec,
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--no-first-run",
                "--no-zygote",
                "--disable-gpu",
            ]
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 900}
        )
        # Apply permanent auth_token
        await context.add_cookies([{
            "name": "auth_token",
            "value": AUTH_TOKEN,
            "domain": ".x.com",
            "path": "/",
            "secure": True,
            "httpOnly": True
        }])

        page = await context.new_page()

        # Step 1: Discover Account Creation Era
        profile_url = f"https://x.com/{handle}"
        joined_year = 2006
        joined_month = 1

        try:
            await page.goto(profile_url, wait_until="domcontentloaded", timeout=25000)
            await page.wait_for_selector('[data-testid="primaryColumn"]', timeout=10000)
            
            profile_data = await page.evaluate('''() => {
                const nameEl = document.querySelector('[data-testid="UserName"]');
                const headerItems = document.querySelector('[data-testid="UserProfileHeader_Items"]');
                const avatarEl = document.querySelector('img[src*="profile_images"]');
                const bioEl = document.querySelector('[data-testid="UserDescription"]');
                return {
                    name: nameEl ? nameEl.innerText.split('\\n')[0] : '',
                    headerText: headerItems ? headerItems.innerText : '',
                    avatar: avatarEl ? avatarEl.getAttribute('src') : '',
                    bio: bioEl ? bioEl.innerText : ''
                };
            }''')

            result["profile"]["name"] = profile_data.get("name") or handle
            result["profile"]["avatar"] = profile_data.get("avatar") or ""
            result["profile"]["bio"] = profile_data.get("bio") or ""

            header_text = profile_data.get("headerText", "")
            match = re.search(r"Joined\s+([A-Za-z]+)\s+(\d{4})", header_text, re.IGNORECASE)
            if match:
                m_name = match.group(1).lower()
                joined_year = int(match.group(2))
                joined_month = MONTH_MAP.get(m_name, 1)
                result["joined"] = f"{match.group(1).capitalize()} {joined_year}"
            else:
                result["joined"] = "Founding Era"
        except Exception as e:
            print(f"[Warning] Profile header load error: {e}")
            result["joined"] = "Founding Era"

        # Determine target search date range
        if cutoff_override:
            cutoff_date = cutoff_override
        else:
            # Span 1 to 2 years after joined date to capture the complete beginning era
            current_year = datetime.now().year
            if joined_year >= current_year:
                cutoff_date = f"{current_year}-12-31"
            else:
                cutoff_year = min(joined_year + 1, current_year)
                cutoff_date = f"{cutoff_year}-12-31"

        result["cutoff_date"] = cutoff_date

        # Step 2: Target Search Query from Beginning
        search_query = f"(from:{handle}) until:{cutoff_date}"
        search_url = f"https://x.com/search?q={search_query}&src=typed_query&f=live"
        print(f"[Scraper] Navigating to: {search_url}")

        await page.goto(search_url, wait_until="domcontentloaded", timeout=25000)
        try:
            await page.wait_for_selector('article', timeout=12000)
        except Exception:
            print("[Warning] No immediate articles found in search cutoff, will attempt scroll.")

        seen_status_urls = set()
        posts_list = []
        domain_counts = {}

        for _ in range(max_scrolls):
            extracted = await page.evaluate('''() => {
                const articles = document.querySelectorAll('article');
                return Array.from(articles).map(a => {
                    const textEl = a.querySelector('[data-testid="tweetText"]');
                    const timeEl = a.querySelector('time');
                    const statusLink = a.querySelector('a[href*="/status/"]');
                    
                    const links = [];
                    if (textEl) {
                        textEl.querySelectorAll('a').forEach(l => {
                            const href = l.getAttribute('href') || '';
                            const text = l.innerText || '';
                            const title = l.getAttribute('title') || '';
                            if (href) links.push({ href, text, title });
                        });
                    }
                    
                    return {
                        text: textEl ? textEl.innerText : '',
                        time: timeEl ? timeEl.getAttribute('datetime') : '',
                        statusHref: statusLink ? statusLink.getAttribute('href') : '',
                        links: links
                    };
                });
            }''')

            for item in extracted:
                status_href = item.get("statusHref", "")
                if not status_href or status_href in seen_status_urls:
                    continue
                seen_status_urls.add(status_href)

                post_url = f"https://x.com{status_href}" if status_href.startswith("/") else status_href
                text = item.get("text", "")
                raw_time = item.get("time", "")

                # Collect outbound links
                dom_links = [l["href"] for l in item.get("links", []) if l.get("href")]
                # Also inspect visible text or title if t.co was shortened
                dom_titles = [l["title"] for l in item.get("links", []) if l.get("title") and ("http://" in l.get("title") or "https://" in l.get("title"))]
                text_urls = re.findall(r"https?://[^\s]+", text)

                all_candidate_urls = list(set(dom_links + dom_titles + text_urls))

                # Extract and aggregate unique domains for this post
                tweet_domains = set()
                tweet_clean_urls = []

                for u in all_candidate_urls:
                    dom = extract_root_domain(u)
                    if dom:
                        tweet_domains.add(dom)
                        domain_counts[dom] = domain_counts.get(dom, 0) + 1
                        tweet_clean_urls.append(u)

                posts_list.append({
                    "id": status_href.split("/")[-1] if "/status/" in status_href else "",
                    "post_url": post_url,
                    "created_at": raw_time,
                    "text": text,
                    "urls": tweet_clean_urls,
                    "domains": sorted(list(tweet_domains))
                })

            # Scroll down for additional posts
            await page.evaluate("window.scrollBy(0, 1800)")
            await asyncio.sleep(1.5)

        await browser.close()

        # Sort posts strictly oldest first (Beginning -> Newer)
        posts_list.sort(key=lambda x: x["created_at"])

        # Format domain summary
        domain_summary = []
        for dom, count in sorted(domain_counts.items(), key=lambda x: x[1], reverse=True):
            domain_summary.append({
                "domain": dom,
                "count": count,
                "namecheap_url": f"https://www.namecheap.com/domains/registration/results/?domain={dom}"
            })

        result["posts"] = posts_list
        result["total_posts"] = len(posts_list)
        result["domains"] = domain_summary
        result["unique_domains_count"] = len(domain_summary)

        return result

@app.route("/")
def index():
    return render_template("index.html", default_handle="cristiano")

@app.route("/api/scrape", methods=["POST"])
def api_scrape():
    data = request.get_json() or {}
    handle = data.get("handle", "").strip()
    if not handle:
        return jsonify({"error": "Handle is required"}), 400

    scrolls = int(data.get("scrolls", 4))
    scrolls = max(1, min(scrolls, 25))

    try:
        scraped_data = asyncio.run(scrape_x_from_beginning(handle, max_scrolls=scrolls))
        return jsonify(scraped_data)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/health")
def api_health():
    browser = find_browser_executable()
    return jsonify({
        "status": "healthy",
        "browser_found": bool(browser),
        "browser_path": browser,
        "auth_token_set": bool(AUTH_TOKEN),
        "timestamp": datetime.utcnow().isoformat() + "Z"
    })

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"X Extractor Dashboard running on http://0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
