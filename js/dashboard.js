/* dashboard.js — Phase 1 "shell check" dashboards. They prove the whole chain works:
   page → api.js → mock-data → utils.js formatting → DOM.
   Phase 2 replaces the organizer view with the full dashboard. */

document.addEventListener("DOMContentLoaded", initDashboardPage);

async function initDashboardPage() {
  const content = document.getElementById("page-content");
  const user = getCurrentUser();
  if (!content || !user) return;

  showLoading(content);
  const committees = await getCommittees();
  if (!committees.success || !committees.data.length) {
    showEmpty(content, { title: "No committees yet", message: "Create your first committee to get started." });
    return;
  }
  const committee = committees.data[0];
  const [membersRes, contributionsRes] = await Promise.all([getMembers(committee.id), getContributions(committee.id)]);
  if (!membersRes.success || !contributionsRes.success) {
    showError(content, membersRes.message || contributionsRes.message, initDashboardPage);
    return;
  }

  if (user.role === "organizer") renderOrganizerShell(content, committee, membersRes.data, contributionsRes.data);
  else renderMemberShell(content, committee, contributionsRes.data, user);

  // Progress bar widths are applied through the DOM (element.style), not inline HTML styles.
  content.querySelectorAll("[data-progress]").forEach(bar => { bar.style.width = bar.dataset.progress + "%"; });
}

function renderOrganizerShell(content, committee, members, contributions) {
  const name = (id) => members.find(m => m.id === id)?.name || "Unknown member";
  const awaiting = contributions.filter(c => c.status === "PENDING_VERIFICATION" || c.status === "SUBMITTED");
  const awaitingTotal = awaiting.reduce((sum, c) => sum + c.amountPaid, 0);
  const progress = calculateCycleProgress(committee.currentCycle, committee.durationCycles);

  content.innerHTML = `
    <div class="page-header">
      <div><h1>${escapeHtml(committee.name)}</h1><p>Phase 1 preview. The full organizer dashboard arrives in Phase 2.</p></div>
    </div>
    <div class="stat-grid">
      <div class="card stat"><div class="stat__label">Committee value</div><div class="stat__value">${formatCurrency(committee.committeeValue)}</div>
        <div class="stat__sub">${committee.totalMembers} members × ${formatCurrency(committee.baseContribution)}</div></div>
      <div class="card stat"><div class="stat__label">Current cycle</div><div class="stat__value">${committee.currentCycle} / ${committee.durationCycles}</div>
        <div class="progress"><div class="progress__bar" data-progress="${progress}"></div></div></div>
      <div class="card stat"><div class="stat__label">Awaiting verification</div><div class="stat__value">${formatCurrency(awaitingTotal)}</div>
        <div class="stat__sub">${awaiting.length} payments</div></div>
      <div class="card stat"><div class="stat__label">Members</div><div class="stat__value">${members.length}</div>
        <div class="stat__sub">${members.filter(m => m.membership.status === "ACTIVE").length} active</div></div>
    </div>
    <div class="card">
      <div class="card__header"><h2>Payments awaiting verification</h2></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Member</th><th>Cycle</th><th>Method</th><th class="num">Amount</th><th>Submitted</th><th>Status</th></tr></thead>
        <tbody>${awaiting.map(c => `<tr>
          <td>${escapeHtml(name(c.memberId))}</td><td>${c.cycleNumber}</td><td>${escapeHtml(c.method)}</td>
          <td class="num">${formatCurrency(c.amountPaid)}</td><td>${formatDateTime(c.submittedAt)}</td><td>${statusBadge(c.status)}</td></tr>`).join("")}
        </tbody></table></div>
    </div>`;
}

function renderMemberShell(content, committee, contributions, user) {
  const mine = contributions.filter(c => c.memberId === user.memberId).sort((a, b) => b.cycleNumber - a.cycleNumber);
  const verifiedTotal = mine.filter(c => c.status === "VERIFIED").reduce((sum, c) => sum + c.amountPaid, 0);
  const current = mine.find(c => c.cycleNumber === committee.currentCycle);

  content.innerHTML = `
    <div class="page-header">
      <div><h1>Hello, ${escapeHtml(user.name.split(" ")[0])}</h1><p>${escapeHtml(committee.name)}. Phase 1 preview.</p></div>
    </div>
    <div class="stat-grid">
      <div class="card stat"><div class="stat__label">Current contribution</div><div class="stat__value">${formatCurrency(current?.amountDue)}</div>
        <div class="stat__sub">Cycle ${committee.currentCycle}</div></div>
      <div class="card stat"><div class="stat__label">Payment status</div><div class="stat__value stat__value--badge">${current ? statusBadge(getPaymentStatus(current)) : "—"}</div></div>
      <div class="card stat"><div class="stat__label">Total contributed</div><div class="stat__value">${formatCurrency(verifiedTotal)}</div>
        <div class="stat__sub">Verified payments only</div></div>
      <div class="card stat"><div class="stat__label">Cycle</div><div class="stat__value">${committee.currentCycle} / ${committee.durationCycles}</div></div>
    </div>
    <div class="card">
      <div class="card__header"><h2>My contributions</h2></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Cycle</th><th class="num">Base</th><th class="num">Discount</th><th class="num">Due</th><th>Payment ID</th><th>Status</th></tr></thead>
        <tbody>${mine.map(c => `<tr>
          <td>${c.cycleNumber}</td><td class="num">${formatCurrency(c.baseAmount)}</td><td class="num">${formatCurrency(c.discount)}</td>
          <td class="num">${formatCurrency(c.amountDue)}</td><td>${escapeHtml(c.paymentRef || "—")}</td><td>${statusBadge(getPaymentStatus(c))}</td></tr>`).join("")}
        </tbody></table></div>
    </div>`;
}
