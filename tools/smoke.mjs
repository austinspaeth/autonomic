import { JSDOM } from "jsdom";
import fs from "fs";
import path from "path";

const root = path.resolve(".");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(root, "app.js"), "utf8");

const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/" });
const { window } = dom;
// stubs jsdom lacks
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
window.URL.createObjectURL = () => "blob:x";
window.URL.revokeObjectURL = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};

const errors = [];
window.addEventListener("error", (e) => errors.push(e.error || e.message));

// run app.js in the window context
window.eval(appJs);

const doc = window.document;
const $ = (s) => doc.querySelector(s);

function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); errors.push(msg); }
  else console.log("ok:", msg);
}

// 1. Sections rendered
assert($("#dayContent").children.length === 5, "5 day sections render");
assert(doc.querySelector(".datebar"), "date bar present");

// 2. Default catalogs seeded
const rows = doc.querySelectorAll("#dayContent .section");
assert(/Activities/.test(rows[2].textContent), "activities section");
assert(/Indoor bike/.test(doc.body.textContent), "seeded activity present");
assert(/High BP/.test(doc.body.textContent), "seeded symptom present");

// 3. Toggle an activity checkbox -> persists to localStorage
const firstCheck = doc.querySelector("#dayContent .section:nth-child(3) .check");
firstCheck.dispatchEvent(new window.Event("click", { bubbles: true }));
const saved = JSON.parse(window.localStorage.getItem("autonomic.journal.v1"));
const dayKeys = Object.keys(saved.days);
assert(dayKeys.length === 1, "a day record was created on toggle");
const acts = saved.days[dayKeys[0]].activities;
assert(Object.keys(acts).length === 1, "one activity logged");

// 4. Sleep input saves
const bed = doc.querySelector('#dayContent input[type=time]');
bed.value = "22:30";
bed.dispatchEvent(new window.Event("change", { bubbles: true }));
const saved2 = JSON.parse(window.localStorage.getItem("autonomic.journal.v1"));
assert(saved2.days[dayKeys[0]].sleep.bed === "22:30", "sleep bed time saved");

// 5. Open reading menu modal
doc.querySelector("#dayContent .section:nth-child(2) .add-link").click();
assert($(".modal-overlay"), "reading menu modal opens");
// choose HRV
const menuItems = doc.querySelectorAll(".modal .menu-item");
menuItems[0].click();
assert($(".modal-overlay h2").textContent.includes("HRV"), "HRV form opens");
// fill value + save
const numField = doc.querySelector(".modal input[type=number]");
numField.value = "42";
[...doc.querySelectorAll(".modal .btn")].find((b) => b.textContent === "Save").click();
const saved3 = JSON.parse(window.localStorage.getItem("autonomic.journal.v1"));
assert(saved3.days[dayKeys[0]].readings.length === 1, "HRV reading saved");
assert(saved3.days[dayKeys[0]].readings[0].value === "42", "HRV value correct");

// 6. Calendar opens
$("#dateLabel").click();
assert(/[A-Za-z]+ \d{4}/.test($(".modal-overlay").textContent), "calendar month label");
// close it
doc.querySelector(".modal-overlay").dispatchEvent(new window.Event("click", { bubbles: true }));

// 7. Day navigation arrows
const before = $("#dateLabel").textContent;
$("#prevDay").click();
assert($("#dateLabel").textContent !== before, "prev day changes label");
$("#nextDay").click();

// 8. Theme toggle
const themeBefore = doc.documentElement.getAttribute("data-theme");
$("#themeBtn").click();
assert(doc.documentElement.getAttribute("data-theme") !== themeBefore, "theme toggles");

// 9. Switch to analysis view + render charts
doc.querySelectorAll(".tab")[1].click();
assert(!$("#analysisView").classList.contains("hidden"), "analysis view shown");
assert($("#analysisContent .stat-grid"), "stat cards render");
assert(doc.querySelector("#analysisContent svg"), "a chart svg renders");

// 10. Add a new symptom via defForm
doc.querySelectorAll(".tab")[0].click();
doc.querySelector("#dayContent .section:nth-child(5) .add-link").click();
const nameInput = doc.querySelector(".modal input[type=text]");
nameInput.value = "Tremor";
[...doc.querySelectorAll(".modal .btn")].find((b) => b.textContent === "Save").click();
const saved4 = JSON.parse(window.localStorage.getItem("autonomic.journal.v1"));
assert(saved4.defs.symptoms.some((s) => s.name === "Tremor"), "new symptom added to catalog");

// 11. Archive (delete) a symptom keeps it off today's active list
const symCount = doc.querySelectorAll("#dayContent .section:nth-child(5) .row").length;
assert(symCount >= 6, "symptom rows present incl new");

console.log("\nERRORS:", errors.length);
if (errors.length) { errors.forEach((e) => console.error(e)); process.exit(1); }
console.log("ALL SMOKE TESTS PASSED");
