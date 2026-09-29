/* committee-details.js — summary, members and cycle history for one committee. */

let committeeId = new URLSearchParams(window.location.search).get("id");
let committee = null;

 document.addEventListener("DOMContentLoaded", loadCommitteeDetails);

async function loadCommitteeDetails() {
  const root = document.getElementById("committee-details");
  showLoading(root, 7);

  if (!committeeId) {
    showError(root, "No committee was selected.", () => window.location.href = "committees.html");
    return;
  }

  const [committeeResult, membersResult, cyclesResult, contributionsResult] = await Promise.all([
    getCommittee(committeeId),
    getMembers(committeeId),
    getCycles(committeeId),
    getContributions(committeeId),
  ]);

  if (!committeeResult.success) {
    showError(root, committeeResult.message, () => window.location.href = "committees.html");
    return;
  }

  committee = committeeResult.data;
  renderDetails(membersResult.success ? membersResult.data : [], cyclesResult.success ? cyclesResult.data : [], contributionsResult.success ? contributionsResult.data : []);
}

function renderDetails(members, cycles, contributions) {
  const root = document.getElementById("committee-details");
  const completed = cycles.filter(c => c.status === "COMPLETED").length;
  const pendingPayments = contributions.filter(c => ["PENDING_VERIFICATION", "SUBMITTED"].includes(c.status)).length;
  const paidAmount = contributions.reduce((sum, c) => sum + Number(c.amountPaid || 0), 0);

  root.innerHTML = `
    <div class="page-header">
      <div>
        <a class="back-link" href="committees.html">← Back to committees</a>
        <h1>${escapeHtml(committee.name)}</h1>
        <p>${escapeHtml(committee.description || "Committee details and operating history.")}</p>
      </div>
      <div class="page-header__actions">
        ${statusBadge(committee.status)}
      </div>
    </div>

    <section class="stat-grid">
      <div class="card stat"><div class="stat__label">Committee value</div><div class="stat__value">${formatCurrency(committee.committeeValue)}</div><div class="stat__sub">${committee.totalMembers} members × ${formatCurrency(committee.baseContribution)}</div></div>
      <div class="card stat"><div class="stat__label">Current cycle</div><div class="stat__value">${committee.currentCycle} / ${committee.durationCycles}</div><div class="progress"><div class="progress__bar" style="width:${calculateCycleProgress(committee.currentCycle, committee.durationCycles)}%"></div></div></div>
      <div class="card stat"><div class="stat__label">Members</div><div class="stat__value">${members.length}</div><div class="stat__sub">${members.filter(m => m.membership?.status === "ACTIVE").length} active</div></div>
      <div class="card stat"><div class="stat__label">Recorded payments</div><div class="stat__value">${formatCurrency(paidAmount)}</div><div class="stat__sub">${pendingPayments} awaiting verification</div></div>
    </section>

    <section class="committee-rule-grid">
      <div class="card card__body">
        <h2>Committee rules</h2>
        <div class="detail-list">
          <div><span>Start date</span><strong>${formatDate(committee.startDate)}</strong></div>
          <div><span>Duration</span><strong>${committee.durationCycles} cycles</strong></div>
          <div><span>Payment deadline</span><strong>${committee.paymentDeadlineDay}th of each month</strong></div>
          <div><span>Auction frequency</span><strong>${escapeHtml(committee.auctionFrequency)}</strong></div>
          <div><span>First cycle</span><strong>Organizer allocation</strong></div>
          <div><span>Discount rule</span><strong>${committee.discountRule === "EQUAL_DISTRIBUTION" ? "Equal distribution" : escapeHtml(committee.discountRule)}</strong></div>
        </div>
      </div>
      <div class="card card__body">
        <h2>Cycle 2 example</h2>
        <p class="muted">The current seed data demonstrates the committee's auction rule.</p>
        ${renderCurrentAuctionExample(cycles)}
      </div>
    </section>

    <section class="card committee-section">
      <div class="card__header"><div><h2>Members</h2><p class="muted">Membership records stay attached to historical financial activity.</p></div><button class="btn btn--primary btn--sm" id="add-member-btn">+ Add member</button></div>
      <div id="members-table"></div>
    </section>

    <section class="card committee-section">
      <div class="card__header"><div><h2>Cycles</h2><p class="muted">Each cycle records its recipient, bid, discount and adjusted contribution.</p></div></div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Cycle</th><th>Type</th><th>Due date</th><th>Recipient</th><th>Winning bid</th><th>Discount</th><th>Adjusted contribution</th><th>Status</th></tr></thead>
          <tbody>${cycles.map(c => renderCycleRow(c, members)).join("")}</tbody>
        </table>
      </div>
    </section>`;

  renderMembers(members);
  document.getElementById("add-member-btn")?.addEventListener("click", () => openAddMemberModal(members));
}

