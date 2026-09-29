/* app.js — builds the shared page shell (sidebar + topbar) on every protected page and starts the login page.
   Each page's HTML has: <body data-page="dashboard" data-role="organizer" data-title="Dashboard">
     - data-role  : which role may open the page ("organizer", "member" or "any")
     - data-page  : which sidebar item to highlight
     - data-title : text shown in the topbar */

const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  card: '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  bids: '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>',
  payout: '<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>',
  repeat: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  alert: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

// Sidebar structure per role. `group` becomes the small heading above a set of links.
const NAV = {
  organizer: [
    { group: "Overview", items: [
      { key: "dashboard", label: "Dashboard", href: "organizer-dashboard.html", icon: "grid" },
      { key: "committees", label: "Committees", href: "committees.html", icon: "layers" },
      { key: "members", label: "Members", href: "members.html", icon: "users" } ] },
    { group: "Money", items: [
      { key: "contributions", label: "Contributions", href: "contributions.html", icon: "card" },
      { key: "auctions", label: "Auctions", href: "auctions.html", icon: "bids" },
      { key: "payouts", label: "Payouts", href: "payouts.html", icon: "payout" },
      { key: "transactions", label: "Transactions", href: "transactions.html", icon: "repeat" } ] },
    { group: "Oversight", items: [
      { key: "disputes", label: "Disputes", href: "disputes.html", icon: "alert" },
      { key: "reports", label: "Reports", href: "reports.html", icon: "chart" },
      { key: "audit", label: "Audit log", href: "audit-log.html", icon: "file" } ] },
    { group: "Account", items: [
      { key: "notifications", label: "Notifications", href: "notifications.html", icon: "bell" },
      { key: "settings", label: "Settings", href: "settings.html", icon: "settings" },
      { key: "profile", label: "Profile", href: "profile.html", icon: "user" } ] },
  ],
  member: [
    { group: "My committee", items: [
      { key: "dashboard", label: "Dashboard", href: "member-dashboard.html", icon: "grid" },
      { key: "committee", label: "My committee", href: "member-committee.html", icon: "layers" },
      { key: "payments", label: "My contributions", href: "member-payments.html", icon: "card" },
      { key: "auctions", label: "Auctions", href: "member-auctions.html", icon: "bids" },
      { key: "payouts", label: "My payouts", href: "member-payouts.html", icon: "payout" },
      { key: "disputes", label: "Disputes", href: "member-disputes.html", icon: "alert" } ] },
    { group: "Account", items: [
      { key: "notifications", label: "Notifications", href: "notifications.html", icon: "bell" },
      { key: "settings", label: "Settings", href: "settings.html", icon: "settings" },
      { key: "profile", label: "Profile", href: "profile.html", icon: "user" } ] },
  ],
};

// Pages currently implemented. Links to remaining phases show a toast until those screens are built.
const BUILT_PAGES = ["login.html", "organizer-dashboard.html", "member-dashboard.html", "committees.html", "committee-details.html"];

document.addEventListener("DOMContentLoaded", initApp);

function initApp() {
  const page = document.body.dataset.page;
  if (page === "login") { initLoginPage(); return; }

  const role = document.body.dataset.role || "any";
  if (!requireRole(role)) return;

  const user = getCurrentUser();
  renderSidebar(user, page);
  renderTopbar(user);
  bindShellEvents();
  loadNotificationCount();
}

function renderSidebar(user, activeKey) {
  const groups = NAV[user.role].map(g => `
    <div class="sidebar__group-label">${escapeHtml(g.group)}</div>
    ${g.items.map(item => `
      <a class="nav-link ${item.key === activeKey ? "is-active" : ""}" href="${item.href}" title="${escapeHtml(item.label)}"
         ${item.key === activeKey ? 'aria-current="page"' : ""}>
        ${icon(item.icon)}<span>${escapeHtml(item.label)}</span>
      </a>`).join("")}`).join("");

  document.getElementById("sidebar").innerHTML = `
    <div class="sidebar__brand"><img src="../assets/images/logo.svg" alt=""><span>ChitFlow</span></div>
    <nav aria-label="Main">${groups}</nav>
    <div class="sidebar__footer">
      <button class="nav-link" type="button" data-action="logout" title="Log out">${icon("logout")}<span>Log out</span></button>
    </div>`;
}

function renderTopbar(user) {
  document.getElementById("topbar").innerHTML = `
    <button class="topbar__icon-btn topbar__menu" type="button" data-action="toggle-menu" aria-label="Open menu">${icon("menu")}</button>
    <div class="topbar__title">${escapeHtml(document.body.dataset.title || "ChitFlow")}</div>
    <div class="topbar__spacer"></div>
    <a class="topbar__icon-btn" href="notifications.html" aria-label="Notifications">${icon("bell")}<span class="topbar__count hidden" id="notif-count">0</span></a>
    <div class="topbar__user">
      <span class="avatar">${escapeHtml(getInitials(user.name))}</span>
      <div class="topbar__user-meta">
        <div class="topbar__user-name">${escapeHtml(user.name)}</div>
        <div class="topbar__user-role">${user.role === "organizer" ? "Organizer" : "Member"}</div>
      </div>
    </div>`;
}

// One click listener for the whole page ("event delegation") instead of one per button.
function bindShellEvents() {
  const sidebar = document.getElementById("sidebar");
  let backdrop = null;
  const closeMenu = () => { sidebar.classList.remove("is-open"); if (backdrop) { backdrop.remove(); backdrop = null; } };

  document.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (actionEl) {
      if (actionEl.dataset.action === "logout") logout();
      if (actionEl.dataset.action === "toggle-menu") {
        sidebar.classList.add("is-open");
        backdrop = document.createElement("div");
        backdrop.className = "sidebar-backdrop";
        backdrop.addEventListener("click", closeMenu);
        document.body.appendChild(backdrop);
      }
      return;
    }
    const link = event.target.closest("a.nav-link");
    if (link && !BUILT_PAGES.includes(link.getAttribute("href"))) {
      event.preventDefault();
      showToast("This page is built in a later phase.", "warning");
    }
  });
}

async function loadNotificationCount() {
  const badge = document.getElementById("notif-count");
  const result = await getNotifications();
  if (!result.success || !badge) return;
  const unread = result.data.filter(n => !n.read).length;
  if (unread > 0) { badge.textContent = unread; badge.classList.remove("hidden"); }
}
