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
        clean_url = url.strip().rstrip(".,;:!?)'\"")
        if not clean_url.startswith("http://") and not clean_url.startswith("https://"):
            clean_url = "https://" + clean_url

        p = urlparse(clean_url)
        netloc = p.netloc.lower()
        if not netloc:
            return ""

        netloc = netloc.split(":")[0]

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

        parts = netloc.split(".")
        if len(parts) >= 2 and len(parts[-1]) >= 2:
            two_part_tlds = {"co.uk", "org.uk", "gov.uk", "com.br", "co.jp", "com.au", "net.au"}
            last_two = ".".join(parts[-2:])
            if last_two in two_part_tlds and len(parts) >= 3:
                return ".".join(parts[-3:])
            return last_two
        return netloc
    except Exception:
        return ""

def extract_domains_and_urls(text, anchor_items):
    """Robustly extract external URLs and root domains from tweet text and DOM anchors."""
    raw_text = text or ""
    cleaned = re.sub(r'(https?://)\s+', r'\1', raw_text)

    candidates = []
    # 1. Regex URLs from text
    for u in re.findall(r'https?://[^\s]+', cleaned):
        candidates.append(u)

    # 2. Anchors from DOM
    for a in anchor_items:
        href = a.get("href") or ""
        t = re.sub(r'(https?://)\s+', r'\1', (a.get("text") or "").strip())
        title = (a.get("title") or "").strip()
        if href and not href.startswith("/") and "twitter.com" not in href and "x.com" not in href:
            if "t.co" not in href:
                candidates.append(href)
        if t and "." in t and " " not in t and "/" not in t:
            candidates.append(t)
        if title and ("http://" in title or "https://" in title):
            candidates.append(title)

    # 3. Match raw domain patterns in text
    for m in re.findall(r'\b[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:/[^\s]*)?', cleaned):
        candidates.append(m)

    domains = set()
    urls = []
    for item in candidates:
        dom = extract_root_domain(item)
        if dom:
            domains.add(dom)
            full_url = item if (item.startswith("http://") or item.startswith("https://")) else f"https://{item}"
            urls.append(full_url)

    return sorted(list(domains)), sorted(list(set(urls)))

async def scrape_account_posts(handle, max_scrolls=8, mode="timeline"):
    """
    Deploy headless browser, navigate directly to @handle on x.com, 
    and scroll down through the account to scrape all posts and domains.
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
        "mode": mode,
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
        await context.add_cookies([{
            "name": "auth_token",
            "value": AUTH_TOKEN,
            "domain": ".x.com",
            "path": "/",
            "secure": True,
            "httpOnly": True
        }])

        page = await context.new_page()

        # Step 1: Navigate directly to the profile page
        target_url = f"https://x.com/{handle}"
        print(f"[Scraper] Launching headless browser to: {target_url} (mode: {mode})")

        await page.goto(target_url, wait_until="domcontentloaded", timeout=30000)
        try:
            await page.wait_for_selector('article', timeout=15000)
        except Exception:
            print("[Notice] Waiting for timeline articles to populate...")

        # Extract profile header info
        profile_data = await page.evaluate('''() => {
            const nameEl = document.querySelector('[data-testid="UserName"]');
            const headerItems = document.querySelector('[data-testid="UserProfileHeader_Items"]');
            const avatarEl = document.querySelector('img[src*="profile_images"]');
            const bioEl = document.querySelector('[data-testid="UserDescription"]');
            const bodyText = document.body ? document.body.innerText : '';
            return {
                name: nameEl ? nameEl.innerText.split('\n')[0] : '',
                headerText: headerItems ? headerItems.innerText : '',
                avatar: avatarEl ? avatarEl.getAttribute('src') : '',
                bio: bioEl ? bioEl.innerText : '',
                bodyText: bodyText
            };
        }''')

        result["profile"]["name"] = profile_data.get("name") or handle
        result["profile"]["avatar"] = profile_data.get("avatar") or ""
        result["profile"]["bio"] = profile_data.get("bio") or ""

        combined_text = (profile_data.get("headerText") or "") + "\n" + (profile_data.get("bodyText") or "")
        match = re.search(r"Joined\s+([A-Za-z]+)\s+(\d{4})", combined_text, re.IGNORECASE)
        joined_year = None
        if match:
            m_name = match.group(1).lower()
            joined_year = int(match.group(2))
            result["joined"] = f"{match.group(1).capitalize()} {joined_year}"
        else:
            result["joined"] = "Active"

        # If user explicitly selected "beginning", switch to historical search query
        if mode == "beginning" and joined_year:
            current_year = datetime.now().year
            cutoff_year = min(joined_year + 1, current_year)
            search_url = f"https://x.com/search?q=(from:{handle}) until:{cutoff_year}-12-31&src=typed_query&f=live"
            print(f"[Scraper] Switching to founding search: {search_url}")
            await page.goto(search_url, wait_until="domcontentloaded", timeout=25000)
            try:
                await page.wait_for_selector('article', timeout=10000)
            except Exception:
                pass

        # Step 2: Continuous timeline scrolling & post extraction
        seen_status_urls = set()
        posts_list = []
        domain_counts = {}
        no_new_count = 0

        for scroll_idx in range(max_scrolls):
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

            new_in_batch = 0
            for item in extracted:
                status_href = item.get("statusHref", "")
                if not status_href or status_href in seen_status_urls:
                    continue
                seen_status_urls.add(status_href)
                new_in_batch += 1

                post_url = f"https://x.com{status_href}" if status_href.startswith("/") else status_href
                text = item.get("text", "")
                raw_time = item.get("time", "")

                tweet_domains, tweet_urls = extract_domains_and_urls(text, item.get("links", []))

                for dom in tweet_domains:
                    domain_counts[dom] = domain_counts.get(dom, 0) + 1

                posts_list.append({
                    "id": status_href.split("/")[-1] if "/status/" in status_href else "",
                    "post_url": post_url,
                    "created_at": raw_time,
                    "text": text,
                    "urls": tweet_urls,
                    "domains": tweet_domains
                })

            print(f"[Scroll {scroll_idx + 1}/{max_scrolls}] Accumulated {len(posts_list)} posts (+{new_in_batch} new)")

            if new_in_batch == 0:
                no_new_count += 1
                if no_new_count >= 3:
                    print("[Scraper] No new posts detected in 3 consecutive scrolls, reached end of timeline.")
                    break
            else:
                no_new_count = 0

            # Scroll down for more posts
            await page.evaluate("window.scrollBy(0, 2400)")
            await asyncio.sleep(1.8)

        await browser.close()

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
    return render_template("index.html", default_handle="elonmusk")

@app.route("/api/scrape", methods=["POST"])
def api_scrape():
    data = request.get_json() or {}
    handle = data.get("handle", "").strip()
    if not handle:
        return jsonify({"error": "Handle is required"}), 400

    scrolls = int(data.get("scrolls", 8))
    scrolls = max(2, min(scrolls, 50))
    mode = data.get("mode", "timeline")

    try:
        scraped_data = asyncio.run(scrape_account_posts(handle, max_scrolls=scrolls, mode=mode))
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