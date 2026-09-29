/* contributions.js — organizer payment register and verification workflow. */

let organizerContributions = [];
let organizerMembers = [];
let organizerCommittee = null;

document.addEventListener("DOMContentLoaded", initContributionsPage);

async function initContributionsPage() {
  const root = document.getElementById("contributions-page");
  if (!root) return;

  showLoading(root, 6);

  const committees = await getCommittees();
  if (!committees.success || !committees.data.length) {
    showError(root, committees.message || "No committee found.", initContributionsPage);
    return;
  }

  organizerCommittee = committees.data[0];

  const [members, contributions] = await Promise.all([
    getMembers(organizerCommittee.id),
    getContributions(organizerCommittee.id),
  ]);

  if (!members.success || !contributions.success) {
    showError(root, members.message || contributions.message || "Could not load contributions.", initContributionsPage);
    return;
  }

  organizerMembers = members.data;
  organizerContributions = contributions.data;
  renderOrganizerPage();
}

function memberName(id) {
  return organizerMembers.find(m => m.id === id)?.name || "Unknown member";
}

function renderOrganizerPage() {
  const root = document.getElementById("contributions-page");
  const pending = organizerContributions.filter(c => ["PENDING_VERIFICATION", "SUBMITTED"].includes(c.status));
  const verified = organizerContributions.filter(c => c.status === "VERIFIED");
  const disputed = organizerContributions.filter(c => c.status === "DISPUTED");
  const pendingAmount = pending.reduce((s, c) => s + Number(c.amountPaid || 0), 0);

  root.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Contributions & Payment Verification</h1>
        <p>${escapeHtml(organizerCommittee.name)} · Review submitted payments and keep a permanent payment trail.</p>
      </div>
    </div>

    <section class="stat-grid">
      <div class="card stat">
        <div class="stat__label">Awaiting verification</div>
        <div class="stat__value">${pending.length}</div>
        <div class="stat__sub">${formatCurrency(pendingAmount)} submitted</div>
      </div>
      <div class="card stat">
        <div class="stat__label">Verified payments</div>
        <div class="stat__value">${verified.length}</div>
        <div class="stat__sub">${formatCurrency(verified.reduce((s, c) => s + Number(c.amountPaid || 0), 0))}</div>
      </div>
      <div class="card stat">
        <div class="stat__label">Rejected</div>
        <div class="stat__value">${organizerContributions.filter(c => c.status === "REJECTED").length}</div>
        <div class="stat__sub">Can be resubmitted</div>
      </div>
      <div class="card stat">
        <div class="stat__label">Disputed</div>
        <div class="stat__value">${disputed.length}</div>
        <div class="stat__sub">Needs dispute workflow</div>
      </div>
    </section>

    <section class="card">
      <div class="table-toolbar">
        <input class="input table-toolbar__search" id="payment-search" type="search"
               placeholder="Search member or payment reference..." aria-label="Search payments">
        <select class="select" id="payment-status" aria-label="Filter by payment status">
          <option value="ALL">All statuses</option>
          <option value="PENDING_VERIFICATION">Pending verification</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="VERIFIED">Verified</option>
          <option value="REJECTED">Rejected</option>
          <option value="DISPUTED">Disputed</option>
          <option value="UNPAID">Not paid yet</option>
          <option value="OVERDUE">Overdue</option>
        </select>
        <select class="select" id="payment-cycle" aria-label="Filter by cycle">
          <option value="ALL">All cycles</option>
          ${[...new Set(organizerContributions.map(c => c.cycleNumber))].sort((a,b) => a-b)
            .map(n => `<option value="${n}">Cycle ${n}</option>`).join("")}
        </select>
      </div>
      <div id="payment-register"></div>
    </section>
  `;

  document.getElementById("payment-search").addEventListener("input", renderPaymentRegister);
  document.getElementById("payment-status").addEventListener("change", renderPaymentRegister);
  document.getElementById("payment-cycle").addEventListener("change", renderPaymentRegister);
  renderPaymentRegister();
}

function renderPaymentRegister() {
  const query = String(document.getElementById("payment-search")?.value || "").trim().toLowerCase();
  const status = document.getElementById("payment-status")?.value || "ALL";
  const cycle = document.getElementById("payment-cycle")?.value || "ALL";

  let rows = organizerContributions.filter(c => {
    const effectiveStatus = getPaymentStatus(c);
    const searchable = `${memberName(c.memberId)} ${c.paymentRef || ""} ${c.txnRef || ""}`.toLowerCase();
    return (!query || searchable.includes(query))
      && (status === "ALL" || effectiveStatus === status)
      && (cycle === "ALL" || String(c.cycleNumber) === cycle);
  });

  rows.sort((a, b) => b.cycleNumber - a.cycleNumber || String(a.paymentRef || "").localeCompare(String(b.paymentRef || "")));
  const root = document.getElementById("payment-register");

  if (!rows.length) {
    showEmpty(root, { title: "No payments found", message: "Try another search or filter." });
    return;
  }

  root.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Member</th><th>Cycle</th><th>Method</th><th class="num">Amount</th>
            <th>Payment reference</th><th>Status</th><th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(c => `
            <tr>
              <td><div class="table__person"><span class="avatar">${escapeHtml(getInitials(memberName(c.memberId)))}</span><strong>${escapeHtml(memberName(c.memberId))}</strong></div></td>
              <td>${c.cycleNumber}</td>
              <td>${escapeHtml(c.method || "—")}</td>
              <td class="num">${formatCurrency(c.amountPaid || c.amountDue)}</td>
              <td>${escapeHtml(c.paymentRef || "—")}</td>
              <td>${statusBadge(getPaymentStatus(c))}</td>
              <td><button class="btn btn--secondary btn--sm" data-view-payment="${escapeHtml(c.id)}">View</button></td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;

  root.querySelectorAll("[data-view-payment]").forEach(btn => {
    btn.addEventListener("click", () => openOrganizerPayment(btn.dataset.viewPayment));
  });
}

