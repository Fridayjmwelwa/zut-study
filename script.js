// ================= CONFIG =================
// Paste your two Supabase values here (copy them from your old script.js):
const SUPABASE_URL = "https://gzhnivjqqopmvdkseedc.supabase.co";      // must end at .supabase.co
const SUPABASE_KEY = "sb_publishable_tF4wPHHsaAdxUUjz5VrKFA_2dxOp2qs";  // the public sb_publishable_... key only
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const ZUT_PORTAL_URL = "";                               // paste the ZUT student portal address here
const SUPPORT_EMAIL = "your-support-email@example.com";  // change to your support email

// ================= STATE =================
let papers = [];
let courses = [];
let materials = [];
let officialEvents = [];
let personalReminders = [];
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let calendarSelectedDate = localDateString(new Date());
let schools = [];
let programs = [];
let programCourses = [];
let myCodes = [];
let setupSet = new Set();
let setupShownFor = null;
let libraryScope = "mine";
let currentUser = null;
let currentCourse = null;
let libraryMode = "papers";
let authMode = "login";
let loadedFor = null;
let loadFailed = false;
let navDepth = 0;
let chatBusy = false;
let settings = loadSettings();

// Pages that are not in the bottom nav, and which nav tab to highlight for them
const SUB_PAGES = { course: "library", calendar: "home", planner: "home", setup: "profile" };

function el(id) {
  return document.getElementById(id);
}

// ================= LOAD DATA =================
async function loadAll() {
  loadFailed = false;
  const p = await db.from("papers").select("*");
  const c = await db.from("courses").select("*");
  const m = await db.from("materials").select("*");

  if (p.error) {
    console.error("papers error:", p.error);
    loadFailed = true;
  } else {
    papers = p.data;
  }

  if (c.error) {
    console.error("courses error:", c.error);
    loadFailed = true;
  } else {
    courses = c.data;
  }

  if (m.error) {
    console.error("materials error:", m.error);
    loadFailed = true;
  } else {
    materials = m.data;
  }

  await loadStudyData();
  await loadCalendarData();
  renderAll();
  maybeShowSetup();
}

function renderAll() {
  applySettings();
  renderHome();
  renderLibrary();
  fillCourseSelect();
  fillProfile();
  renderCalendar();
}

