import os
import re
import sys
import json
import sqlite3
import threading
import asyncio
from datetime import datetime
from urllib.parse import urlparse
from flask import Flask, request, jsonify, render_template, Response
from playwright.async_api import async_playwright

app = Flask(__name__)

# Permanent Auth Token provided by user
DEFAULT_AUTH_TOKEN = "2f35b33c411690dae748d149822b216bfe58bafd"
AUTH_TOKEN = os.environ.get("X_AUTH_TOKEN", DEFAULT_AUTH_TOKEN)

# Active scan tracker for live progress & force stop
ACTIVE_SCANS = {}

# SQLite Central Database Setup
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scans.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH, timeout=20.0)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    with conn:
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS scans (
                id TEXT PRIMARY KEY,
                handle TEXT NOT NULL,
                status TEXT NOT NULL,
                percent INTEGER DEFAULT 0,
                details TEXT DEFAULT '',
                posts_count INTEGER DEFAULT 0,
                domains_count INTEGER DEFAULT 0,
                profile_name TEXT DEFAULT '',
                profile_avatar TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                result_json TEXT DEFAULT NULL,
                error TEXT DEFAULT NULL
            )
        """)
    conn.close()

init_db()

def create_scan_record(scan_id, handle):
    now = datetime.utcnow().isoformat() + "Z"
    conn = get_db_connection()
    with conn:
        conn.execute("""
            INSERT INTO scans (id, handle, status, percent, details, posts_count, domains_count, created_at, updated_at)
            VALUES (?, ?, 'running', 5, 'Initializing headless Chromium with authenticated session...', 0, 0, ?, ?)
        """, (scan_id, handle, now, now))
    conn.close()

def update_scan_progress_db(scan_id, percent, details, posts_count=0, domains_count=0, profile_name=None, profile_avatar=None):
    now = datetime.utcnow().isoformat() + "Z"
    conn = get_db_connection()
    with conn:
        if profile_name is not None and profile_avatar is not None:
            conn.execute("""
                UPDATE scans 
                SET percent = ?, details = ?, posts_count = ?, domains_count = ?, profile_name = ?, profile_avatar = ?, updated_at = ?
                WHERE id = ?
            """, (percent, details, posts_count, domains_count, profile_name, profile_avatar, now, scan_id))
        else:
            conn.execute("""
                UPDATE scans 
                SET percent = ?, details = ?, posts_count = ?, domains_count = ?, updated_at = ?
                WHERE id = ?
            """, (percent, details, posts_count, domains_count, now, scan_id))
    conn.close()

def complete_scan_record(scan_id, result_dict, status="completed"):
    now = datetime.utcnow().isoformat() + "Z"
    profile = result_dict.get("profile", {})
    profile_name = profile.get("name", "")
    profile_avatar = profile.get("avatar", "")
    posts_count = result_dict.get("total_posts", len(result_dict.get("posts", [])))
    domains_count = result_dict.get("unique_domains_count", len(result_dict.get("domains", [])))

    conn = get_db_connection()
    with conn:
        conn.execute("""
            UPDATE scans 
            SET status = ?, percent = 100, details = ?, posts_count = ?, domains_count = ?,
                profile_name = COALESCE(NULLIF(?, ''), profile_name),
                profile_avatar = COALESCE(NULLIF(?, ''), profile_avatar),
                result_json = ?, updated_at = ?
            WHERE id = ?
        """, (status, f"Completed with {posts_count} posts and {domains_count} domains.",
              posts_count, domains_count, profile_name, profile_avatar, json.dumps(result_dict), now, scan_id))
    conn.close()

def fail_scan_record(scan_id, error_msg):
    now = datetime.utcnow().isoformat() + "Z"
    conn = get_db_connection()
    with conn:
        conn.execute("""
            UPDATE scans 
            SET status = 'failed', details = ?, error = ?, updated_at = ?
            WHERE id = ?
        """, (f"Error: {error_msg}", error_msg, now, scan_id))
    conn.close()

def get_scan_record(scan_id):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM scans WHERE id = ?", (scan_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    if d.get("result_json"):
        try:
            d["data"] = json.loads(d["result_json"])
        except Exception:
            d["data"] = None
    else:
        d["data"] = None
    return d

def list_all_scans():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, handle, status, percent, details, posts_count, domains_count, 
               profile_name, profile_avatar, created_at, updated_at, error
        FROM scans 
        ORDER BY created_at DESC
    """)
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def delete_scan_record(scan_id):
    conn = get_db_connection()
    with conn:
        conn.execute("DELETE FROM scans WHERE id = ?", (scan_id,))
    conn.close()

