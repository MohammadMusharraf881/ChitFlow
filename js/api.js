/* api.js — the ONLY file that knows where data comes from.
   Pages call functions like getCommittees(); they never touch localStorage or fetch() directly.

   Every function returns the same envelope the backend will use:
     success: { success: true,  data: ... }
     failure: { success: false, message: "...", code: "..." }

   To connect the real backend: set USE_MOCK = false. Each function already names its REST route,
   so request() will send it with fetch(). The pages do not change. */

const USE_MOCK = true;
const API_BASE = "/api";
const MOCK_LATENCY_MS = 250;
const DB_KEY = "chitflow_db_v1";

/* ---------------- Response helpers ---------------- */
const ok = (data) => ({ success: true, data });
const fail = (message, code = "ERROR") => ({ success: false, message, code });
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/* ---------------- Mock database (localStorage) ---------------- */
function getDb() {
  const raw = localStorage.getItem(DB_KEY);
  if (raw) { try { return JSON.parse(raw); } catch (e) { /* corrupted: fall through and reseed */ } }
  const seed = buildSeed();
  localStorage.setItem(DB_KEY, JSON.stringify(seed));
  return seed;
}
function saveDb(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
function resetMockData() { localStorage.removeItem(DB_KEY); }

/* ---------------- One request function for everything ----------------
   mockHandler(db) runs in mock mode and must return ok(...) or fail(...). */
async function request(method, path, body, mockHandler) {
  if (USE_MOCK) {
    await delay(MOCK_LATENCY_MS);
    try {
      return mockHandler(getDb());
    } catch (err) {
      return fail(err.message || "Unexpected error.", "SERVER_ERROR");
    }
  }
  try {
    const res = await fetch(API_BASE + path, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { logout(); return fail("Your session has expired. Please sign in again.", "UNAUTHORIZED"); }
    if (res.status === 403) return fail("You do not have permission to do that.", "FORBIDDEN");
    if (res.status === 404) return fail("We could not find that record.", "NOT_FOUND");
    if (res.status === 409) return fail((await res.json()).message || "This record already exists.", "DUPLICATE");
    if (res.status >= 500) return fail("The server had a problem. Please try again.", "SERVER_ERROR");
    return await res.json();                       // expected: { success, data } or { success:false, message }
  } catch (networkError) {
    return fail("Cannot reach the server. Check your connection and try again.", "NETWORK");
  }
}

/* ---------------- Small mock-side helpers ---------------- */
function actor() { const u = getCurrentUser(); return u || { name: "System", role: "organizer", id: "system" }; }
function nowIso() { return new Date().toISOString(); }
function nextNumber(list, prefix, width) {
  const max = list.reduce((m, x) => Math.max(m, Number(String(x).replace(prefix, "")) || 0), 0);
  return prefix + String(max + 1).padStart(width, "0");
}
function addAudit(db, action, entity, entityId, description) {
  const u = actor();
  db.auditLogs.push({ id: `al-${String(db.auditLogs.length + 1).padStart(3, "0")}`, at: nowIso(), by: u.name, role: u.role, action, entity, entityId, description });
}
function notify(db, userId, type, message) {
  db.notifications.push({ id: `n-${String(db.notifications.length + 1).padStart(3, "0")}`, userId, type, message, createdAt: nowIso(), read: false });
}
function byNewest(field) { return (a, b) => new Date(b[field]) - new Date(a[field]); }

/* ================= Committees ================= */
function getCommittees() {
  return request("GET", "/committees", null, db => ok(db.committees));
}
function getCommittee(id) {
  return request("GET", `/committees/${id}`, null, db => {
    const c = db.committees.find(x => x.id === id);
    return c ? ok(c) : fail("Committee not found.", "NOT_FOUND");
  });
}
function createCommittee(data) {
  return request("POST", "/committees", data, db => {
    if (!data.name || !data.name.trim()) return fail("Committee name is required.", "VALIDATION");
    if (db.committees.some(c => c.name.toLowerCase() === data.name.trim().toLowerCase())) {
      return fail("A committee with this name already exists.", "DUPLICATE");
    }
    const committee = {
      id: nextNumber(db.committees.map(c => c.id), "c-", 3), status: "ACTIVE", currentCycle: 0,
      organizerId: actor().memberId || "m-01", ...data, name: data.name.trim(),
    };
    db.committees.push(committee);
    addAudit(db, "CREATE_COMMITTEE", "Committee", committee.id, `Created committee ${committee.name}.`);
    saveDb(db);
    return ok(committee);
  });
}
function updateCommittee(id, data) {
  return request("PUT", `/committees/${id}`, data, db => {
    const c = db.committees.find(x => x.id === id);
    if (!c) return fail("Committee not found.", "NOT_FOUND");
    Object.assign(c, data);
    addAudit(db, "UPDATE_COMMITTEE_RULE", "Committee", id, `Updated committee ${c.name}.`);
    saveDb(db);
    return ok(c);
  });
}

/* ================= Members & cycles ================= */
function getMembers(committeeId) {
  return request("GET", `/committees/${committeeId}/members`, null, db => ok(db.members.filter(m => m.committeeId === committeeId)));
}
function addMember(data) {
  return request("POST", "/members", data, db => {
    if (!data.name || !data.email) return fail("Name and email are required.", "VALIDATION");
    if (db.members.some(m => m.committeeId === data.committeeId && m.email.toLowerCase() === data.email.toLowerCase())) {
      return fail("This member is already in the committee.", "DUPLICATE");
    }
    const id = nextNumber(db.members.map(m => m.id), "m-", 2);
    const today = nowIso().slice(0, 10);
    const member = { id, ...data, isOrganizer: false, membership: {
      membershipId: `MS-${data.committeeId.toUpperCase().replace("-", "")}-${id.slice(2).padStart(3, "0")}`,
      joinedAt: today, status: "ACTIVE", effectiveDate: today, reason: "",
      history: [{ status: "ACTIVE", effectiveDate: today, reason: "Joined committee", changedBy: actor().name }] } };
    db.members.push(member);
    addAudit(db, "ADD_MEMBER", "Member", id, `Added ${member.name}.`);
    saveDb(db);
    return ok(member);
  });
}
function getCycles(committeeId) {
  return request("GET", `/committees/${committeeId}/cycles`, null, db => ok(db.cycles.filter(c => c.committeeId === committeeId)));
}

/* ================= Contributions & payments ================= */
function getContributions(committeeId) {
  return request("GET", `/committees/${committeeId}/contributions`, null, db => ok(db.contributions.filter(c => c.committeeId === committeeId)));
}
function getEvidence(paymentRef) {
  return request("GET", `/payments/${paymentRef}/evidence`, null, db => ok(db.evidence.filter(e => e.paymentRef === paymentRef)));
}

// data: { contributionId, amountPaid, paymentDate, method, txnRef, evidenceFileName }
function submitPayment(data) {
  return request("POST", "/payments", data, db => {
    const row = db.contributions.find(c => c.id === data.contributionId);
    if (!row) return fail("Contribution not found.", "NOT_FOUND");
    if (row.status !== "UNPAID" && row.status !== "REJECTED") return fail("A payment for this cycle has already been submitted.", "DUPLICATE");
    const check = validateContribution({ amount: data.amountPaid, amountDue: row.amountDue, method: data.method, paymentDate: data.paymentDate, txnRef: data.txnRef });
    if (!check.valid) return fail(Object.values(check.errors)[0], "VALIDATION");

    const allRefs = db.contributions.map(c => c.paymentRef).filter(Boolean);
    const ref = nextNumber(allRefs, "CF-PAY-2026-", 6);
    const isCash = data.method === "Cash";
    const at = nowIso();
    Object.assign(row, {
      paymentRef: ref, method: data.method, txnRef: data.txnRef || "", paymentDate: data.paymentDate,
      amountPaid: Number(data.amountPaid), submittedAt: at, rejectionReason: "",
      status: isCash ? "SUBMITTED" : "PENDING_VERIFICATION", cashStage: isCash ? "MEMBER_SUBMITTED" : null,
    });
    row.history.push({ at, by: actor().name, action: "SUBMITTED", note: `Submitted ${data.method} payment.` });
    if (data.evidenceFileName) {
      const evId = `ev-${String(db.evidence.length + 1).padStart(3, "0")}`;
      db.evidence.push({ id: evId, paymentRef: ref, uploadedBy: actor().name, uploadedAt: at, fileName: data.evidenceFileName, fileType: "mock", isMock: true });
      row.evidenceIds.push(evId);
    }
    addAudit(db, "SUBMIT_PAYMENT", "Payment", ref, `Submitted ${formatCurrency(row.amountPaid)} for Cycle ${row.cycleNumber}.`);
    notify(db, "u-org", "payment", `${actor().name} submitted a payment for Cycle ${row.cycleNumber}.`);
    saveDb(db);
    return ok(row);
  });
}

// Cash is not proven by software: the organizer acknowledges it, and only then can it be verified.
function acknowledgeCashPayment(paymentRef) {
  return request("POST", `/payments/${paymentRef}/acknowledge`, null, db => {
    const row = db.contributions.find(c => c.paymentRef === paymentRef);
    if (!row || row.method !== "Cash") return fail("Cash payment not found.", "NOT_FOUND");
    row.cashStage = "ORGANIZER_ACKNOWLEDGED"; row.status = "PENDING_VERIFICATION";
    row.history.push({ at: nowIso(), by: actor().name, action: "ACKNOWLEDGED", note: "Cash received acknowledged." });
    addAudit(db, "VERIFY_PAYMENT", "Payment", paymentRef, "Acknowledged cash payment.");
    saveDb(db);
    return ok(row);
  });
}
function verifyPayment(paymentRef) {
  return request("POST", `/payments/${paymentRef}/verify`, null, db => {
    const row = db.contributions.find(c => c.paymentRef === paymentRef);
    if (!row) return fail("Payment not found.", "NOT_FOUND");
    if (row.status === "VERIFIED") return fail("This payment is already verified.", "DUPLICATE");
    if (row.method === "Cash" && row.cashStage !== "ORGANIZER_ACKNOWLEDGED") return fail("Acknowledge the cash payment before verifying it.", "VALIDATION");
    row.status = "VERIFIED"; row.verifiedAt = nowIso(); row.verifiedBy = actor().name;
    row.history.push({ at: row.verifiedAt, by: actor().name, action: "VERIFIED", note: "Payment verified." });
    addAudit(db, "VERIFY_PAYMENT", "Payment", paymentRef, `Verified payment of ${formatCurrency(row.amountPaid)}.`);
    db.transactions.push({ id: nextNumber(db.transactions.map(t => t.id), "TXN-", 5), date: row.verifiedAt, memberId: row.memberId, type: "Contribution", direction: "in", amount: row.amountPaid, cycleNumber: row.cycleNumber, status: "COMPLETED", reference: paymentRef });
    const member = db.users.find(u => u.memberId === row.memberId);
    if (member) notify(db, member.id, "payment", `Your payment ${paymentRef} has been verified.`);
    saveDb(db);
    return ok(row);
  });
}
function rejectPayment(paymentRef, reason) {
  return request("POST", `/payments/${paymentRef}/reject`, { reason }, db => {
    const row = db.contributions.find(c => c.paymentRef === paymentRef);
    if (!row) return fail("Payment not found.", "NOT_FOUND");
    if (!reason || !reason.trim()) return fail("Give a reason so the member knows what to fix.", "VALIDATION");
    row.status = "REJECTED"; row.rejectionReason = reason.trim();
    row.history.push({ at: nowIso(), by: actor().name, action: "REJECTED", note: reason.trim() });
    addAudit(db, "REJECT_PAYMENT", "Payment", paymentRef, `Rejected: ${reason.trim()}`);
    saveDb(db);
    return ok(row);
  });
}

/* ================= Auctions & bids ================= */
function getAuctions(committeeId) {
  return request("GET", `/committees/${committeeId}/auctions`, null, db => ok(db.auctions.filter(a => a.committeeId === committeeId)));
}
function getAuction(id) {
  return request("GET", `/auctions/${id}`, null, db => {
    const a = db.auctions.find(x => x.id === id);
    if (!a) return fail("Auction not found.", "NOT_FOUND");
    return ok({ ...a, bids: db.bids.filter(b => b.auctionId === id).sort((x, y) => x.amount - y.amount) });
  });
}
function createAuction(data) {
  return request("POST", "/auctions", data, db => {
    if (db.auctions.some(a => a.committeeId === data.committeeId && a.cycleNumber === data.cycleNumber)) return fail("An auction already exists for this cycle.", "DUPLICATE");
    const committee = db.committees.find(c => c.id === data.committeeId);
    if (!committee) return fail("Committee not found.", "NOT_FOUND");
    const auction = { id: nextNumber(db.auctions.map(a => a.id), "a-", 3), committeeValue: committee.committeeValue, status: "SCHEDULED", winnerId: null, winningBid: null, discount: 0, discountPerMember: 0, adjustedContribution: null, ...data };
    db.auctions.push(auction);
    addAudit(db, "CREATE_AUCTION", "Auction", auction.id, `Created auction for Cycle ${data.cycleNumber}.`);
    saveDb(db);
    return ok(auction);
  });
}
// data: { auctionId, memberId, amount }
function submitBid(data) {
  return request("POST", `/auctions/${data.auctionId}/bids`, data, db => {
    const auction = db.auctions.find(a => a.id === data.auctionId);
    if (!auction) return fail("Auction not found.", "NOT_FOUND");
    if (auction.status !== "OPEN") return fail("This auction is not open for bids.", "VALIDATION");
    const alreadyWon = db.cycles.some(c => c.recipientId === data.memberId);
    const bids = db.bids.filter(b => b.auctionId === auction.id);
    const currentLowest = bids.length ? Math.min(...bids.map(b => b.amount)) : null;
    const check = validateBid({ amount: data.amount, committeeValue: auction.committeeValue, currentLowest, isEligible: !alreadyWon });
    if (!check.valid) return fail(check.message, "INVALID_BID");
    const bid = { id: nextNumber(db.bids.map(b => b.id), "b-", 3), auctionId: auction.id, memberId: data.memberId, amount: Number(data.amount), placedAt: nowIso() };
    db.bids.push(bid);
    addAudit(db, "SUBMIT_BID", "Auction", auction.id, `Bid ${formatCurrency(bid.amount)}.`);
    saveDb(db);
    return ok(bid);
  });
}
function closeAuction(id) {
  return request("POST", `/auctions/${id}/close`, null, db => {
    const auction = db.auctions.find(a => a.id === id);
    if (!auction) return fail("Auction not found.", "NOT_FOUND");
    if (auction.status === "CLOSED") return fail("This auction is already closed.", "DUPLICATE");
    const bids = db.bids.filter(b => b.auctionId === id);
    if (!bids.length) return fail("There are no bids yet, so there is no winner to select.", "VALIDATION");
    const winner = bids.reduce((low, b) => (b.amount < low.amount ? b : low));   // lowest bid wins
    const committee = db.committees.find(c => c.id === auction.committeeId);
    const discount = calculateDiscount(auction.committeeValue, winner.amount);
    const perMember = calculateDiscountPerMember(discount, committee.totalMembers);
    Object.assign(auction, { status: "CLOSED", winnerId: winner.memberId, winningBid: winner.amount, discount, discountPerMember: perMember, adjustedContribution: calculateAdjustedContribution(committee.baseContribution, perMember) });
    const cycle = db.cycles.find(c => c.committeeId === auction.committeeId && c.number === auction.cycleNumber);
    if (cycle) Object.assign(cycle, { recipientId: winner.memberId, winningBid: winner.amount, discount, discountPerMember: perMember, adjustedContribution: auction.adjustedContribution, payoutAmount: winner.amount });
    addAudit(db, "CLOSE_AUCTION", "Auction", id, `Closed auction for Cycle ${auction.cycleNumber}.`);
    addAudit(db, "SELECT_WINNER", "Auction", id, `${db.members.find(m => m.id === winner.memberId).name} won with ${formatCurrency(winner.amount)}.`);
    saveDb(db);
    return ok(auction);
  });
}

/* ================= Payouts, transactions, disputes ================= */
function getPayouts(committeeId) {
  return request("GET", `/committees/${committeeId}/payouts`, null, db => ok(db.payouts.filter(p => p.committeeId === committeeId)));
}
function createPayout(data) {
  return request("POST", "/payouts", data, db => {
    if (db.payouts.some(p => p.committeeId === data.committeeId && p.cycleNumber === data.cycleNumber)) return fail("A payout already exists for this cycle.", "DUPLICATE");
    const payout = { id: nextNumber(db.payouts.map(p => p.id), "po-", 3), reference: nextNumber(db.payouts.map(p => p.reference), "CF-PO-2026-", 6), status: "PENDING", ...data };
    db.payouts.push(payout);
    addAudit(db, "CREATE_PAYOUT", "Payout", payout.reference, `Created payout of ${formatCurrency(payout.amount)}.`);
    saveDb(db);
    return ok(payout);
  });
}
function getTransactions(committeeId) {
  return request("GET", `/committees/${committeeId}/transactions`, null, db => ok([...db.transactions].sort(byNewest("date"))));
}
function getDisputes() {
  return request("GET", "/disputes", null, db => ok([...db.disputes].sort(byNewest("updatedAt"))));
}
function createDispute(data) {
  return request("POST", "/disputes", data, db => {
    if (!data.statement || !data.statement.trim()) return fail("Describe what happened so the organizer can review it.", "VALIDATION");
    const row = db.contributions.find(c => c.paymentRef === data.paymentRef);
    if (!row) return fail("Payment not found.", "NOT_FOUND");
    if (db.disputes.some(d => d.paymentRef === data.paymentRef && d.status !== "RESOLVED" && d.status !== "REJECTED")) return fail("There is already an open dispute for this payment.", "DUPLICATE");
    const at = nowIso();
    const dispute = { id: nextNumber(db.disputes.map(d => d.id), "d-", 3), paymentRef: data.paymentRef, memberId: row.memberId, amount: row.amountPaid || row.amountDue, cycleNumber: row.cycleNumber, reason: data.reason || "Payment dispute", status: "OPEN", createdAt: at, updatedAt: at, evidenceIds: [], history: [{ at, by: actor().name, role: actor().role, action: "RAISED", message: data.statement.trim() }] };
    db.disputes.push(dispute);
    addAudit(db, "RAISE_DISPUTE", "Dispute", dispute.id, `Raised a dispute on ${data.paymentRef}.`);
    saveDb(db);
    return ok(dispute);
  });
}
// data: { status: "RESOLVED" | "REJECTED" | "UNDER_REVIEW", message }
function resolveDispute(id, data) {
  return request("POST", `/disputes/${id}/resolve`, data, db => {
    const d = db.disputes.find(x => x.id === id);
    if (!d) return fail("Dispute not found.", "NOT_FOUND");
    if (!data.message || !data.message.trim()) return fail("Add a response before updating the dispute.", "VALIDATION");
    d.status = data.status || "RESOLVED"; d.updatedAt = nowIso();
    d.history.push({ at: d.updatedAt, by: actor().name, role: actor().role, action: d.status, message: data.message.trim() });
    addAudit(db, "RESOLVE_DISPUTE", "Dispute", id, `Marked dispute ${id} as ${d.status.toLowerCase().replace("_", " ")}.`);
    saveDb(db);
    return ok(d);
  });
}

/* ================= Audit log & notifications ================= */
function getAuditLogs() {
  return request("GET", "/audit-logs", null, db => ok([...db.auditLogs].sort(byNewest("at"))));
}
function getNotifications() {
  return request("GET", "/notifications", null, db => {
    const me = actor().id;
    return ok(db.notifications.filter(n => n.userId === me).sort(byNewest("createdAt")));
  });
}
