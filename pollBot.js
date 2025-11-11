require('dotenv').config();
const puppeteer = require("puppeteer");
const schedule = require("node-schedule");
const fs = require("fs");
const { format, parseISO, isAfter, endOfWeek, isBefore } = require("date-fns");

//env config
const CHAT_ID = process.env.CHAT_ID;
const FB_EMAIL = process.env.FB_EMAIL;
const FB_PASSWORD = process.env.FB_PASSWORD;


//get the next practice
function getNextPracticeThisWeek() {
  const practices = JSON.parse(fs.readFileSync("practices.json", "utf8"));
  const now = new Date();
  const end = endOfWeek(now, { weekStartsOn: 1 }); 

  const next = practices.find(p => isAfter(parseISO(p.date), now));
  if (!next) return null;

  const nextDate = parseISO(next.date);

  //skip if it's after this week
  if (!isBefore(nextDate, end)) {
    console.log("⚠️ Next practice is not this week — skipping poll.", nextDate);
    console.log(end);
    return null;
  }

  //format for poll
  const prettyDate = format(nextDate, "EEEE, MMMM d");
  const startTime = format(new Date(`${next.date}T${next.start}`), "h:mma");
  const endTime = format(new Date(`${next.date}T${next.end}`), "h:mma");

  return `${prettyDate} @ ${startTime}-${endTime}`;
}


async function saveSession(page) {
  const cookies = await page.cookies();
  const localStorage = await page.evaluate(() => {
    let store = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      store[key] = localStorage.getItem(key);
    }
    return store;
  });

  fs.writeFileSync("session.json", JSON.stringify({ cookies, localStorage }));
  console.log("✅ Session saved.");
}

async function loadSession(page) {
  if (!fs.existsSync("session.json")) return false;

  const { cookies, localStorage } = JSON.parse(fs.readFileSync("session.json", "utf8"));

  // Set cookies first
  for (let cookie of cookies) {
    await page.setCookie(cookie);
  }

  // Navigate so we're on messenger domain before applying localStorage
  await page.goto("https://www.messenger.com/");
  await page.evaluate(storage => {
    for (let key in storage) {
      localStorage.setItem(key, storage[key]);
    }
  }, localStorage);

  console.log("✅ Session loaded.");
  return true;
}

async function loginToFacebook(page) {
  console.log("🔐 Attempting to log in...");
  
  // Try to load existing session first
  const sessionLoaded = await loadSession(page);
  if (sessionLoaded) {
    await page.goto(`https://www.messenger.com/t/${CHAT_ID}`, { waitUntil: "networkidle2" });
    
    // Check if we're actually logged in by looking for chat interface
    try {
      await page.waitForSelector('div[role="textbox"]', { timeout: 5000 });
      console.log("✅ Session valid, already logged in.");
      return true;
    } catch {
      console.log("⚠️ Session expired, need to login again.");
    }
  }

  // Need to login
  await page.goto("https://www.messenger.com/login", { waitUntil: "networkidle2" });
  
  // Fill login form
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.type('#email', FB_EMAIL);
  await page.type('#pass', FB_PASSWORD);
  await page.click('button[name="login"]');
  
  // Wait for login to complete
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });
  
  // Save session for next time
  await saveSession(page);
  console.log("✅ Successfully logged in.");
  return true;
}

//post poll
async function postPoll(dateText) {
  // Resource monitoring
  const used = process.memoryUsage();
  console.log(`💾 Memory usage: ${Math.round(used.rss / 1024 / 1024)}MB`);
  
  const browser = await puppeteer.launch({ 
    headless: process.env.NODE_ENV === 'production',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--memory-pressure-off',
      '--max_old_space_size=512'
    ]
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  try {
    // Login to Facebook
    await loginToFacebook(page);
    
    // Navigate to the specific chat
    await page.goto(`https://www.messenger.com/t/${CHAT_ID}`, { waitUntil: "networkidle2" });

    // Handle potential restore messages dialog
    while(true){
      try {
        await page.waitForSelector('div[role="button"][aria-label="Close"]', { timeout: 5000 });
        await page.click('div[role="button"][aria-label="Close"]');
        console.log("🆗 Pin prompt dismissed.");
        await page.waitForSelector('div[role="button"][aria-label="Don\'t restore messages"]', { timeout: 5000 });
        await page.click('div[role="button"][aria-label="Don\'t restore messages"]');
        console.log("🆗 Restore dialog bypassed.");
      } catch {
        console.log("ℹ️ No restore dialog found.");
        break;
      }
    }

    console.log("🔍 Looking for menu button...");
    await page.waitForSelector('div[role="button"][aria-haspopup="menu"][aria-label="Open more actions"]', { timeout: 30000 });
    await page.click('div[role="button"][aria-haspopup="menu"][aria-label="Open more actions"]');
    console.log("🆗 Menu opened.");

    console.log("🔍 Looking for Create a poll option...");
    await page.waitForSelector('div[role="menuitem"][aria-label="Create a poll"]', { timeout: 30000 });
    await page.click('div[role="menuitem"][aria-label="Create a poll"]');
    console.log("🆗 Poll dialog opened.");

    // Fill poll text
    console.log("🔍 Looking for question input...");
    await page.waitForSelector('input[aria-label="Ask a question"]', { timeout: 30000 });
    await page.type('input[aria-label="Ask a question"]', `Practice this week: ${dateText}`);
    console.log("🆗 Question typed.");
    
    const optionInputs = await page.$$('input[aria-label="Add option..."]');
    await optionInputs[0].type("Yes");
    await page.keyboard.press("Tab");
    await page.keyboard.type("No");
    console.log("🆗 Poll options filled.");

    // Submit poll
    console.log("🔍 Looking for Create poll button...");
    await page.waitForSelector('div[role="button"][aria-label="Create poll"]', { timeout: 30000 });
    await page.click('div[role="button"][aria-label="Create poll"]');
    console.log("🆗 Create poll button clicked.");
    console.log("✅ Poll creation attempted:", dateText);
    
  } catch (error) {
    console.error("❌ Error creating poll:", error.message);
    console.log("📸 Taking screenshot for debugging...");
    await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
  } finally {
    await browser.close();
    console.log("💻 Browser closed");
  }
}

// Schedule to run every Monday at 9 AM
schedule.scheduleJob('0 9 * * 1', async () => {
  console.log("💬 Weekly poll check running...");
  const practiceText = getNextPracticeThisWeek();
  if (practiceText) {
    console.log("📅 Practice found this week, creating poll...");
    await postPoll(practiceText);
  } else {
    console.log("⚠️ No practice this week, skipping poll.");
  }
});

// Test function - runs every minute (comment out for production)
// schedule.scheduleJob('* * * * *', async () => {
//   console.log("🧪 Test run every minute...");
//   const practiceText = getNextPracticeThisWeek();
//   if (practiceText) {
//     await postPoll(practiceText);
//   } else {
//     console.log("⚠️ No upcoming practice found in list.");
//   }
// });

// Uncomment for immediate test run
(async () => {
  console.log("🧪 Test run once...");
  const practiceText = getNextPracticeThisWeek();
  if (practiceText) {
    await postPoll(practiceText);
  } else {
    console.log("⚠️ No upcoming practice found in list.");
  }
})();