async function openOrganizerPayment(contributionId) {
  const row = organizerContributions.find(c => c.id === contributionId);
  if (!row) return;

  const evidenceResult = row.paymentRef ? await getEvidence(row.paymentRef) : { success: true, data: [] };
  const evidence = evidenceResult.success ? evidenceResult.data : [];

  const actions = [];
  if (row.method === "Cash" && row.cashStage === "MEMBER_SUBMITTED") {
    actions.push({
      label: "Acknowledge cash",
      variant: "secondary",
      onClick: async close => {
        const result = await acknowledgeCashPayment(row.paymentRef);
        if (!result.success) { showToast(result.message, "error"); return; }
        close();
        showToast("Cash receipt acknowledged. It can now be verified.", "success");
        await refreshOrganizerData();
      }
    });
  }
  if (["PENDING_VERIFICATION", "SUBMITTED"].includes(row.status) ||
      (row.status === "PENDING_VERIFICATION" && row.method === "Cash")) {
    actions.push({
      label: "Verify payment",
      variant: "primary",
      onClick: async close => {
        const result = await verifyPayment(row.paymentRef);
        if (!result.success) { showToast(result.message, "error"); return; }
        close();
        showToast(`${row.paymentRef} verified successfully.`, "success");
        await refreshOrganizerData();
      }
    });
    actions.push({
      label: "Reject",
      variant: "danger",
      onClick: async close => {
        close();
        openRejectPayment(row);
      }
    });
  }

  const history = [...(row.history || [])].reverse();
  openModal({
    title: row.paymentRef || `Cycle ${row.cycleNumber} contribution`,
    contentHtml: `
      <div class="payment-detail-grid">
        <div><span>Member</span><strong>${escapeHtml(memberName(row.memberId))}</strong></div>
        <div><span>Cycle</span><strong>${row.cycleNumber}</strong></div>
        <div><span>Amount due</span><strong>${formatCurrency(row.amountDue)}</strong></div>
        <div><span>Amount paid</span><strong>${formatCurrency(row.amountPaid || 0)}</strong></div>
        <div><span>Method</span><strong>${escapeHtml(row.method || "—")}</strong></div>
        <div><span>Payment date</span><strong>${formatDate(row.paymentDate)}</strong></div>
        <div><span>Transaction reference</span><strong>${escapeHtml(row.txnRef || "—")}</strong></div>
        <div><span>Status</span><strong>${statusBadge(getPaymentStatus(row))}</strong></div>
      </div>
      ${row.rejectionReason ? `<div class="note note--warning"><strong>Rejection reason:</strong> ${escapeHtml(row.rejectionReason)}</div>` : ""}
      ${row.method === "Cash" ? `<div class="note"><strong>Cash stage:</strong> ${escapeHtml(row.cashStage || "Not acknowledged")}. Software cannot independently prove cash; organizer acknowledgement is the recorded evidence.</div>` : ""}
      <div class="detail-block">
        <h3>Payment evidence</h3>
        ${evidence.length ? `<ul class="evidence-list">${evidence.map(e => `<li><strong>${escapeHtml(e.fileName)}</strong><span>Mock file record · uploaded ${formatDateTime(e.uploadedAt)}</span></li>`).join("")}</ul>` : `<p class="muted">No evidence file attached.</p>`}
      </div>
      <div class="detail-block">
        <h3>History</h3>
        ${history.length ? `<ol class="history-list">${history.map(h => `<li><strong>${escapeHtml(h.action)}</strong><span>${escapeHtml(h.note || "")}</span><small>${escapeHtml(h.by || "System")} · ${formatDateTime(h.at)}</small></li>`).join("")}</ol>` : `<p class="muted">No history recorded.</p>`}
      </div>
    `,
    actions
  });
}

function openRejectPayment(row) {
  openModal({
    title: "Reject payment",
    contentHtml: `
      <form id="reject-payment-form" novalidate>
        <p class="muted">A rejection must have a reason so the member knows what to correct before resubmitting.</p>
        <div class="field">
          <label for="reject-reason">Reason</label>
          <textarea class="textarea" id="reject-reason" placeholder="Example: Transaction reference does not match the bank record." required></textarea>
          <div class="field__error" id="reject-error"></div>
        </div>
      </form>
    `,
    actions: [
      { label: "Cancel", variant: "secondary" },
      {
        label: "Reject payment", variant: "danger",
        onClick: async close => {
          const reason = document.getElementById("reject-reason")?.value.trim();
          const error = document.getElementById("reject-error");
          if (!reason) { error.textContent = "Reason is required."; return; }

          const result = await rejectPayment(row.paymentRef, reason);
          if (!result.success) { error.textContent = result.message; return; }

          close();
          showToast(`${row.paymentRef} was rejected.`, "warning");
          await refreshOrganizerData();
        }
      }
    ]
  });
}

async function refreshOrganizerData() {
  const result = await getContributions(organizerCommittee.id);
  if (result.success) {
    organizerContributions = result.data;
    renderOrganizerPage();
  } else {
    showToast(result.message, "error");
  }
}