def clear_all_scans():
    conn = get_db_connection()
    with conn:
        conn.execute("DELETE FROM scans")
    conn.close()

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
    """Robustly extract external URLs and root domains from tweet text, cards, and DOM anchors."""
    raw_text = text or ""
    # Normalize spaced protocols e.g. "http:// \n shtg.co" -> "http://shtg.co"
    cleaned = re.sub(r'(https?://)\s+', r'\1', raw_text)

    candidates = []
    # 1. Regex URLs from text
    for u in re.findall(r'https?://[^\s]+', cleaned):
        candidates.append(u)

    # 2. Anchors and cards from DOM
    for a in anchor_items:
        href = (a.get("href") or "").strip()
        t = re.sub(r'(https?://)\s+', r'\1', (a.get("text") or "").strip())
        title = (a.get("title") or "").strip()
        aria = (a.get("aria") or "").strip()

        # Check href (if not relative and not internal twitter/x)
        if href and not href.startswith("/") and "twitter.com" not in href and "x.com" not in href:
            if "t.co" not in href:
                candidates.append(href)

        # Check title & aria-label (Twitter embeds destination URL in title/aria-label for t.co links)
        for attr in (title, aria):
            if attr and ("http://" in attr or "https://" in attr or "." in attr):
                candidates.append(attr)

        # Check anchor text tokens (e.g. "shtg.co/l/t1CQpaw", "youtube.com/watch?v=...", "who.int")
        if t:
            for token in t.split():
                token = token.strip()
                if "." in token and len(token) > 3:
                    candidates.append(token)

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

def update_scan_progress(scan_id, percent, details, posts_count=0, domains_count=0, sync_db=True):
    if scan_id and scan_id in ACTIVE_SCANS:
        ACTIVE_SCANS[scan_id]["percent"] = percent
        ACTIVE_SCANS[scan_id]["details"] = details
        ACTIVE_SCANS[scan_id]["posts_count"] = posts_count
        ACTIVE_SCANS[scan_id]["domains_count"] = domains_count
    if scan_id and sync_db:
        try:
            update_scan_progress_db(scan_id, percent, details, posts_count, domains_count)
        except Exception:
            pass