// ================= HELPERS =================
function sameCode(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function emptyBox(text) {
  const d = document.createElement("div");
  d.className = "empty";
  d.innerText = text;
  return d;
}

function emptyItem(text) {
  const li = document.createElement("li");
  li.className = "empty";
  li.innerText = text;
  return li;
}

function papersFor(code) {
  return papers
    .filter(function (p) {
      return sameCode(p.course, code);
    })
    .sort(function (a, b) {
      return b.year - a.year;
    });
}

function materialsFor(code) {
  return materials.filter(function (m) {
    return sameCode(m.course, code);
  });
}

function courseInfo(c, mode) {
  const n = mode === "materials" ? materialsFor(c.code).length : papersFor(c.code).length;
  const what = mode === "materials" ? " study materials" : " past papers";
  return (c.name ? c.name + " · " : "") + n + what;
}

function makeCourseCard(c, info) {
  const card = document.createElement("div");
  card.className = "course-card";
  const s = document.createElement("strong");
  s.innerText = c.code;
  const sp = document.createElement("span");
  sp.innerText = info;
  card.appendChild(s);
  card.appendChild(sp);
  card.onclick = function () {
    openCourse(c);
  };
  return card;
}

function mainCourse() {
  for (let i = 0; i < courses.length; i++) {
    if (sameCode(courses[i].code, settings.course)) return courses[i];
  }
  return null;
}

function userMeta() {
  return currentUser && currentUser.user_metadata ? currentUser.user_metadata : {};
}

function firstName() {
  const full = userMeta().full_name;
  return full ? full.trim().split(" ")[0] : "";
}

function initials(name) {
  const words = String(name || "").trim().split(/\s+/);
  let out = "";
  for (let i = 0; i < words.length && i < 2; i++) {
    if (words[i]) out += words[i].charAt(0).toUpperCase();
  }
  return out || "?";
}

// ================= NAVIGATION =================
function renderPage(name) {
  const pages = document.querySelectorAll(".page");
  for (let i = 0; i < pages.length; i++) {
    pages[i].hidden = pages[i].id !== name + "-page";
  }

  const navName = SUB_PAGES[name] || name;
  const btns = document.querySelectorAll("#bottom-nav button");
  for (let i = 0; i < btns.length; i++) {
    btns[i].classList.toggle("active", btns[i].dataset.tab === navName);
  }

  document.body.classList.toggle("setup-mode", name === "setup");
  window.scrollTo(0, 0);
}

function showTab(name, fromBack) {
  if (!el(name + "-page")) return;

  if (!fromBack) {
    if (name === "home") {
      // Go all the way back to Home using the browser history
      if (navDepth > 0) {
        history.go(-navDepth);
        return;
      }
    } else if (SUB_PAGES[name] || navDepth === 0) {
      navDepth++;
      history.pushState({ page: name, depth: navDepth }, "");
    } else {
      // tab to tab: do not pile up history
      history.replaceState({ page: name, depth: navDepth }, "");
    }
  }

  renderPage(name);
  if (name === "calendar") { if (el("reminder-date") && !el("reminder-date").value) el("reminder-date").value = localDateString(new Date()); renderCalendar(); }
}

function goBack() {
  if (navDepth > 0) history.back();
  else renderPage("home");
}

window.addEventListener("popstate", function (e) {
  const st = e.state;
  navDepth = st && st.depth ? st.depth : 0;
  renderPage(st && st.page ? st.page : "home");
});

// ================= HOME =================
function renderHome() {
  const first = firstName();
  el("home-greeting").innerText = "Hello, " + (first || "Student") + " 👋";

  const main = mainCourse() || visibleCourses()[0];
  el("continue-title").innerText = main ? main.code : "Choose a course";

  const box = el("home-courses");
  box.innerHTML = "";

  if (loadFailed) {
    box.appendChild(emptyBox("Could not load your courses. Check your internet connection and reload."));
    return;
  }
  if (visibleCourses().length === 0) {
    box.appendChild(emptyBox("No courses have been added yet."));
    return;
  }

  const ordered = visibleCourses().slice();
  ordered.sort(function (a, b) {
    const am = sameCode(a.code, settings.course) ? 0 : 1;
    const bm = sameCode(b.code, settings.course) ? 0 : 1;
    return am - bm;
  });
  for (let i = 0; i < ordered.length && i < 4; i++) {
    box.appendChild(makeCourseCard(ordered[i], courseInfo(ordered[i], "papers")));
  }
}

function continueLearning() {
  const c = mainCourse() || visibleCourses()[0];
  if (c) openCourse(c);
  else showTab("library");
}

// ================= LIBRARY =================
function setLibraryMode(mode) {
  libraryMode = mode;
  el("lib-tab-papers").classList.toggle("active", mode === "papers");
  el("lib-tab-materials").classList.toggle("active", mode === "materials");
  renderLibrary();
}

function courseMatches(c, text) {
  if (String(c.code || "").toLowerCase().includes(text)) return true;
  if (c.name && c.name.toLowerCase().includes(text)) return true;

  if (libraryMode === "papers") {
    const list = papersFor(c.code);
    for (let i = 0; i < list.length; i++) {
      if (String(list[i].year).includes(text)) return true;
    }
  } else {
    const list = materialsFor(c.code);
    for (let i = 0; i < list.length; i++) {
      const t = (list[i].title || "") + " " + (list[i].topic || "");
      if (t.toLowerCase().includes(text)) return true;
    }
  }
  return false;
}

function renderLibrary() {
  const box = el("library-list");
  const text = el("library-search").value.trim().toLowerCase();
  box.innerHTML = "";

  if (loadFailed) {
    box.appendChild(emptyBox("Could not load courses. Check your internet connection and reload."));
    return;
  }

  const scopeBtn = el("lib-scope-btn");
  scopeBtn.hidden = myCodes.length === 0;
  scopeBtn.innerText = libraryScope === "mine" ? "Showing my courses · Show all" : "Showing all courses · Show mine";
  const pool = libraryScope === "all" ? courses : visibleCourses();

  let shown = 0;
  for (let i = 0; i < pool.length; i++) {
    const c = pool[i];
    if (text && !courseMatches(c, text)) continue;
    box.appendChild(makeCourseCard(c, courseInfo(c, libraryMode)));
    shown++;
  }
  if (shown === 0) {
    box.appendChild(emptyBox(text ? "Nothing matches your search." : "No courses have been added yet."));
  }
}

el("library-search").addEventListener("input", renderLibrary);

// ================= COURSE DETAIL =================
function resourceItem(title, info, url) {
  const li = document.createElement("li");
  const s = document.createElement("strong");
  s.innerText = title;
  const sp = document.createElement("span");
  sp.innerText = info;
  li.appendChild(s);
  li.appendChild(sp);
  if (url) {
    const a = document.createElement("a");
    a.className = "download-btn";
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.innerText = "Download";
    li.appendChild(a);
  }
  return li;
}

function setCourseTab(tab) {
  el("course-tab-papers").classList.toggle("active", tab === "papers");
  el("course-tab-materials").classList.toggle("active", tab === "materials");
  el("course-papers-panel").hidden = tab !== "papers";
  el("course-materials-panel").hidden = tab !== "materials";
}

function openCourse(c) {
  currentCourse = c;
  el("course-hero-title").innerText = c.code;
  el("course-hero-sub").innerText = c.name || "Course resources";

  const pl = el("course-papers");
  pl.innerHTML = "";
  const coursePapers = papersFor(c.code);
  for (let i = 0; i < coursePapers.length; i++) {
    const p = coursePapers[i];
    pl.appendChild(resourceItem(p.year + " Past Paper", "Past paper · " + p.year, p.file_url));
  }
  if (coursePapers.length === 0) pl.appendChild(emptyItem("No past papers uploaded yet."));

  const ml = el("course-materials");
  ml.innerHTML = "";
  const courseMaterials = materialsFor(c.code);
  for (let i = 0; i < courseMaterials.length; i++) {
    const m = courseMaterials[i];
    ml.appendChild(resourceItem(m.title || "Study material", m.topic || "Study material", m.file_url));
  }
  if (courseMaterials.length === 0) ml.appendChild(emptyItem("No study materials uploaded yet."));

  setCourseTab(libraryMode);
  showTab("course");
}

// ================= ACADEMIC CALENDAR =================
function localDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

async function loadCalendarData() {
  if (!currentUser) return;
  const results = await Promise.all([
    db.from("zut_academic_events").select("id,title,description,event_date,event_type").order("event_date", { ascending: true }),
    db.from("student_reminders").select("id,title,description,event_date").eq("user_id", currentUser.id).order("event_date", { ascending: true })
  ]);
  if (results[0].error) {
    console.error("Official calendar events could not be loaded:", results[0].error);
    officialEvents = [];
  } else officialEvents = results[0].data || [];
  if (results[1].error) {
    console.error("Personal reminders could not be loaded:", results[1].error);
    personalReminders = [];
  } else personalReminders = results[1].data || [];
}

function calendarEventsForDate(date) {
  return officialEvents.filter(e => e.event_date === date).map(e => ({ ...e, kind: "official" }))
    .concat(personalReminders.filter(e => e.event_date === date).map(e => ({ ...e, kind: "personal" })));
}

function renderCalendar() {
  if (!el("calendar-days")) return;
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  el("calendar-month-title").innerText = calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid = el("calendar-days");
  grid.innerHTML = "";
  for (let i = 0; i < firstDay; i++) {
    const blank = document.createElement("span"); blank.className = "calendar-blank"; grid.appendChild(blank);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const date = localDateString(new Date(year, month, day));
    const events = calendarEventsForDate(date);
    const button = document.createElement("button");
    button.type = "button"; button.className = "calendar-day";
    if (date === localDateString(new Date())) button.classList.add("today");
    if (date === calendarSelectedDate) button.classList.add("selected");
    button.setAttribute("aria-label", date + (events.length ? ", " + events.length + " events" : ""));
    const number = document.createElement("span"); number.textContent = day; button.appendChild(number);
    if (events.length) {
      const dots = document.createElement("span"); dots.className = "calendar-dots";
      if (events.some(e => e.kind === "official")) { const dot = document.createElement("i"); dot.className = "official-dot"; dots.appendChild(dot); }
      if (events.some(e => e.kind === "personal")) { const dot = document.createElement("i"); dot.className = "personal-dot"; dots.appendChild(dot); }
      button.appendChild(dots);
    }
    button.addEventListener("click", function () { calendarSelectedDate = date; renderCalendar(); renderCalendarEvents(); });
    grid.appendChild(button);
  }
  renderCalendarEvents();
}

function renderCalendarEvents() {
  if (!el("calendar-event-list")) return;
  const list = el("calendar-event-list"); list.innerHTML = "";
  const events = calendarEventsForDate(calendarSelectedDate);
  el("calendar-selected-title").innerText = new Date(calendarSelectedDate + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (!events.length) { list.appendChild(emptyBox("No events for this date. Choose another date or add a reminder below.")); return; }
  events.forEach(function (event) {
    const card = document.createElement("article"); card.className = "calendar-event";
    const marker = document.createElement("span"); marker.className = "event-marker " + (event.kind === "official" ? "official-dot" : "personal-dot");
    const body = document.createElement("div"); body.className = "calendar-event-copy";
    const title = document.createElement("strong"); title.textContent = event.title;
    const type = document.createElement("small"); type.textContent = event.kind === "official" ? "Official ZUT event" : "Personal reminder";
    body.append(title, type);
    if (event.description) { const desc = document.createElement("p"); desc.textContent = event.description; body.appendChild(desc); }
    card.append(marker, body);
    if (event.kind === "personal") {
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "reminder-delete"; remove.textContent = "Delete";
      remove.addEventListener("click", () => deleteReminder(event.id)); card.appendChild(remove);
    }
    list.appendChild(card);
  });
}

function changeCalendarMonth(offset) {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + offset, 1);
  renderCalendar();
}

async function saveReminder(event) {
  event.preventDefault();
  const msg = el("reminder-message");
  const title = el("reminder-title").value.trim();
  const date = el("reminder-date").value;
  const description = el("reminder-description").value.trim();
  if (!title || !date) { msg.textContent = "Enter a title and date."; return; }
  msg.textContent = "Saving reminder...";
  const { data, error } = await db.from("student_reminders").insert({ user_id: currentUser.id, title, description: description || null, event_date: date }).select("id,title,description,event_date").single();
  if (error) { console.error("Reminder save failed:", error); msg.textContent = "Could not save. Check that the calendar SQL setup has been completed."; return; }
  personalReminders.push(data);
  calendarSelectedDate = date;
  calendarMonth = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, 1);
  el("reminder-form").reset();
  el("reminder-date").value = localDateString(new Date());
  msg.textContent = "Reminder saved.";
  renderCalendar();
}

