/* member-payments.js — member contribution history and payment submission. */

let memberCommittee = null;
let memberRows = [];
let memberUser = null;

document.addEventListener("DOMContentLoaded", initMemberPaymentsPage);

async function initMemberPaymentsPage() {
  const root = document.getElementById("member-payments-page");
  memberUser = getCurrentUser();
  if (!root || !memberUser) return;

  showLoading(root, 5);

  const committees = await getCommittees();
  if (!committees.success || !committees.data.length) {
    showError(root, committees.message || "No committee found.", initMemberPaymentsPage);
    return;
  }

  // The current frontend demo has one committee. We still resolve the member through
  // its membership record rather than hard-coding a member name.
  for (const committee of committees.data) {
    const members = await getMembers(committee.id);
    if (members.success && members.data.some(m => m.id === memberUser.memberId)) {
      memberCommittee = committee;
      break;
    }
  }

  if (!memberCommittee) {
    showError(root, "Your membership could not be found in a committee.", initMemberPaymentsPage);
    return;
  }

  const contributions = await getContributions(memberCommittee.id);
  if (!contributions.success) {
    showError(root, contributions.message, initMemberPaymentsPage);
    return;
  }

  memberRows = contributions.data
    .filter(c => c.memberId === memberUser.memberId)
    .sort((a, b) => b.cycleNumber - a.cycleNumber);

  renderMemberPayments();
}

function renderMemberPayments() {
  const root = document.getElementById("member-payments-page");
  const verified = memberRows.filter(c => c.status === "VERIFIED");
  const open = memberRows.filter(c => ["PENDING_VERIFICATION", "SUBMITTED", "DISPUTED"].includes(c.status));
  const current = memberRows.find(c => c.cycleNumber === memberCommittee.currentCycle);
  const payable = memberRows.filter(c => ["UNPAID", "REJECTED"].includes(getPaymentStatus(c)));

  root.innerHTML = `
    <div class="page-header">
      <div>
        <h1>My Contributions</h1>
        <p>${escapeHtml(memberCommittee.name)} · Submit payments and keep your payment history in one place.</p>
      </div>
      <div class="page-header__actions">
        ${payable.length ? `<button class="btn btn--primary" id="submit-payment-btn">+ Submit payment</button>` : ""}
      </div>
    </div>

    <section class="stat-grid">
      <div class="card stat">
        <div class="stat__label">Current cycle</div>
        <div class="stat__value">${current ? formatCurrency(current.amountDue) : "—"}</div>
        <div class="stat__sub">${current ? statusBadge(getPaymentStatus(current)) : "No current contribution"}</div>
      </div>
      <div class="card stat">
        <div class="stat__label">Verified total</div>
        <div class="stat__value">${formatCurrency(verified.reduce((s, c) => s + Number(c.amountPaid || 0), 0))}</div>
        <div class="stat__sub">${verified.length} verified payments</div>
      </div>
      <div class="card stat">
        <div class="stat__label">Awaiting review</div>
        <div class="stat__value">${open.length}</div>
        <div class="stat__sub">Submitted or under review</div>
      </div>
      <div class="card stat">
        <div class="stat__label">Action needed</div>
        <div class="stat__value">${payable.length}</div>
        <div class="stat__sub">${payable.length ? "Contribution can be submitted" : "Nothing to submit"}</div>
      </div>
    </section>

    <section class="card">
      <div class="card__header">
        <div><h2>Contribution history</h2><p class="muted">Financial records remain in history; they are not deleted.</p></div>
      </div>
      <div id="member-contribution-table"></div>
    </section>
  `;

  if (payable.length) {
    document.getElementById("submit-payment-btn").addEventListener("click", () => openSubmitPayment(payable[0]));
  }
  renderMemberTable();
}

