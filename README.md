# FOW Car Listing Watcher (GitHub Actions + Telegram)

This repository runs a **free, autonomous watcher** for a saved search on `fow.co.uk`.

- It runs on **GitHub Actions** every 20 minutes at `:07`, `:27`, and `:47`.
- It loads the search page using **Playwright** (real browser rendering).
- It compares listings against `state.json` so you only get alerts for **new** listings.
- It sends notifications through **Telegram**.
- It follows a polite/safe approach: low frequency, single page load per run, random delay, robots check.

> If robots/access checks do not allow monitoring, the script will **not scrape** and will send/print a safety fallback message.

---

## 1) What files do what?

- `watch_fow.py` – main watcher script.
- `.github/workflows/watch.yml` – scheduled automation in GitHub Actions.
- `requirements.txt` – Python dependencies.
- `state.json` – stores seen listing IDs between runs.

---

## 2) Telegram setup (bot token + chat ID)

### Create a bot and get token
1. In Telegram, open **@BotFather**.
2. Send `/newbot` and follow prompts.
3. Copy the bot token (looks like `123456:ABC-DEF...`).

### Get your chat ID
You can use **@userinfobot** (simple option):
1. Open **@userinfobot** in Telegram.
2. Send any message.
3. Copy your numeric user ID (this is usually your chat ID for direct messages).

Alternative for group chats:
- Add the bot to the group.
- Send a message in the group.
- Use Telegram `getUpdates` API to inspect updates and get the group chat ID (negative number).

---

## 3) Add GitHub Secrets

In your GitHub repo:
1. Go to **Settings → Secrets and variables → Actions**.
2. Add:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`

If these are missing, the script prints notifications to stdout instead of failing.

---

## 4) Enable GitHub Actions schedule

1. Commit and push this repository.
2. Open **Actions** tab and ensure workflows are enabled.
3. The watcher runs on schedule (`7,27,47 * * * *`) and can also be started manually via **Run workflow**.

> GitHub scheduled workflows are best-effort and may run a little late.

---

## 5) Configure search URL and matching rules

Open `watch_fow.py` and edit:

- `SEARCH_URL` – the fow.co.uk saved search URL.
- `MATCH_CONFIG`:
  - `max_price_gbp` (default `14000` and only enforced when price is parsed)
  - `max_mileage`
  - `min_year`
  - `include_keywords` (list)
  - `exclude_keywords` (list)

Defaults are intentionally permissive so you do not miss listings.

---

## 6) Local run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install --with-deps chromium
python watch_fow.py
```

Expected output includes a summary like:
- listings found
- new listings
- new matching listings
- parse failures

---

## 7) Limitations and behavior

- GitHub Actions schedule is not real-time and can be delayed.
- Parsing can break if site markup changes.
- This watcher uses one page load per run and avoids aggressive behavior.
- If robots/access checks disallow it, watcher refuses scraping and reports that instead.