async function deleteReminder(id) {
  const { error } = await db.from("student_reminders").delete().eq("id", id).eq("user_id", currentUser.id);
  if (error) { console.error("Reminder delete failed:", error); alert("Could not delete this reminder."); return; }
  personalReminders = personalReminders.filter(item => item.id !== id);
  renderCalendar();
}

// ================= AI TUTOR =================
function addMessage(text, cls) {
  const box = el("chat-messages");
  const d = document.createElement("div");
  d.className = "msg " + cls;
  d.innerText = text;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
  return d;
}

// This is the one place to connect the real AI later.
// It should call your secure backend (for example a Supabase Edge Function),
// never the AI company directly, so the secret API key stays hidden.
async function askAI(question) {
  await new Promise(function (resolve) {
    setTimeout(resolve, 900);
  });
  return (
    "The AI tutor is not connected yet, so this is a sample reply. " +
    "Soon I will be able to help you with: \"" + question + "\""
  );
}

async function sendChat() {
  if (chatBusy) return;
  const input = el("chat-input");
  const question = input.value.trim();
  if (!question) return;

  input.value = "";
  chatBusy = true;
  addMessage(question, "msg-user");
  const typing = addMessage("Thinking...", "msg-ai msg-typing");

  let answer;
  try {
    answer = await askAI(question);
  } catch (e) {
    console.error(e);
    answer = "Sorry, something went wrong. Please try again.";
  }

  typing.remove();
  addMessage(answer, "msg-ai");
  chatBusy = false;
}