function renderCurrentAuctionExample(cycles) {
  const c = cycles.find(x => x.number === 2);
  if (!c || !c.winningBid) return `<div class="note">No auction result recorded for the current cycle yet.</div>`;
  return `<div class="auction-example">
    <div><span>Committee value</span><strong>${formatCurrency(committee.committeeValue)}</strong></div>
    <div><span>Winning bid</span><strong>${formatCurrency(c.winningBid)}</strong></div>
    <div><span>Discount</span><strong>${formatCurrency(c.discount)}</strong></div>
    <div><span>Discount / member</span><strong>${formatCurrency(c.discountPerMember)}</strong></div>
    <div class="auction-example__highlight"><span>Adjusted contribution</span><strong>${formatCurrency(c.adjustedContribution)}</strong></div>
  </div>`;
}

function renderMembers(members) {
  const root = document.getElementById("members-table");
  if (!members.length) {
    showEmpty(root, { title: "No members yet", message: "Add the first member to this committee." });
    return;
  }
  root.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>Member</th><th>Email</th><th>Membership ID</th><th>Joined</th><th>Status</th></tr></thead><tbody>${members.map(m => `
    <tr>
      <td><div class="table__person"><span class="avatar">${escapeHtml(getInitials(m.name))}</span><div><strong>${escapeHtml(m.name)}</strong>${m.isOrganizer ? '<div class="committee-description">Organizer</div>' : ''}</div></div></td>
      <td>${escapeHtml(m.email)}</td>
      <td>${escapeHtml(m.membership?.membershipId || "—")}</td>
      <td>${formatDate(m.membership?.joinedAt)}</td>
      <td>${statusBadge(m.membership?.status || "INACTIVE")}</td>
    </tr>`).join("")}</tbody></table></div>`;
}

function renderCycleRow(cycle, members) {
  const recipient = members.find(m => m.id === cycle.recipientId);
  return `<tr>
    <td><strong>${cycle.number}</strong></td>
    <td>${cycle.type === "AUCTION" ? "Auction" : "Organizer allocation"}</td>
    <td>${formatDate(cycle.dueDate)}</td>
    <td>${escapeHtml(recipient?.name || "—")}</td>
    <td>${cycle.winningBid ? formatCurrency(cycle.winningBid) : "—"}</td>
    <td>${cycle.discount ? formatCurrency(cycle.discount) : "—"}</td>
    <td>${formatCurrency(cycle.adjustedContribution)}</td>
    <td>${statusBadge(cycle.status)}</td>
  </tr>`;
}

function openAddMemberModal(members) {
  const content = `<form id="add-member-form" novalidate>
    <div id="member-form-message" class="form-message" hidden></div>
    <div class="form-grid">
      <div class="field field--full"><label for="member-name">Full name</label><input class="input" id="member-name" name="name" required></div>
      <div class="field"><label for="member-email">Email</label><input class="input" id="member-email" name="email" type="email" required></div>
      <div class="field"><label for="member-phone">Phone</label><input class="input" id="member-phone" name="phone" placeholder="+91 ..."></div>
    </div>
    <div class="note">The member will be added with an ACTIVE membership record. Their membership history will remain available for future status changes.</div>
  </form>`;

  openModal({
    title: "Add member",
    contentHtml: content,
    actions: [
      { label: "Cancel", variant: "secondary" },
      { label: "Add member", variant: "primary", onClick: async close => {
        const form = document.getElementById("add-member-form");
        const message = document.getElementById("member-form-message");
        const data = Object.fromEntries(new FormData(form).entries());
        data.committeeId = committeeId;
        if (!data.name.trim() || !data.email.trim()) {
          message.hidden = false; message.textContent = "Name and email are required."; return;
        }
        const result = await addMember(data);
        if (!result.success) { message.hidden = false; message.textContent = result.message; return; }
        close();
        showToast(`${data.name} was added to the committee.`, "success");
        await loadCommitteeDetails();
      } },
    ],
  });
}
