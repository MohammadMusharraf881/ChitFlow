/* utils.js — shared helpers used by every page.
   Three groups: (1) formatting, (2) business rules, (3) small UI helpers (toast, modal, page states).
   Load order on every page: utils.js → mock-data.js → api.js → auth.js → app.js → page script. */

/* ================= 1. FORMATTING ================= */

// Indian digit grouping: 720000 -> ₹7,20,000
function formatCurrency(amount) {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return "—";
  const hasPaise = Math.round(Number(amount) * 100) % 100 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: hasPaise ? 2 : 0,
  }).format(amount);
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
  });
}

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
  });
}

// "now" for the whole app. In mock mode it is a fixed date (APP_NOW, set in mock-data.js)
// so overdue/upcoming labels stay consistent with the seed data. Real backend: new Date().
function getNow() {
  return typeof APP_NOW !== "undefined" ? new Date(APP_NOW) : new Date();
}

function getInitials(name) {
  return String(name || "?").split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");
}

// Always escape user-provided text before putting it inside innerHTML (prevents XSS).
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

function debounce(fn, wait = 250) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
}

/* ================= 2. STATUS LABELS ================= */

// One place that maps a status code from the backend to a label + colour.
const STATUS_META = {
  // Payment
  SUBMITTED:            { label: "Submitted",            tone: "info" },
  PENDING_VERIFICATION: { label: "Pending verification", tone: "warning" },
  VERIFIED:             { label: "Verified",             tone: "success" },
  REJECTED:             { label: "Rejected",             tone: "danger" },
  DISPUTED:             { label: "Disputed",             tone: "disputed" },
  UNDER_REVIEW:         { label: "Under review",         tone: "info" },
  COMPLETED:            { label: "Completed",            tone: "success" },
  // Contribution (derived — nothing submitted yet)
  UNPAID:               { label: "Not paid yet",         tone: "neutral" },
  OVERDUE:              { label: "Overdue",              tone: "danger" },
  // Dispute
  OPEN:                 { label: "Open",                 tone: "warning" },
  RESOLVED:             { label: "Resolved",             tone: "success" },
  // Auction / cycle
  SCHEDULED:            { label: "Scheduled",            tone: "neutral" },
  UPCOMING:             { label: "Upcoming",             tone: "neutral" },
  ACTIVE:               { label: "Active",               tone: "success" },
  CLOSED:               { label: "Closed",               tone: "neutral" },
  INACTIVE:             { label: "Inactive",             tone: "neutral" },
  // Payout
  PENDING:              { label: "Pending",              tone: "warning" },
  PROCESSING:           { label: "Processing",           tone: "info" },
  FAILED:               { label: "Failed",               tone: "danger" },
};

function statusBadge(status) {
  const meta = STATUS_META[status] || { label: status || "Unknown", tone: "neutral" };
  return `<span class="badge badge--${meta.tone}">${escapeHtml(meta.label)}</span>`;
}

/* ================= 3. BUSINESS RULES =================
   These mirror what the backend will calculate. The UI uses them for instant feedback;
   the server's answer is the one that counts. */

// Committee value = members × base contribution   (24 × ₹30,000 = ₹7,20,000)
function calculateCommitteeValue(members, baseContribution) {
  return Number(members) * Number(baseContribution);
}

// Discount = committee value − winning bid          (₹7,20,000 − ₹6,60,000 = ₹60,000)
function calculateDiscount(committeeValue, winningBid) {
  return Number(committeeValue) - Number(winningBid);
}

// Rule "equal discount distribution": discount ÷ members   (₹60,000 ÷ 24 = ₹2,500)
function calculateDiscountPerMember(discount, members) {
  if (!members) return 0;
  return Math.round((Number(discount) / Number(members)) * 100) / 100;
}

// Adjusted contribution = base − discount per member       (₹30,000 − ₹2,500 = ₹27,500)
function calculateAdjustedContribution(baseContribution, discountPerMember) {
  return Number(baseContribution) - Number(discountPerMember);
}

// Progress bar value (0–100): "Cycle 2 / 24" -> 8
function calculateCycleProgress(currentCycle, totalCycles) {
  if (!totalCycles) return 0;
  return Math.min(100, Math.round((currentCycle / totalCycles) * 100));
}