function askChip(text) {
  el("chat-input").value = text;
  sendChat();
}

el("chat-input").addEventListener("keydown", function (e) {
  if (e.key === "Enter") sendChat();
});

// ================= PRACTICE =================
function startQuiz() {
  alert("Quizzes are coming soon.");
}

// ================= SETTINGS (saved on this phone) =================
function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem("settings")) || {};
  } catch (e) {
    return {};
  }
}

function saveSettings() {
  try {
    localStorage.setItem("settings", JSON.stringify(settings));
  } catch (e) {}
}

function applySettings() {
  document.body.classList.toggle("dark", !!settings.dark);
  el("set-dark").checked = !!settings.dark;
}

el("set-dark").addEventListener("change", function () {
  settings.dark = this.checked;
  saveSettings();
  applySettings();
});

// ================= PROFILE =================
function fillCourseSelect() {
  const box = el("set-course");
  box.innerHTML = "";
  const none = document.createElement("option");
  none.value = "";
  none.innerText = "Select your main course";
  box.appendChild(none);
  const mine = visibleCourses();
  for (let i = 0; i < mine.length; i++) {
    const o = document.createElement("option");
    o.value = mine[i].code;
    o.innerText = mine[i].name ? mine[i].code + ": " + mine[i].name : mine[i].code;
    box.appendChild(o);
  }
  box.value = settings.course || "";
}

