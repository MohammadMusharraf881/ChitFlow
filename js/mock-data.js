/* mock-data.js — the fake "database" used until the Node/Express/PostgreSQL backend exists.
   buildSeed() returns one object shaped like the tables the backend will have.
   api.js copies it into localStorage so changes survive page navigation.

   DEVELOPMENT ONLY: no real people or real financial data are used here. */

// Fixed "today" so overdue / upcoming labels match the story in the seed data.
const APP_NOW = "2026-10-12T09:00:00+05:30";

const MOCK_USERS = [
  { id: "u-org", name: "Vikram Malhotra", email: "organizer@chitflow.test", role: "organizer", memberId: "m-01", phone: "+91 90000 00001", joinedAt: "2026-08-20" },
  { id: "u-mem", name: "Rahul Sharma",    email: "member@chitflow.test",    role: "member",    memberId: "m-02", phone: "+91 90000 00002", joinedAt: "2026-09-01" },
];

function buildSeed() {
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  // Build an IST timestamp string: ist(2026, 10, 10, 10, 15) -> "2026-10-10T10:15:00+05:30"
  const ist = (y, m, d, h = 0, mi = 0) => `${y}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(mi)}:00+05:30`;
  const payRef = (n) => `CF-PAY-2026-${pad(n, 6)}`;

  const COMMITTEE_ID = "c-001";
  const BASE = 30000, VALUE = 720000, MEMBER_COUNT = 24;

  /* ---------- Members (member #1 is the organizer, who is also a participant) ---------- */
  const names = [
    "Vikram Malhotra", "Rahul Sharma", "Aman Verma", "Priya Nair", "Sneha Iyer", "Arjun Reddy",
    "Kavita Joshi", "Rohan Mehta", "Ananya Gupta", "Karan Singh", "Meera Pillai", "Suresh Kulkarni",
    "Divya Menon", "Harpreet Kaur", "Nikhil Bansal", "Pooja Desai", "Imran Sheikh", "Lakshmi Narayanan",
    "Gurpreet Sandhu", "Neha Agarwal", "Deepak Chauhan", "Shreya Banerjee", "Faisal Ahmed", "Tanvi Kapoor",
  ];
  const members = names.map((name, i) => {
    const n = i + 1, id = `m-${pad(n)}`;
    return {
      id, name,
      email: n === 1 ? "organizer@chitflow.test" : n === 2 ? "member@chitflow.test" : `member${pad(n)}@example.test`,
      phone: `+91 90000 000${pad(n)}`,
      committeeId: COMMITTEE_ID,
      isOrganizer: n === 1,
      membership: {
        membershipId: `MS-C001-${pad(n, 3)}`,
        joinedAt: "2026-09-01",
        status: "ACTIVE",            // current status …
        effectiveDate: "2026-09-01",
        reason: "",
        // … while history keeps every status change. Nothing here is ever deleted.
        history: [{ status: "ACTIVE", effectiveDate: "2026-09-01", reason: "Joined committee", changedBy: "Vikram Malhotra" }],
      },
    };
  });
  const memberName = (id) => members.find(m => m.id === id).name;

  /* ---------- Committee ---------- */
  const committees = [{
    id: COMMITTEE_ID,
    name: "Friends Savings 2026",
    description: "Monthly committee for a close friends group. Cycle 1 goes to the organizer; later cycles are auctioned.",
    totalMembers: MEMBER_COUNT,
    committeeValue: VALUE,
    baseContribution: BASE,
    durationCycles: 24,
    startDate: "2026-09-01",
    paymentDeadlineDay: 10,
    auctionFrequency: "Monthly",
    firstCycleRule: "ORGANIZER_ALLOCATION",
    discountRule: "EQUAL_DISTRIBUTION",   // configurable per committee — not a universal rule
    currentCycle: 2,
    status: "ACTIVE",
    organizerId: "m-01",
  }];

  /* ---------- Cycles (24) ---------- */
  const cycleMonth = (n) => ({ y: 2026 + Math.floor((8 + n - 1) / 12), m: ((8 + n - 1) % 12) + 1 });
  const cycles = Array.from({ length: 24 }, (_, i) => {
    const n = i + 1, { y, m } = cycleMonth(n);
    return {
      id: `cy-${pad(n)}`, committeeId: COMMITTEE_ID, number: n,
      type: n === 1 ? "ORGANIZER_ALLOCATION" : "AUCTION",
      status: n < 3 ? "COMPLETED" : "UPCOMING",
      dueDate: ist(y, m, 10, 23, 59),
      auctionDate: n === 1 ? null : ist(y, m, 5, 19, 0),
      recipientId: null, winningBid: null, discount: 0, discountPerMember: 0,
      adjustedContribution: BASE, payoutAmount: null,
    };
  });
  Object.assign(cycles[0], { recipientId: "m-01", payoutAmount: VALUE });
  Object.assign(cycles[1], {
    recipientId: "m-04", winningBid: 660000, discount: 60000,
    discountPerMember: 2500, adjustedContribution: 27500, payoutAmount: 660000,
  });

  /* ---------- Contributions + payments (cycles 1 and 2) ---------- */
  const contributions = [], evidence = [], transactions = [];
  let txnNo = 1, evNo = 1;
  const cycle2Special = {
    "m-05": "PENDING_VERIFICATION", "m-21": "PENDING_VERIFICATION",
    "m-08": "CASH_SUBMITTED",       "m-12": "CASH_ACKNOWLEDGED",
    "m-10": "DISPUTED",             "m-15": "REJECTED",
    "m-19": "UNPAID",               "m-22": "UNPAID",
  };

  members.forEach((mem, i) => {
    const idx = i + 1;
    [1, 2].forEach(cn => {
      const cyc = cycles[cn - 1];
      const special = cn === 2 ? cycle2Special[mem.id] : null;
      const ref = payRef(cn === 1 ? 100 + idx : 289 + idx);   // Rahul, cycle 2 -> CF-PAY-2026-000291
      const day = cn === 1 ? 5 + (i % 6) : 6 + (i % 5);
      const month = cn === 1 ? 9 : 10;
      const hour = 9 + (i % 8), minute = (i * 7) % 60;
      const isCash = special === "CASH_SUBMITTED" || special === "CASH_ACKNOWLEDGED";
      const row = {
        id: `ct-${cn}-${mem.id}`, committeeId: COMMITTEE_ID, cycleNumber: cn, memberId: mem.id,
        baseAmount: BASE, discount: cyc.discountPerMember, amountDue: cyc.adjustedContribution,
        dueDate: cyc.dueDate,
        paymentRef: null, method: null, txnRef: null, paymentDate: null, amountPaid: null,
        status: "UNPAID", submittedAt: null, verifiedAt: null, verifiedBy: null,
        rejectionReason: "", cashStage: null, evidenceIds: [], history: [],
      };
      if (special !== "UNPAID") {
        const submittedAt = ist(2026, month, day, hour, minute);
        Object.assign(row, {
          paymentRef: (mem.id === "m-02" && cn === 2) ? payRef(291) : ref,
          method: isCash ? "Cash" : (i % 5 === 4 ? "Bank Transfer" : "UPI"),
          txnRef: isCash ? "" : (mem.id === "m-02" && cn === 2 ? "UPI123456789" : `TXN${cn}${pad(idx)}${pad(day)}88${pad(hour)}`),
          paymentDate: ist(2026, month, day),
          amountPaid: cyc.adjustedContribution,
          submittedAt,
        });
        row.history.push({ at: submittedAt, by: mem.name, action: "SUBMITTED", note: `Submitted ${row.method} payment.` });

        const plain = !special;
        if (plain || special === "CASH_ACKNOWLEDGED") {
          if (special === "CASH_ACKNOWLEDGED") {
            row.status = "PENDING_VERIFICATION"; row.cashStage = "ORGANIZER_ACKNOWLEDGED";
            row.history.push({ at: ist(2026, 10, 11, 17, 5), by: "Vikram Malhotra", action: "ACKNOWLEDGED", note: "Cash received acknowledged." });
          } else {
            row.status = "VERIFIED";
            row.verifiedAt = ist(2026, month, day, hour, minute + 47 > 59 ? 59 : minute + 47);
            if (mem.id === "m-02" && cn === 2) row.verifiedAt = ist(2026, 10, 10, 11, 2);
            row.verifiedBy = "Vikram Malhotra";
            row.history.push({ at: row.verifiedAt, by: "Vikram Malhotra", action: "VERIFIED", note: "Payment verified." });
            transactions.push({
              id: `TXN-${pad(txnNo++, 5)}`, date: row.verifiedAt, memberId: mem.id, type: "Contribution",
              direction: "in", amount: row.amountPaid, cycleNumber: cn, status: "COMPLETED", reference: row.paymentRef,
            });
          }
        } else if (special === "PENDING_VERIFICATION") {
          row.status = "PENDING_VERIFICATION";
        } else if (special === "CASH_SUBMITTED") {
          row.status = "SUBMITTED"; row.cashStage = "MEMBER_SUBMITTED";
        } else if (special === "DISPUTED") {
          row.status = "DISPUTED";
          row.history.push({ at: ist(2026, 10, 11, 12, 30), by: "Vikram Malhotra", action: "NOT_RECEIVED", note: "Organizer could not find this payment." });
        } else if (special === "REJECTED") {
          row.status = "REJECTED";
          row.rejectionReason = "Transaction reference does not match the bank record.";
          row.history.push({ at: ist(2026, 10, 11, 10, 0), by: "Vikram Malhotra", action: "REJECTED", note: row.rejectionReason });
        }
        if (!isCash) {
          const evId = `ev-${pad(evNo++, 3)}`;
          row.evidenceIds.push(evId);
          evidence.push({
            id: evId, paymentRef: row.paymentRef, uploadedBy: mem.name, uploadedAt: row.submittedAt,
            fileName: row.method === "UPI" ? `upi_screenshot_${row.paymentRef.slice(-6)}.png` : `bank_receipt_${row.paymentRef.slice(-6)}.pdf`,
            fileType: row.method === "UPI" ? "image/png" : "application/pdf",
            isMock: true,   // no real file: the backend will store real files later
          });
        }
      }
      contributions.push(row);
    });
  });

  /* ---------- Auctions & bids ---------- */
  const auctions = [
    { id: "a-001", committeeId: COMMITTEE_ID, cycleNumber: 2, committeeValue: VALUE, status: "CLOSED",
      startTime: ist(2026, 10, 5, 19, 0), endTime: ist(2026, 10, 5, 20, 0),
      winnerId: "m-04", winningBid: 660000, discount: 60000, discountPerMember: 2500, adjustedContribution: 27500 },
    { id: "a-002", committeeId: COMMITTEE_ID, cycleNumber: 3, committeeValue: VALUE, status: "SCHEDULED",
      startTime: ist(2026, 11, 5, 19, 0), endTime: ist(2026, 11, 5, 20, 0),
      winnerId: null, winningBid: null, discount: 0, discountPerMember: 0, adjustedContribution: null },
  ];
  const bids = [
    { id: "b-001", auctionId: "a-001", memberId: "m-02", amount: 700000, placedAt: ist(2026, 10, 5, 19, 5) },
    { id: "b-002", auctionId: "a-001", memberId: "m-03", amount: 690000, placedAt: ist(2026, 10, 5, 19, 12) },
    { id: "b-003", auctionId: "a-001", memberId: "m-05", amount: 680000, placedAt: ist(2026, 10, 5, 19, 20) },
    { id: "b-004", auctionId: "a-001", memberId: "m-08", amount: 670000, placedAt: ist(2026, 10, 5, 19, 35) },
    { id: "b-005", auctionId: "a-001", memberId: "m-04", amount: 660000, placedAt: ist(2026, 10, 5, 19, 41) },
  ];

  /* ---------- Payouts ---------- */
  const payouts = [
    { id: "po-001", reference: "CF-PO-2026-000001", committeeId: COMMITTEE_ID, cycleNumber: 1, winnerId: "m-01",
      winningBid: null, amount: VALUE, method: "Bank Transfer", payoutDate: ist(2026, 9, 11, 15, 0), status: "COMPLETED" },
    { id: "po-002", reference: "CF-PO-2026-000002", committeeId: COMMITTEE_ID, cycleNumber: 2, winnerId: "m-04",
      winningBid: 660000, amount: 660000, method: "Bank Transfer", payoutDate: ist(2026, 10, 12, 8, 30), status: "PROCESSING" },
  ];
  payouts.filter(p => p.status === "COMPLETED").forEach(p => transactions.push({
    id: `TXN-${pad(txnNo++, 5)}`, date: p.payoutDate, memberId: p.winnerId, type: "Payout",
    direction: "out", amount: p.amount, cycleNumber: p.cycleNumber, status: "COMPLETED", reference: p.reference,
  }));
  // A correction is a NEW record that points at the old value — the original is never overwritten.
  transactions.push({
    id: `TXN-${pad(txnNo++, 5)}`, date: ist(2026, 9, 12, 10, 0), memberId: "m-11", type: "Correction",
    direction: "in", amount: 1000, cycleNumber: 1, status: "COMPLETED", reference: payRef(111),
    correction: { previousValue: 29000, newValue: 30000, changedBy: "Vikram Malhotra", reason: "Amount was entered as ₹29,000 by mistake." },
  });

  /* ---------- Disputes ---------- */
  const karan = contributions.find(c => c.id === "ct-2-m-10");
  const disputes = [
    { id: "d-001", paymentRef: karan.paymentRef, memberId: "m-10", amount: 27500, cycleNumber: 2,
      reason: "Payment not recorded", status: "UNDER_REVIEW", createdAt: ist(2026, 10, 11, 13, 0), updatedAt: ist(2026, 10, 11, 18, 20),
      evidenceIds: karan.evidenceIds,
      history: [
        { at: ist(2026, 10, 11, 13, 0), by: "Karan Singh", role: "member", action: "RAISED", message: "I made this payment on 10 October." },
        { at: ist(2026, 10, 11, 18, 20), by: "Vikram Malhotra", role: "organizer", action: "UNDER_REVIEW", message: "Checking the bank statement for 10 October." },
      ] },
    { id: "d-002", paymentRef: payRef(120), memberId: "m-20", amount: 30000, cycleNumber: 1,
      reason: "Wrong amount shown", status: "RESOLVED", createdAt: ist(2026, 9, 14, 9, 0), updatedAt: ist(2026, 9, 15, 11, 0),
      evidenceIds: [],
      history: [
        { at: ist(2026, 9, 14, 9, 0), by: "Neha Agarwal", role: "member", action: "RAISED", message: "Receipt shows a different amount than I paid." },
        { at: ist(2026, 9, 15, 11, 0), by: "Vikram Malhotra", role: "organizer", action: "RESOLVED", message: "Receipt corrected. See the correction on the transactions page." },
      ] },
  ];

  /* ---------- Audit log (newest first is applied in the API) ---------- */
  const A = (at, by, role, action, entity, entityId, description) => ({ at, by, role, action, entity, entityId, description });
  const auditRaw = [
    A(ist(2026, 8, 25, 10, 0), "Vikram Malhotra", "organizer", "CREATE_COMMITTEE", "Committee", "c-001", "Created committee Friends Savings 2026 (₹7,20,000, 24 members)."),
    A(ist(2026, 8, 25, 10, 10), "Vikram Malhotra", "organizer", "UPDATE_COMMITTEE_RULE", "Committee", "c-001", "Set discount rule to Equal discount distribution."),
    A(ist(2026, 8, 26, 11, 0), "Vikram Malhotra", "organizer", "ADD_MEMBER", "Member", "m-02", "Added Rahul Sharma to Friends Savings 2026."),
    A(ist(2026, 9, 11, 15, 0), "Vikram Malhotra", "organizer", "RECORD_PAYOUT", "Payout", "CF-PO-2026-000001", "Recorded Cycle 1 payout of ₹7,20,000 to Vikram Malhotra (organizer allocation)."),
    A(ist(2026, 9, 12, 10, 0), "Vikram Malhotra", "organizer", "REVERSE_PAYMENT", "Payment", payRef(111), "Corrected amount from ₹29,000 to ₹30,000. Reason: entered by mistake."),
    A(ist(2026, 9, 14, 9, 0), "Neha Agarwal", "member", "RAISE_DISPUTE", "Dispute", "d-002", "Raised a dispute on " + payRef(120) + "."),
    A(ist(2026, 9, 15, 11, 0), "Vikram Malhotra", "organizer", "RESOLVE_DISPUTE", "Dispute", "d-002", "Resolved dispute d-002."),
    A(ist(2026, 10, 1, 9, 0), "Vikram Malhotra", "organizer", "CREATE_AUCTION", "Auction", "a-001", "Created auction for Cycle 2."),
    A(ist(2026, 10, 5, 19, 5), "Rahul Sharma", "member", "SUBMIT_BID", "Auction", "a-001", "Bid ₹7,00,000."),
    A(ist(2026, 10, 5, 19, 41), "Priya Nair", "member", "SUBMIT_BID", "Auction", "a-001", "Bid ₹6,60,000."),
    A(ist(2026, 10, 5, 20, 0), "Vikram Malhotra", "organizer", "CLOSE_AUCTION", "Auction", "a-001", "Closed auction for Cycle 2."),
    A(ist(2026, 10, 5, 20, 2), "Vikram Malhotra", "organizer", "SELECT_WINNER", "Auction", "a-001", "Priya Nair won with ₹6,60,000. Discount ₹60,000; adjusted contribution ₹27,500."),
    A(ist(2026, 10, 10, 10, 15), "Rahul Sharma", "member", "SUBMIT_PAYMENT", "Payment", payRef(291), "Submitted ₹27,500 for Cycle 2."),
    A(ist(2026, 10, 10, 11, 2), "Vikram Malhotra", "organizer", "VERIFY_PAYMENT", "Payment", payRef(291), "Verified payment of ₹27,500."),
    A(ist(2026, 10, 11, 10, 0), "Vikram Malhotra", "organizer", "REJECT_PAYMENT", "Payment", payRef(304), "Rejected: transaction reference does not match the bank record."),
    A(ist(2026, 10, 11, 13, 0), "Karan Singh", "member", "RAISE_DISPUTE", "Dispute", "d-001", "Raised a dispute on " + karan.paymentRef + "."),
    A(ist(2026, 10, 12, 8, 30), "Vikram Malhotra", "organizer", "CREATE_PAYOUT", "Payout", "CF-PO-2026-000002", "Created Cycle 2 payout of ₹6,60,000 for Priya Nair."),
  ];
  const auditLogs = auditRaw.map((a, i) => ({ id: `al-${pad(i + 1, 3)}`, ...a }));

  /* ---------- Notifications ---------- */
  const notifications = [
    { id: "n-001", userId: "u-mem", type: "payment", message: `Your payment ${payRef(291)} has been verified.`, createdAt: ist(2026, 10, 10, 11, 2), read: false },
    { id: "n-002", userId: "u-mem", type: "auction", message: "Your bid was not the winning bid.", createdAt: ist(2026, 10, 5, 20, 2), read: true },
    { id: "n-003", userId: "u-mem", type: "due", message: "Your Cycle 3 contribution will be due on 10 Nov 2026.", createdAt: ist(2026, 10, 12, 8, 0), read: false },
    { id: "n-004", userId: "u-org", type: "payment", message: "4 payments are waiting for your verification.", createdAt: ist(2026, 10, 12, 8, 0), read: false },
    { id: "n-005", userId: "u-org", type: "dispute", message: "Karan Singh raised a dispute on a Cycle 2 payment.", createdAt: ist(2026, 10, 11, 13, 0), read: false },
    { id: "n-006", userId: "u-org", type: "payout", message: "The Cycle 2 payout to Priya Nair is processing.", createdAt: ist(2026, 10, 12, 8, 30), read: true },
  ];

  return { users: MOCK_USERS, members, committees, cycles, contributions, evidence, auctions, bids, payouts, transactions, disputes, auditLogs, notifications };
}