// Frontend-only bid checks. The backend re-checks everything.
function validateBid({ amount, committeeValue, currentLowest, isEligible = true }) {
  if (!isEligible) return { valid: false, message: "Only eligible members can bid." };
  if (amount === "" || amount === null || amount === undefined || Number.isNaN(Number(amount))) {
    return { valid: false, message: "Enter your bid amount." };
  }
  const bid = Number(amount);
  if (bid < 0) return { valid: false, message: "Bid cannot be negative." };
  if (bid === 0) return { valid: false, message: "Bid cannot be zero." };
  if (bid > committeeValue) {
    return { valid: false, message: `Bid cannot exceed the committee value of ${formatCurrency(committeeValue)}.` };
  }
  if (currentLowest && bid >= currentLowest) {
    return { valid: false, message: "Your bid must be lower than the current lowest bid." };
  }
  return { valid: true, message: "" };
}

// Returns { valid, errors: { fieldName: message } } for the payment form.
function validateContribution({ amount, amountDue, method, paymentDate, txnRef }) {
  const errors = {};
  if (!amount || Number(amount) <= 0) errors.amount = "Enter the amount you paid.";
  else if (Number(amount) !== Number(amountDue)) errors.amount = `Amount must match the amount due (${formatCurrency(amountDue)}).`;
  if (!method) errors.method = "Choose a payment method.";
  if (!paymentDate) errors.paymentDate = "Choose the payment date.";
  else if (new Date(paymentDate) > getNow()) errors.paymentDate = "Payment date cannot be in the future.";
  if (method && method !== "Cash" && !String(txnRef || "").trim()) {
    errors.txnRef = "Enter the transaction reference.";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

// Turns a contribution row into ONE status key. Nothing submitted + past due date = OVERDUE.
function getPaymentStatus(contribution) {
  if (contribution.status && contribution.status !== "UNPAID") return contribution.status;
  return new Date(contribution.dueDate) < getNow() ? "OVERDUE" : "UNPAID";
}

/* ================= 4. UI HELPERS ================= */

function showToast(message, type = "info") {
  let region = document.getElementById("toast-region");
  if (!region) {
    region = document.createElement("div");
    region.id = "toast-region";
    region.className = "toast-region";
    region.setAttribute("aria-live", "polite");
    document.body.appendChild(region);
  }
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.textContent = message;               // textContent, not innerHTML: safe by default
  region.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// openModal({ title, contentHtml, actions: [{ label, variant, onClick }] }) -> close()
function openModal({ title, contentHtml = "", actions = [] }) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="modal__header"><h2>${escapeHtml(title)}</h2>
        <button class="btn btn--ghost btn--sm" data-modal-close aria-label="Close">Close</button></div>
      <div class="modal__body">${contentHtml}</div>
      <div class="modal__footer"></div>
    </div>`;
  const footer = backdrop.querySelector(".modal__footer");
  const close = () => { backdrop.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };

  actions.forEach(a => {
    const btn = document.createElement("button");
    btn.className = `btn btn--${a.variant || "secondary"}`;
    btn.textContent = a.label;
    btn.addEventListener("click", () => a.onClick ? a.onClick(close) : close());
    footer.appendChild(btn);
  });
  if (!actions.length) footer.remove();

  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelector("[data-modal-close]").addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  document.body.appendChild(backdrop);
  return close;
}

function confirmDialog({ title, message, confirmLabel = "Confirm", variant = "primary" }) {
  return new Promise(resolve => {
    openModal({
      title,
      contentHtml: `<p>${escapeHtml(message)}</p>`,
      actions: [
        { label: "Cancel", variant: "secondary", onClick: (close) => { close(); resolve(false); } },
        { label: confirmLabel, variant, onClick: (close) => { close(); resolve(true); } },
      ],
    });
  });
}

// The four page states every data-driven page needs: loading, empty, error (success = your content).
function showLoading(container, rows = 4) {
  container.innerHTML = `<div class="card card__body" aria-busy="true">${'<div class="skeleton"></div>'.repeat(rows)}</div>`;
}

function showEmpty(container, { title = "Nothing here yet", message = "", actionLabel = "", onAction = null } = {}) {
  container.innerHTML = `<div class="state"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p>
    ${actionLabel ? `<button class="btn btn--primary" data-state-action>${escapeHtml(actionLabel)}</button>` : ""}</div>`;
  if (onAction) container.querySelector("[data-state-action]").addEventListener("click", onAction);
}

function showError(container, message = "Something went wrong.", onRetry = null) {
  container.innerHTML = `<div class="state state--error"><h3>Could not load this page</h3><p>${escapeHtml(message)}</p>
    ${onRetry ? '<button class="btn btn--secondary" data-state-retry>Try again</button>' : ""}</div>`;
  if (onRetry) container.querySelector("[data-state-retry]").addEventListener("click", onRetry);
}