function fillProfile() {
  const meta = userMeta();
  const name = meta.full_name || "Student";
  const main = mainCourse();

  el("profile-name").innerText = name;
  el("profile-email").innerText = currentUser ? currentUser.email : "";
  el("avatar").innerText = initials(meta.full_name);
  el("profile-number").innerText = meta.student_number || "Not added";
  el("profile-course").innerText = main ? main.code : settings.course || "Not selected";
  el("profile-program").innerText = programSummary();

  el("set-name").value = meta.full_name || "";
  el("set-number").value = meta.student_number || "";
  el("set-course").value = settings.course || "";
  el("support-link").href = "mailto:" + SUPPORT_EMAIL;
}

function toggleEditDetails() {
  el("edit-details").hidden = !el("edit-details").hidden;
  el("details-message").innerText = "";
}

function togglePanel(id) {
  el(id).hidden = !el(id).hidden;
}

async function saveDetails() {
  const name = el("set-name").value.trim();
  const number = el("set-number").value.trim();
  const msg = el("details-message");
  if (!name || !number) {
    msg.innerText = "Enter your full name and student number.";
    return;
  }
  msg.innerText = "Saving...";
  const { data, error } = await db.auth.updateUser({
    data: { full_name: name, student_number: number }
  });
  if (error) {
    msg.innerText = error.message;
    return;
  }
  currentUser = data.user;
  settings.course = el("set-course").value;
  saveSettings();
  msg.innerText = "Saved.";
  fillProfile();
  renderHome();
}