async def scrape_full_account(handle, scan_id=None, max_posts_cap=None):
    """
    Deploys headless browser to x.com/{handle} and loops continuously scrolling down 
    until the bottom of the account is reached (no post cap, no scroll cap) or force stop is triggered.
    If the direct timeline pauses before reaching account creation year, seamlessly bridges via historical search archive.
    Reports real-time progress percentages to ACTIVE_SCANS.
    """
    # Clean handle of any leading @ or URL parts
    handle = handle.strip().lstrip("@")
    while handle.startswith("@"):
        handle = handle[1:]
    if "/" in handle:
        handle = handle.rstrip("/").split("/")[-1].lstrip("@")

    chrome_exec = find_browser_executable()
    if not chrome_exec:
        raise RuntimeError("No supported Chrome or Chromium executable found on the system.")

    update_scan_progress(scan_id, 5, "Initializing headless Chromium with authenticated session...")

    result = {
        "scan_id": scan_id or "",
        "handle": handle,
        "profile": {
            "name": handle,
            "handle": handle,
            "avatar": "",
            "bio": ""
        },
        "joined": "",
        "joined_year": 0,
        "stopped_early": False,
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

        target_url = f"https://x.com/{handle}"
        print(f"[Scraper] Navigating to account: {target_url} (scan_id: {scan_id})")
        update_scan_progress(scan_id, 15, f"Navigating directly to profile https://x.com/{handle}...")

        await page.goto(target_url, wait_until="domcontentloaded", timeout=30000)
        try:
            await page.wait_for_selector('article', timeout=15000)
        except Exception:
            pass

        update_scan_progress(scan_id, 25, f"Extracting account metadata for @{handle}...")

        # Extract profile details
        profile_data = await page.evaluate('''() => {
            const nameEl = document.querySelector('[data-testid="UserName"]');
            const headerItems = document.querySelector('[data-testid="UserProfileHeader_Items"]');
            const avatarEl = document.querySelector('img[src*="profile_images"]');
            const bioEl = document.querySelector('[data-testid="UserDescription"]');
            const bodyText = document.body ? document.body.innerText : '';
            return {
                name: (nameEl ? nameEl.innerText : '').split(String.fromCharCode(10))[0],
                headerText: headerItems ? headerItems.innerText : '',
                avatar: avatarEl ? avatarEl.getAttribute('src') : '',
                bio: bioEl ? bioEl.innerText : '',
                bodyText: bodyText
            };
        }''')

        result["profile"]["name"] = profile_data.get("name") or handle
        result["profile"]["avatar"] = profile_data.get("avatar") or ""
        result["profile"]["bio"] = profile_data.get("bio") or ""

        if scan_id:
            try:
                update_scan_progress_db(
                    scan_id, 25, f"Extracting account metadata for @{handle}...",
                    profile_name=result["profile"]["name"],
                    profile_avatar=result["profile"]["avatar"]
                )
            except Exception:
                pass

        combined_text = (profile_data.get("headerText") or "") + "\n" + (profile_data.get("bodyText") or "")
        match = re.search(r"Joined\s+([A-Za-z]+)\s+(\d{4})", combined_text, re.IGNORECASE)
        if match:
            joined_year = int(match.group(2))
            result["joined"] = f"{match.group(1).capitalize()} {joined_year}"
            result["joined_year"] = joined_year
        else:
            joined_year = 0
            result["joined"] = "Active"

        # Continuous scroll loop with Force Stop & live progress (NO post cap, NO scroll cap)
        seen_status_urls = set()
        posts_list = []
        domain_counts = {}
        empty_rounds = 0
        scroll_round = 0
        oldest_time = ""
        search_attempted = False

        print(f"[Scraper] Continuous scan running for @{handle} (unlimited depth, high speed)...")
        update_scan_progress(scan_id, 28, f"Scanning timeline posts for @{handle}...", 0, 0, sync_db=True)

        while empty_rounds < 12:
            if scan_id and ACTIVE_SCANS.get(scan_id, {}).get("stop"):
                print(f"[Scraper] Force stop triggered for {scan_id}. Preserving {len(posts_list)} posts.")
                result["stopped_early"] = True
                update_scan_progress(scan_id, 96, f"Force stop received. Finalizing {len(posts_list)} posts...", len(posts_list), len(domain_counts), sync_db=True)
                break

            if max_posts_cap and len(posts_list) >= max_posts_cap:
                print(f"[Scraper] Reached optional post limit: {max_posts_cap}")
                break

            scroll_round += 1

            # In-browser deduplication: only transfer NEW articles across CDP
            extracted = await page.evaluate('''() => {
                const articles = document.querySelectorAll('article');
                window._seenStatusHrefs = window._seenStatusHrefs || new Set();
                const newArticles = [];

                for (const a of articles) {
                    const statusLink = a.querySelector('a[href*="/status/"]');
                    const href = statusLink ? (statusLink.getAttribute('href') || '') : '';
                    if (href && !window._seenStatusHrefs.has(href)) {
                        window._seenStatusHrefs.add(href);

                        const textEl = a.querySelector('[data-testid="tweetText"]');
                        const timeEl = a.querySelector('time');
                        const links = [];

                        // 1. Text links
                        if (textEl) {
                            textEl.querySelectorAll('a').forEach(l => {
                                const h = l.getAttribute('href') || '';
                                const t = l.innerText || '';
                                const tit = l.getAttribute('title') || '';
                                const ar = l.getAttribute('aria-label') || '';
                                if (h || t || tit || ar) links.push({ href: h, text: t, title: tit, aria: ar });
                            });
                        }
                        // 2. Outbound card links & preview anchors
                        a.querySelectorAll('a[target="_blank"], [data-testid*="card"] a, a[role="link"]').forEach(l => {
                            const h = l.getAttribute('href') || '';
                            const t = l.innerText || '';
                            const tit = l.getAttribute('title') || '';
                            const ar = l.getAttribute('aria-label') || '';
                            if (h && !h.includes('/status/') && !h.match(/^\\/[a-zA-Z0-9_]+$/)) {
                                links.push({ href: h, text: t, title: tit, aria: ar });
                            }
                        });

                        newArticles.push({
                            text: textEl ? textEl.innerText : '',
                            time: timeEl ? timeEl.getAttribute('datetime') : '',
                            statusHref: href,
                            links: links
                        });
                    }
                }
                return newArticles;
            }''')

            if scan_id and ACTIVE_SCANS.get(scan_id, {}).get("stop"):
                print(f"[Scraper] Force stop triggered after evaluate for {scan_id}. Preserving {len(posts_list)} posts.")
                result["stopped_early"] = True
                update_scan_progress(scan_id, 96, f"Force stop received. Finalizing {len(posts_list)} posts...", len(posts_list), len(domain_counts), sync_db=True)
                break

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
                if raw_time:
                    oldest_time = raw_time

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

            if new_in_batch == 0:
                empty_rounds += 1
                # Check for and click Twitter's timeline "Retry" button if infinite scroll hit a glitch
                try:
                    await page.evaluate('''() => {
                        const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
                        for (const b of buttons) {
                            const txt = (b.innerText || '').toLowerCase();
                            if (txt.includes('retry') || txt.includes('try again') || txt.includes('reload')) {
                                b.click();
                                return true;
                            }
                        }
                        return false;
                    }''')
                except Exception:
                    pass

                # If timeline paused after 8 attempts, attempt search archive once without looping
                if empty_rounds >= 8 and oldest_time and joined_year and not search_attempted and not (scan_id and ACTIVE_SCANS.get(scan_id, {}).get("stop")):
                    search_attempted = True
                    try:
                        oldest_year = int(oldest_time[:4])
                    except Exception:
                        oldest_year = 0

                    if oldest_year > joined_year and oldest_year > 2006:
                        oldest_date = oldest_time.split("T")[0]
                        print(f"[Scraper] Timeline paused at {oldest_date}. Attempting search archive to reach {joined_year}...")
                        update_scan_progress(scan_id, 85, f"Timeline reached {oldest_date}. Bridging search archive to {joined_year}...", len(posts_list), len(domain_counts), sync_db=True)
                        search_url = f"https://x.com/search?q=from%3A{handle}%20until%3A{oldest_date}&f=live"
                        try:
                            await page.goto(search_url, wait_until="domcontentloaded", timeout=25000)
                            await asyncio.sleep(2.5)
                            has_articles = await page.evaluate("document.querySelectorAll('article').length > 0")
                            if has_articles:
                                empty_rounds = 0
                                continue
                            else:
                                print(f"[Scraper] Search archive returned 0 articles (or rate limited). Preserving {len(posts_list)} posts.")
                                break
                        except Exception as e:
                            print(f"[Scraper] Search continuation error: {e}. Preserving {len(posts_list)} posts.")
                            break
                    else:
                        break
            else:
                empty_rounds = 0

            # Dynamic progress % based on years covered from 2026 down to joined_year
            current_year = datetime.utcnow().year
            if oldest_time and joined_year and 2005 < joined_year <= current_year:
                try:
                    cur_post_year = int(oldest_time[:4])
                    total_years = max(1, current_year - joined_year)
                    covered_years = max(0, min(total_years, current_year - cur_post_year))
                    progress_pct = min(95, 28 + int((covered_years / total_years) * 67))
                except Exception:
                    progress_pct = min(95, 28 + int(67 * (1 - (0.998 ** scroll_round))))
            else:
                progress_pct = min(95, 28 + int(67 * (1 - (0.998 ** scroll_round))))

            detail_msg = f"Scanning timeline • Round {scroll_round} • Captured {len(posts_list)} posts • {len(domain_counts)} unique domains"
            if oldest_time:
                detail_msg = f"Scanning timeline (reached {oldest_time[:10]}) • {len(posts_list)} posts • {len(domain_counts)} unique domains"

            # Disk write throttling: write to SQLite DB only every 5 rounds or at completion
            is_sync_round = (scroll_round % 5 == 0) or (empty_rounds > 0)
            update_scan_progress(scan_id, progress_pct, detail_msg, len(posts_list), len(domain_counts), sync_db=is_sync_round)

            # High-speed scroll: 0.32s sleep when flowing, 0.64s when paused
            scroll_dist = 3200 if new_in_batch > 0 else 4500
            await page.evaluate(f"window.scrollBy(0, {scroll_dist})")
            sleep_iters = 4 if new_in_batch > 0 else 8
            for _ in range(sleep_iters):
                if scan_id and ACTIVE_SCANS.get(scan_id, {}).get("stop"):
                    break
                await asyncio.sleep(0.08)

        await browser.close()
        update_scan_progress(scan_id, 98, f"Formatting {len(posts_list)} posts and extracting root domains...", len(posts_list), len(domain_counts))

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

        update_scan_progress(scan_id, 100, f"Completed! Captured {len(posts_list)} posts and {len(domain_summary)} domains.", len(posts_list), len(domain_summary))
        status = "stopped" if result.get("stopped_early") else "completed"
        if scan_id:
            try:
                complete_scan_record(scan_id, result, status=status)
            except Exception as e:
                print(f"[DB] Error completing scan: {e}")
        return result

@app.route("/")
def index():
    return render_template("index.html", default_handle="elonmusk")

@app.route("/api/scans")
def api_scans():
    """List all saved scans in the SQLite database across all devices/users."""
    scans = list_all_scans()
    # Overlay live memory progress for active scans
    for s in scans:
        s_id = s.get("id")
        if s_id in ACTIVE_SCANS:
            s["percent"] = ACTIVE_SCANS[s_id].get("percent", s["percent"])
            s["details"] = ACTIVE_SCANS[s_id].get("details", s["details"])
            s["posts_count"] = ACTIVE_SCANS[s_id].get("posts_count", s["posts_count"])
            s["domains_count"] = ACTIVE_SCANS[s_id].get("domains_count", s["domains_count"])
            if ACTIVE_SCANS[s_id].get("stop"):
                s["status"] = "stopped" if s.get("status") == "stopped" else "stopping"
            elif s.get("status") in ("completed", "stopped", "failed"):
                pass
            else:
                s["status"] = "running"
    return jsonify(scans)

@app.route("/api/scan/start", methods=["POST"])
def api_scan_start():
    """
    Launch an autonomous background scan thread on the VPS.
    Returns immediately so client browser/tab closure does not interrupt scraping.
    """
    data = request.get_json() or {}
    handle = (data.get("handle") or "").strip().lstrip("@")
    while handle.startswith("@"):
        handle = handle[1:]
    if "/" in handle:
        handle = handle.rstrip("/").split("/")[-1].lstrip("@")

    if not handle:
        return jsonify({"error": "Handle is required"}), 400

    scan_id = data.get("scan_id") or f"scan_{int(datetime.utcnow().timestamp()*1000)}"
    raw_max = data.get("max_posts")
    max_posts = int(raw_max) if raw_max and int(raw_max) > 0 else None

    ACTIVE_SCANS[scan_id] = {
        "stop": False,
        "percent": 5,
        "details": "Initializing headless Chromium with authenticated session...",
        "posts_count": 0,
        "domains_count": 0
    }

    create_scan_record(scan_id, handle)

    def worker_thread(s_id, h_name, m_posts):
        try:
            asyncio.run(scrape_full_account(h_name, scan_id=s_id, max_posts_cap=m_posts))
        except Exception as exc:
            import traceback
            traceback.print_exc()
            fail_scan_record(s_id, str(exc))
        finally:
            ACTIVE_SCANS.pop(s_id, None)

    thread = threading.Thread(target=worker_thread, args=(scan_id, handle, max_posts), daemon=True)
    thread.start()

    return jsonify({
        "status": "running",
        "scan_id": scan_id,
        "handle": handle
    })

@app.route("/api/scan/<scan_id>")
def api_get_scan(scan_id):
    """Retrieve scan status, progress, and full result payload from VPS SQLite database."""
    rec = get_scan_record(scan_id)
    if not rec:
        return jsonify({"error": "Scan session not found"}), 404

    if scan_id in ACTIVE_SCANS:
        rec["percent"] = ACTIVE_SCANS[scan_id].get("percent", rec.get("percent", 5))
        rec["details"] = ACTIVE_SCANS[scan_id].get("details", rec.get("details", ""))
        rec["posts_count"] = ACTIVE_SCANS[scan_id].get("posts_count", rec.get("posts_count", 0))
        rec["domains_count"] = ACTIVE_SCANS[scan_id].get("domains_count", rec.get("domains_count", 0))
        if ACTIVE_SCANS[scan_id].get("stop"):
            rec["status"] = "stopped" if rec.get("status") == "stopped" else "stopping"
        elif rec.get("status") in ("completed", "stopped", "failed"):
            pass
        else:
            rec["status"] = "running"

    return jsonify(rec)

@app.route("/api/scan/<scan_id>/stop", methods=["POST"])
def api_stop_scan_id(scan_id):
    """Signal a running background scrape on the VPS to gracefully stop and save captured posts."""
    print(f"[API] Stop request received for scan_id: {scan_id}")
    if scan_id in ACTIVE_SCANS:
        ACTIVE_SCANS[scan_id]["stop"] = True
        ACTIVE_SCANS[scan_id]["details"] = "Force stop received. Finalizing captured posts..."

    conn = get_db_connection()
    with conn:
        conn.execute("""
            UPDATE scans 
            SET status = CASE WHEN status = 'running' THEN 'stopped' ELSE status END,
                details = 'Stopping scan and finalizing captured posts...'
            WHERE id = ?
        """, (scan_id,))
    conn.close()

    return jsonify({"status": "stopping", "scan_id": scan_id})

@app.route("/api/scan/<scan_id>", methods=["DELETE"])
def api_delete_scan(scan_id):
    """Delete a scan session from the VPS SQLite database."""
    if scan_id in ACTIVE_SCANS:
        ACTIVE_SCANS[scan_id]["stop"] = True
        ACTIVE_SCANS.pop(scan_id, None)
    delete_scan_record(scan_id)
    return jsonify({"status": "deleted", "scan_id": scan_id})

@app.route("/api/scans/clear", methods=["POST"])
def api_clear_scans():
    """Clear all scans from the VPS database."""
    for s_id in list(ACTIVE_SCANS.keys()):
        ACTIVE_SCANS[s_id]["stop"] = True
    ACTIVE_SCANS.clear()
    clear_all_scans()
    return jsonify({"status": "cleared"})

# Backward compatibility routes
@app.route("/api/scrape", methods=["POST"])
def api_scrape():
    """Legacy synchronous endpoint."""
    data = request.get_json() or {}
    handle = (data.get("handle") or "").strip().lstrip("@")
    if not handle:
        return jsonify({"error": "Handle is required"}), 400
    scan_id = data.get("scan_id") or f"scan_{int(datetime.utcnow().timestamp()*1000)}"
    raw_max = data.get("max_posts")
    max_posts = int(raw_max) if raw_max and int(raw_max) > 0 else None
    create_scan_record(scan_id, handle)
    try:
        scraped_data = asyncio.run(scrape_full_account(handle, scan_id=scan_id, max_posts_cap=max_posts))
        return jsonify(scraped_data)
    except Exception as e:
        import traceback
        traceback.print_exc()
        fail_scan_record(scan_id, str(e))
        return jsonify({"error": str(e)}), 500

@app.route("/api/progress")
def api_progress():
    scan_id = request.args.get("scan_id")
    if scan_id and scan_id in ACTIVE_SCANS:
        return jsonify(ACTIVE_SCANS[scan_id])
    if scan_id:
        rec = get_scan_record(scan_id)
        if rec:
            return jsonify({
                "percent": rec.get("percent", 100),
                "details": rec.get("details", "Completed"),
                "posts_count": rec.get("posts_count", 0),
                "domains_count": rec.get("domains_count", 0),
                "status": rec.get("status", "completed")
            })
    return jsonify({"percent": 100, "details": "Completed or idle", "posts_count": 0, "domains_count": 0})

@app.route("/api/stop", methods=["POST"])
def api_stop():
    data = request.get_json() or {}
    scan_id = data.get("scan_id")
    if scan_id and scan_id in ACTIVE_SCANS:
        ACTIVE_SCANS[scan_id]["stop"] = True
        return jsonify({"status": "stopping", "scan_id": scan_id})
    return jsonify({"status": "not_running_or_already_stopped", "scan_id": scan_id})

@app.route("/api/health")
def api_health():
    browser = find_browser_executable()
    return jsonify({
        "status": "healthy",
        "browser_found": bool(browser),
        "browser_path": browser,
        "auth_token_set": bool(AUTH_TOKEN),
        "active_scans_count": len(ACTIVE_SCANS),
        "timestamp": datetime.utcnow().isoformat() + "Z"
    })

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"X Extractor Dashboard running on http://0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)