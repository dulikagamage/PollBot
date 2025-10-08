# Poll Bot

Automated Facebook Messenger bot that sends weekly practice polls to group chats.

## Features

- Automatically logs into Facebook Messenger
- Creates polls for upcoming practices within the current week
- Runs on a schedule (every Monday at 9 AM)
- Session persistence to avoid repeated logins
- Handles Facebook UI prompts automatically

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your credentials:
   - `FB_EMAIL`: Your Facebook email
   - `FB_PASSWORD`: Your Facebook password
   - `CHAT_ID`: Facebook group chat ID

3. **Add practice schedule**
   Update `practices.json` with your practice dates and times.

## Usage

**Start the bot:**
```bash
npm start
```

**Test immediately:**
Uncomment the test section at the bottom of `pollbot.js`

**Test every minute:**
Uncomment the test schedule in `pollbot.js`

## Files

- `pollbot.js` - Main bot script
- `practices.json` - Practice schedule data
- `.env` - Environment variables (not committed)
- `session.json` - Saved login session (auto-generated)

## How it works

1. Bot checks for practices scheduled within the current week
2. If found, logs into Facebook Messenger
3. Opens the specified group chat
4. Creates a poll asking about attendance
5. Runs automatically every Monday at 9 AM