async function changePassword() {
  const box = el("new-password");
  const msg = el("password-message");
  if (box.value.length < 6) {
    msg.innerText = "Use at least 6 characters.";
    return;
  }
  msg.innerText = "Updating...";
  const { error } = await db.auth.updateUser({ password: box.value });
  if (error) {
    msg.innerText = error.message;
    return;
  }
  box.value = "";
  msg.innerText = "Password updated.";
}

function openPortal() {
  if (!ZUT_PORTAL_URL) {
    alert("The ZUT portal link has not been set yet.");
    return;
  }
  window.open(ZUT_PORTAL_URL, "_blank", "noopener");
}

// ================= LOGIN / SIGN UP =================
function setAuthMessage(text) {
  el("auth-message").innerText = text;
}

function toggleAuthMode() {
  authMode = authMode === "login" ? "signup" : "login";
  const signup = authMode === "signup";

  el("signup-fields").hidden = !signup;
  el("auth-forgot").hidden = signup;
  el("auth-title").innerText = signup ? "Create Account" : "Welcome Back!";
  el("auth-sub").innerText = signup ? "Create your student account" : "Log in to continue";
  el("auth-submit").innerText = signup ? "Create Account" : "Log In";
  el("auth-switch-btn").innerText = signup ? "Back to Log In" : "Create Account";
  el("auth-password").setAttribute("autocomplete", signup ? "new-password" : "current-password");
  setAuthMessage("");
}

async function submitAuth() {
  const email = el("auth-email").value.trim();
  const password = el("auth-password").value;
  if (!email || !password) {
    setAuthMessage("Enter your email and password.");
    return;
  }

  const btn = el("auth-submit");
  btn.disabled = true;
  setAuthMessage("Please wait...");

  try {
    if (authMode === "signup") {
      const name = el("auth-name").value.trim();
      const number = el("auth-number").value.trim();
      if (!name || !number) {
        setAuthMessage("Enter your full name and student number.");
        return;
      }
      const { data, error } = await db.auth.signUp({
        email: email,
        password: password,
        options: { data: { full_name: name, student_number: number } }
      });
      if (error) {
        setAuthMessage(error.message);
        return;
      }
      if (!data.session) {
        setAuthMessage("Account created. Check your email to confirm, then log in.");
      }
    } else {
      const { error } = await db.auth.signInWithPassword({ email: email, password: password });
      if (error) setAuthMessage(error.message);
    }
  } catch (e) {
    console.error(e);
    setAuthMessage("Something went wrong: " + e.message);
  } finally {
    btn.disabled = false;
  }
}

async function forgotPassword() {
  const email = el("auth-email").value.trim();
  if (!email) {
    setAuthMessage("Type your email above first, then tap Forgot Password.");
    return;
  }
  setAuthMessage("Please wait...");
  const { error } = await db.auth.resetPasswordForEmail(email);
  if (error) {
    setAuthMessage(error.message);
    return;
  }
  setAuthMessage("If that email has an account, a reset link is on its way.");
}

async function logOut() {
  await db.auth.signOut();
}

function showAuthState(session) {
  currentUser = session ? session.user : null;
  el("auth-screen").hidden = !!session;
  el("app").hidden = !session;

  if (session) {
    setAuthMessage("");
    fillProfile();
    renderHome();
    if (loadedFor !== currentUser.id) {
      loadedFor = currentUser.id;
      // small delay avoids a known Supabase issue with data calls inside the login callback
      setTimeout(loadAll, 0);
    }
  } else {
    loadedFor = null;
    papers = [];
    courses = [];
    materials = [];
    officialEvents = [];
    personalReminders = [];
    schools = [];
    programs = [];
    programCourses = [];
    myCodes = [];
    setupShownFor = null;
    el("auth-password").value = "";
    navDepth = 0;
    history.replaceState(null, "");
    renderPage("home");
  }
}