function renderMemberTable() {
  const root = document.getElementById("member-contribution-table");
  if (!memberRows.length) {
    showEmpty(root, { title: "No contributions yet", message: "Your contribution records will appear here." });
    return;
  }

  root.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Cycle</th><th class="num">Base</th><th class="num">Discount</th><th class="num">Amount due</th><th>Payment reference</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
          ${memberRows.map(c => `
            <tr>
              <td><strong>${c.cycleNumber}</strong></td>
              <td class="num">${formatCurrency(c.baseAmount)}</td>
              <td class="num">${formatCurrency(c.discount)}</td>
              <td class="num">${formatCurrency(c.amountDue)}</td>
              <td>${escapeHtml(c.paymentRef || "—")}</td>
              <td>${statusBadge(getPaymentStatus(c))}</td>
              <td>
                <div class="table__actions">
                  ${["UNPAID", "REJECTED"].includes(getPaymentStatus(c)) ? `<button class="btn btn--primary btn--sm" data-pay="${escapeHtml(c.id)}">Pay</button>` : ""}
                  ${c.paymentRef ? `<button class="btn btn--secondary btn--sm" data-view-member-payment="${escapeHtml(c.id)}">View</button>` : ""}
                </div>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;

  root.querySelectorAll("[data-pay]").forEach(btn => {
    btn.addEventListener("click", () => openSubmitPayment(btn.dataset.pay));
  });
  root.querySelectorAll("[data-view-member-payment]").forEach(btn => {
    btn.addEventListener("click", () => openMemberPayment(btn.dataset.viewMemberPayment));
  });
}

function openSubmitPayment(contributionOrId) {
  const row = typeof contributionOrId === "string"
    ? memberRows.find(c => c.id === contributionOrId)
    : contributionOrId;

  if (!row) return;

  const defaultDate = new Date().toISOString().slice(0, 10);
  const content = `
    <form id="submit-payment-form" novalidate>
      <div class="note">Amount due: <strong>${formatCurrency(row.amountDue)}</strong> · Cycle ${row.cycleNumber}</div>
      ${row.status === "REJECTED" ? `<div class="note note--warning">Previous submission was rejected: ${escapeHtml(row.rejectionReason || "See payment history.")}</div>` : ""}
      <div id="payment-form-message" class="form-message" hidden></div>

      <div class="field">
        <label for="payment-amount">Amount paid</label>
        <input class="input" id="payment-amount" name="amountPaid" type="number" min="1" value="${Number(row.amountDue)}" required>
        <div class="field__error" data-error="amount"></div>
      </div>

      <div class="form-grid">
        <div class="field">
          <label for="payment-date">Payment date</label>
          <input class="input" id="payment-date" name="paymentDate" type="date" value="${defaultDate}" required>
          <div class="field__error" data-error="paymentDate"></div>
        </div>
        <div class="field">
          <label for="payment-method">Payment method</label>
          <select class="select" id="payment-method" name="method" required>
            <option value="">Choose method</option>
            <option value="UPI">UPI</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Cash">Cash</option>
          </select>
          <div class="field__error" data-error="method"></div>
        </div>
        <div class="field field--full" id="txn-ref-field">
          <label for="txn-ref">Transaction reference</label>
          <input class="input" id="txn-ref" name="txnRef" placeholder="UPI / bank transaction ID">
          <div class="field__hint">Required for UPI and bank transfer. Cash has no electronic transaction reference.</div>
          <div class="field__error" data-error="txnRef"></div>
        </div>
        <div class="field field--full">
          <label for="payment-evidence">Payment evidence</label>
          <input class="input" id="payment-evidence" type="file" accept="image/*,.pdf">
          <div class="field__hint">Demo mode records the filename only; real file storage comes with the backend.</div>
        </div>
      </div>
    </form>`;

  openModal({
    title: "Submit payment",
    contentHtml: content,
    actions: [
      { label: "Cancel", variant: "secondary" },
      {
        label: "Submit payment", variant: "primary",
        onClick: async close => {
          const amount = document.getElementById("payment-amount").value;
          const paymentDate = document.getElementById("payment-date").value;
          const method = document.getElementById("payment-method").value;
          const txnRef = document.getElementById("txn-ref").value.trim();
          const evidence = document.getElementById("payment-evidence").files[0];
          const check = validateContribution({ amount, amountDue: row.amountDue, method, paymentDate, txnRef });

          document.querySelectorAll("[data-error]").forEach(el => el.textContent = "");
          if (!check.valid) {
            Object.entries(check.errors).forEach(([key, message]) => {
              const el = document.querySelector(`[data-error="${key}"]`);
              if (el) el.textContent = message;
            });
            return;
          }

          const result = await submitPayment({
            contributionId: row.id,
            amountPaid: Number(amount),
            paymentDate,
            method,
            txnRef,
            evidenceFileName: evidence?.name || ""
          });

          if (!result.success) {
            const box = document.getElementById("payment-form-message");
            box.hidden = false;
            box.textContent = result.message;
            return;
          }

          close();
          showToast(`Payment submitted. Reference: ${result.data.paymentRef}`, "success");
          await refreshMemberPayments();
        }
      }
    ]
  });

  const method = document.getElementById("payment-method");
  const txnField = document.getElementById("txn-ref-field");
  method.addEventListener("change", () => {
    txnField.hidden = method.value === "Cash";
    if (method.value === "Cash") document.getElementById("txn-ref").value = "";
  });
}

async function openMemberPayment(contributionId) {
  const row = memberRows.find(c => c.id === contributionId);
  if (!row) return;

  const evidenceResult = row.paymentRef ? await getEvidence(row.paymentRef) : { success: true, data: [] };
  const evidence = evidenceResult.success ? evidenceResult.data : [];
  const canDispute = row.paymentRef && !["UNPAID", "REJECTED"].includes(getPaymentStatus(row));

  openModal({
    title: row.paymentRef || `Cycle ${row.cycleNumber}`,
    contentHtml: `
      <div class="payment-detail-grid">
        <div><span>Cycle</span><strong>${row.cycleNumber}</strong></div>
        <div><span>Amount due</span><strong>${formatCurrency(row.amountDue)}</strong></div>
        <div><span>Amount paid</span><strong>${formatCurrency(row.amountPaid || 0)}</strong></div>
        <div><span>Method</span><strong>${escapeHtml(row.method || "—")}</strong></div>
        <div><span>Payment date</span><strong>${formatDate(row.paymentDate)}</strong></div>
        <div><span>Status</span><strong>${statusBadge(getPaymentStatus(row))}</strong></div>
      </div>
      ${row.rejectionReason ? `<div class="note note--warning"><strong>Rejection reason:</strong> ${escapeHtml(row.rejectionReason)}</div>` : ""}
      <div class="detail-block">
        <h3>Evidence</h3>
        ${evidence.length ? `<ul class="evidence-list">${evidence.map(e => `<li><strong>${escapeHtml(e.fileName)}</strong><span>Uploaded ${formatDateTime(e.uploadedAt)}</span></li>`).join("")}</ul>` : `<p class="muted">No evidence attached.</p>`}
      </div>
      <div class="detail-block">
        <h3>Payment history</h3>
        ${(row.history || []).length ? `<ol class="history-list">${[...(row.history || [])].reverse().map(h => `<li><strong>${escapeHtml(h.action)}</strong><span>${escapeHtml(h.note || "")}</span><small>${escapeHtml(h.by || "System")} · ${formatDateTime(h.at)}</small></li>`).join("")}</ol>` : `<p class="muted">No history yet.</p>`}
      </div>
    `,
    actions: canDispute ? [
      {
        label: "Raise dispute", variant: "danger",
        onClick: close => { close(); openRaiseDispute(row); }
      },
      { label: "Close", variant: "secondary" }
    ] : []
  });
}

function openRaiseDispute(row) {
  openModal({
    title: "Raise payment dispute",
    contentHtml: `
      <form id="dispute-form" novalidate>
        <p class="muted">Describe what happened. The dispute becomes part of the payment's history.</p>
        <div class="field">
          <label for="dispute-reason">Reason</label>
          <select class="select" id="dispute-reason">
            <option value="Payment not recorded">Payment not recorded</option>
            <option value="Wrong amount shown">Wrong amount shown</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div class="field">
          <label for="dispute-statement">What happened?</label>
          <textarea class="textarea" id="dispute-statement" required></textarea>
          <div class="field__error" id="dispute-error"></div>
        </div>
      </form>
    `,
    actions: [
      { label: "Cancel", variant: "secondary" },
      {
        label: "Raise dispute", variant: "danger",
        onClick: async close => {
          const statement = document.getElementById("dispute-statement").value.trim();
          const error = document.getElementById("dispute-error");
          if (!statement) { error.textContent = "Describe what happened."; return; }

          const result = await createDispute({
            paymentRef: row.paymentRef,
            reason: document.getElementById("dispute-reason").value,
            statement
          });

          if (!result.success) { error.textContent = result.message; return; }
          close();
          showToast("Dispute raised and added to the payment history.", "success");
          await refreshMemberPayments();
        }
      }
    ]
  });
}

async function refreshMemberPayments() {
  const result = await getContributions(memberCommittee.id);
  if (result.success) {
    memberRows = result.data.filter(c => c.memberId === memberUser.memberId)
      .sort((a, b) => b.cycleNumber - a.cycleNumber);
    renderMemberPayments();
  } else {
    showToast(result.message, "error");
  }
}
