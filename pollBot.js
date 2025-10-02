const puppeteer = require("puppeteer");
const schedule = require("node-schedule");
const fs = require("fs");
const { format, parseISO, isAfter, endOfWeek, isBefore } = require("date-fns");


const CHAT_ID = "809433941499799"; //replace with any group chat


// get the next practice
function getNextPracticeThisWeek() {
  const practices = JSON.parse(fs.readFileSync("practices.json", "utf8"));
  const now = new Date();
  const end = endOfWeek(now, { weekStartsOn: 1 }); // Sunday 23:59:59 local

  const next = practices.find(p => isAfter(parseISO(p.date), now));
  if (!next) return null;

  const nextDate = parseISO(next.date);

  // skip if it's after this week
  if (!isBefore(nextDate, end)) {
    console.log("⚠️ Next practice is not this week — skipping poll.", nextDate);
    console.log(end);
    return null;
  }

  // Format for poll
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

  // Navigate so we’re on messenger domain before applying localStorage
  await page.goto("https://www.messenger.com/");
  await page.evaluate(storage => {
    for (let key in storage) {
      localStorage.setItem(key, storage[key]);
    }
  }, localStorage);

  console.log("✅ Session loaded.");
  return true;
}

//post poll
async function postPoll(dateText) {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  await page.goto("https://www.messenger.com/login", { waitUntil: "networkidle2" });

  // Now continue with the rest of your poll posting
  await page.goto(`https://www.messenger.com/t/${CHAT_ID}`, { waitUntil: "networkidle2" });

  await page.waitForSelector('div[role="button"][aria-label="Close"]', { timeout: 30000 });
  await page.click('div[role="button"][aria-label="Close"]');
  await page.waitForSelector('div[role="button"][aria-label="Don\\\'t restore messages"]', { timeout: 30000 });
  await page.click('div[role="button"][aria-label="Don\\\'t restore messages"]');
  console.log("🆗 Restore bypassed.");

  await page.waitForSelector('div[role="button"][aria-haspopup="menu"]', { timeout: 30000 });
  await page.click('div[role="button"][aria-haspopup="menu"]');
  console.log("🆗 Menu loaded.");

  await page.waitForSelector('div[role="menuitem"][aria-label="Create a poll"', { timeout: 30000 });
  await page.click('div[role="menuitem"][aria-label="Create a poll"');
  console.log("🆗 Poll loaded.");

  // Fill poll text
  await page.waitForSelector('input[aria-label="Ask a question"]', { timeout: 30000 });
  await page.type('input[aria-label="Ask a question"]', dateText);
  const optionInputs = await page.$$('input[aria-label="Add option..."]');
  await optionInputs[0].type("Yes");
  await page.keyboard.press("Tab");
  await page.keyboard.type("No");
  console.log("🆗 Poll question and options inputted.");

  await page.waitForFunction(() => {
    const inputs = document.querySelectorAll('input[aria-label="Add option..."]');
    return inputs.length >= 2 && inputs[0].value.length > 0 && inputs[1].value.length > 0;
  }, { timeout: 5000 });

  console.log("🆗 Poll inputs confirmed in DOM.");

  // Submit poll
  await page.waitForSelector('div[role="button"][aria-label="Create poll"]', { timeout: 30000 });
  await page.click('div[role="button"][aria-label="Create poll"]');
  console.log("✅ Poll created:", dateText);

  await browser.close();
}

schedule.scheduleJob("* * * * *", async () => {
  console.log("💬 Running script...");
  const practiceText = getNextPracticeThisWeek();
  if (practiceText) {
    await postPoll(practiceText);
  } else {
    console.log("⚠️ No upcoming practice found in list.");
  }
});

//first run
// (async () => {
//   const practiceText = getNextPracticeThisWeek();

//   if (practiceText) {
//     await postPoll(practiceText);
//   } else {
//     console.log("⚠️ No upcoming practice found in list.");

//   }
// })();