db.auth.onAuthStateChange(function (event, session) {
  showAuthState(session);
  if (event === "PASSWORD_RECOVERY") {
    showTab("profile");
    el("password-panel").hidden = false;
    el("password-message").innerText = "Enter a new password below.";
  }
});

// ================= STUDY SETUP (school, program, year, courses) =================
async function loadStudyData() {
  const s = await db.from("schools").select("*");
  const p = await db.from("programs").select("*");
  const pc = await db.from("program_courses").select("*");
  const sc = currentUser
    ? await db.from("student_courses").select("course_code").eq("user_id", currentUser.id)
    : { data: [], error: null };

  if (s.error || p.error || pc.error) {
    console.error("study setup tables not ready:", s.error || p.error || pc.error);
  }
  schools = s.error ? [] : s.data;
  programs = p.error ? [] : p.data;
  programCourses = pc.error ? [] : pc.data;

  if (sc.error) console.error("student_courses error:", sc.error);
  myCodes = sc.error
    ? []
    : sc.data.map(function (r) {
        return r.course_code;
      });
}

// The courses this student chose. If none were chosen, show everything.
function visibleCourses() {
  if (myCodes.length === 0) return courses;
  return courses.filter(function (c) {
    return myCodes.some(function (code) {
      return sameCode(code, c.code);
    });
  });
}

function programSummary() {
  const meta = userMeta();
  const p = programs.find(function (x) {
    return String(x.id) === String(meta.program_id);
  });
  if (!p) return "Not set up";
  return (p.short_name || p.name) + (meta.study_year ? " · Year " + meta.study_year : "");
}

function toggleLibraryScope() {
  libraryScope = libraryScope === "mine" ? "all" : "mine";
  renderLibrary();
}

function maybeShowSetup() {
  if (!currentUser || setupShownFor === currentUser.id) return;
  setupShownFor = currentUser.id;
  if (!userMeta().setup_done && !settings.setupSkipped && schools.length > 0) openSetup(true);
}

function fillSelect(id, items, placeholder, selected) {
  const box = el(id);
  box.innerHTML = "";
  const first = document.createElement("option");
  first.value = "";
  first.innerText = placeholder;
  box.appendChild(first);
  for (let i = 0; i < items.length; i++) {
    const o = document.createElement("option");
    o.value = String(items[i].value);
    o.innerText = items[i].label;
    box.appendChild(o);
  }
  box.value = selected ? String(selected) : "";
}

function fillSetupPrograms(selected) {
  const sid = el("setup-school").value;
  const list = programs
    .filter(function (p) {
      return String(p.school_id) === sid;
    })
    .map(function (p) {
      return { value: p.id, label: p.name };
    });
  fillSelect("setup-program", list, "Select your program", selected);
}

function fillSetupYears(selected) {
  const pid = el("setup-program").value;
  const p = programs.find(function (x) {
    return String(x.id) === pid;
  });
  const n = p ? p.years || 4 : 0;
  const list = [];
  for (let y = 1; y <= n; y++) list.push({ value: y, label: "Year " + y });
  fillSelect("setup-year", list, "Select your year", selected);
}

// Courses that belong to the chosen program and year (only ones that exist in the courses table)
function defaultCourseCodes() {
  const pid = el("setup-program").value;
  const yr = el("setup-year").value;
  if (!pid || !yr) return [];
  const wanted = programCourses
    .filter(function (pc) {
      return String(pc.program_id) === pid && String(pc.year) === yr;
    })
    .map(function (pc) {
      return pc.course_code;
    });
  return courses
    .filter(function (c) {
      return wanted.some(function (code) {
        return sameCode(code, c.code);
      });
    })
    .map(function (c) {
      return c.code;
    });
}

function setupRow(c) {
  const label = document.createElement("label");
  label.className = "check-row";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = setupSet.has(c.code);
  cb.addEventListener("change", function () {
    if (cb.checked) setupSet.add(c.code);
    else setupSet.delete(c.code);
  });
  const t = document.createElement("span");
  t.innerText = c.name ? c.code + ": " + c.name : c.code;
  label.appendChild(cb);
  label.appendChild(t);
  return label;
}

function fillSetupCourses() {
  const main = el("setup-courses");
  const other = el("setup-other");
  main.innerHTML = "";
  other.innerHTML = "";

  const defaults = defaultCourseCodes();
  const ready = el("setup-program").value && el("setup-year").value;
  if (!ready) {
    main.appendChild(emptyBox("Choose your program and year to see your courses."));
  } else if (defaults.length === 0) {
    main.appendChild(emptyBox("No courses have been added for this program and year yet. Pick yours from the list below."));
  }
  el("setup-other-box").open = !!ready && defaults.length === 0;

  for (let i = 0; i < courses.length; i++) {
    const isDefault = defaults.indexOf(courses[i].code) !== -1;
    (isDefault ? main : other).appendChild(setupRow(courses[i]));
  }
}

function onSetupSchool() {
  fillSetupPrograms("");
  fillSetupYears("");
  setupSet = new Set();
  fillSetupCourses();
}

function onSetupProgram() {
  fillSetupYears("");
  setupSet = new Set();
  fillSetupCourses();
}

function onSetupYear() {
  setupSet = new Set(defaultCourseCodes());
  fillSetupCourses();
}

function openSetup(first) {
  if (schools.length === 0) {
    alert("The course list for your school has not been set up yet.");
    return;
  }
  const meta = userMeta();
  setupSet = new Set(first ? [] : myCodes);
  const options = schools.map(function (s) {
    return { value: s.id, label: s.name };
  });
  const pickedSchool = first ? (schools.length === 1 ? schools[0].id : "") : meta.school_id;
  fillSelect("setup-school", options, "Select your school", pickedSchool);
  fillSetupPrograms(first ? "" : meta.program_id);
  fillSetupYears(first ? "" : meta.study_year);
  fillSetupCourses();
  el("setup-message").innerText = "";
  el("skip-setup-btn").hidden = !first;
  showTab("setup");
}

async function saveSetup() {
  const msg = el("setup-message");
  const sid = el("setup-school").value;
  const pid = el("setup-program").value;
  const yr = el("setup-year").value;
  if (!sid || !pid || !yr) {
    msg.innerText = "Choose your school, program and year.";
    return;
  }
  const codes = Array.from(setupSet);
  if (codes.length === 0) {
    msg.innerText = "Tick at least one course.";
    return;
  }

  msg.innerText = "Saving...";
  const upd = await db.auth.updateUser({
    data: { school_id: Number(sid), program_id: Number(pid), study_year: Number(yr), setup_done: true }
  });
  if (upd.error) {
    msg.innerText = upd.error.message;
    return;
  }
  currentUser = upd.data.user;

  const del = await db.from("student_courses").delete().eq("user_id", currentUser.id);
  if (del.error) {
    msg.innerText = "Could not save your courses: " + del.error.message;
    return;
  }
  const rows = codes.map(function (code) {
    return { user_id: currentUser.id, course_code: code };
  });
  const ins = await db.from("student_courses").insert(rows);
  if (ins.error) {
    msg.innerText = "Could not save your courses: " + ins.error.message;
    return;
  }

  myCodes = codes;
  if (!codes.some(function (code) { return sameCode(code, settings.course); })) {
    settings.course = codes[0];
  }
  settings.setupSkipped = false;
  saveSettings();
  renderAll();
  showTab("home");
}

function skipSetup() {
  settings.setupSkipped = true;
  saveSettings();
  showTab("home");
}

// ================= START =================
history.replaceState(null, "");
applySettings();
db.auth.getSession().then(function (result) {
  showAuthState(result.data.session);
});