/* Organizer Auctions + Bidding UI */

let auctionCommittee = null;
let organizerAuctions = [];
let auctionMembers = [];

document.addEventListener("DOMContentLoaded", initOrganizerAuctions);

async function initOrganizerAuctions() {
  const root = document.getElementById("auctions-page");
  if (!root) return;
  showLoading(root, 5);

  const committees = await getCommittees();
  if (!committees.success || !committees.data.length) {
    showError(root, committees.message || "No committee found.", initOrganizerAuctions);
    return;
  }

  auctionCommittee = committees.data[0];

  const [auctions, members] = await Promise.all([
    getAuctions(auctionCommittee.id),
    getMembers(auctionCommittee.id)
  ]);

  if (!auctions.success || !members.success) {
    showError(root, auctions.message || members.message || "Could not load auctions.", initOrganizerAuctions);
    return;
  }

  organizerAuctions = auctions.data;
  auctionMembers = members.data;
  renderOrganizerAuctions();
}

function renderOrganizerAuctions() {
  const root = document.getElementById("auctions-page");
  const open = organizerAuctions.filter(a => a.status === "OPEN");
  const scheduled = organizerAuctions.filter(a => a.status === "SCHEDULED");
  const closed = organizerAuctions.filter(a => a.status === "CLOSED");

  root.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Auctions & Bidding</h1>
        <p>${escapeHtml(auctionCommittee.name)} · Lowest valid bid wins the cycle auction.</p>
      </div>
      <button class="btn btn--primary" id="create-auction-btn">+ Create auction</button>
    </div>

    <section class="stat-grid">
      <div class="card stat"><div class="stat__label">Scheduled</div><div class="stat__value">${scheduled.length}</div><div class="stat__sub">Not accepting bids</div></div>
      <div class="card stat"><div class="stat__label">Open</div><div class="stat__value">${open.length}</div><div class="stat__sub">Members can bid</div></div>
      <div class="card stat"><div class="stat__label">Closed</div><div class="stat__value">${closed.length}</div><div class="stat__sub">Winner selected</div></div>
      <div class="card stat"><div class="stat__label">Committee value</div><div class="stat__value">${formatCurrency(auctionCommittee.committeeValue)}</div><div class="stat__sub">${auctionCommittee.totalMembers} members</div></div>
    </section>

    <section class="card">
      <div class="card__header">
        <div><h2>Auction register</h2><p class="muted">Create, open, review and close auctions.</p></div>
      </div>
      <div id="auction-register"></div>
    </section>
  `;

  document.getElementById("create-auction-btn").addEventListener("click", openCreateAuction);
  renderAuctionRegister();
}

async function renderAuctionRegister() {
  const root = document.getElementById("auction-register");
  if (!organizerAuctions.length) {
    showEmpty(root, { title: "No auctions yet", message: "Create an auction for a committee cycle." });
    return;
  }

  const rows = [...organizerAuctions].sort((a,b) => b.cycleNumber - a.cycleNumber);
  root.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Cycle</th><th>Schedule</th><th>Committee value</th><th>Lowest bid</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>${rows.map(a => `
          <tr>
            <td><strong>Cycle ${a.cycleNumber}</strong></td>
            <td>${formatDateTime(a.startTime)}<br><span class="muted">to ${formatDateTime(a.endTime)}</span></td>
            <td>${formatCurrency(a.committeeValue)}</td>
            <td>${a.winningBid ? formatCurrency(a.winningBid) : "—"}</td>
            <td>${auctionStatusBadge(a.status)}</td>
            <td><button class="btn btn--secondary btn--sm" data-open-auction="${a.id}">View</button></td>
          </tr>`).join("")}</tbody>
      </table>
    </div>`;

  root.querySelectorAll("[data-open-auction]").forEach(b =>
    b.addEventListener("click", () => openAuctionDetails(b.dataset.openAuction))
  );
}

function openCreateAuction() {
  const nextCycle = Math.max(auctionCommittee.currentCycle + 1, ...organizerAuctions.map(a => a.cycleNumber + 1));
  openModal({
    title: "Create auction",
    contentHtml: `
      <form id="create-auction-form" novalidate>
        <div class="field">
          <label for="auction-cycle">Cycle</label>
          <input class="input" id="auction-cycle" type="number" min="2" value="${nextCycle}" required>
          <div class="field__error" id="auction-cycle-error"></div>
        </div>
        <div class="form-grid">
          <div class="field">
            <label for="auction-start">Start</label>
            <input class="input" id="auction-start" type="datetime-local" required>
            <div class="field__error" id="auction-start-error"></div>
          </div>
          <div class="field">
            <label for="auction-end">End</label>
            <input class="input" id="auction-end" type="datetime-local" required>
            <div class="field__error" id="auction-end-error"></div>
          </div>
        </div>
        <div class="note">The auction is created as <strong>SCHEDULED</strong>. You must explicitly open it before members can submit bids.</div>
      </form>
    `,
    actions: [
      { label: "Cancel", variant: "secondary" },
      {
        label: "Create auction", variant: "primary",
        onClick: async close => {
          const cycle = Number(document.getElementById("auction-cycle").value);
          const start = document.getElementById("auction-start").value;
          const end = document.getElementById("auction-end").value;
          const e1 = document.getElementById("auction-cycle-error");
          const e2 = document.getElementById("auction-start-error");
          const e3 = document.getElementById("auction-end-error");
          [e1,e2,e3].forEach(e => e.textContent = "");

          let valid = true;
          if (cycle < 2) { e1.textContent = "Auction bidding starts from Cycle 2."; valid = false; }
          if (!start) { e2.textContent = "Start time is required."; valid = false; }
          if (!end) { e3.textContent = "End time is required."; valid = false; }
          if (start && end && new Date(end) <= new Date(start)) { e3.textContent = "End time must be after start time."; valid = false; }
          if (organizerAuctions.some(a => a.cycleNumber === cycle)) { e1.textContent = "An auction already exists for this cycle."; valid = false; }
          if (!valid) return;

          const result = await createAuction({
            committeeId: auctionCommittee.id,
            cycleNumber: cycle,
            startTime: new Date(start).toISOString(),
            endTime: new Date(end).toISOString()
          });
          if (!result.success) { e1.textContent = result.message; return; }

          close();
          showToast(`Cycle ${cycle} auction created.`, "success");
          await refreshOrganizerAuctions();
        }
      }
    ]
  });
}

async function openAuctionDetails(id) {
  const result = await getAuction(id);
  if (!result.success) { showToast(result.message, "error"); return; }

  const auction = result.data;
  const bidRows = auction.bids || [];
  const winner = auctionMembers.find(m => m.id === auction.winnerId);

  const actionButtons = [];
  if (auction.status === "SCHEDULED") {
    actionButtons.push({
      label: "Open for bids", variant: "primary",
      onClick: async close => {
        const openResult = await openAuction(auction.id);
        if (!openResult.success) { showToast(openResult.message, "error"); return; }
        close();
        showToast(`Cycle ${auction.cycleNumber} is now open for bids.`, "success");
        await refreshOrganizerAuctions();
      }
    });
  }

  if (auction.status === "OPEN") {
    actionButtons.push({
      label: "Close auction", variant: "danger",
      onClick: async close => {
        if (!bidRows.length) { showToast("Add at least one bid before closing.", "error"); return; }
        const closeResult = await closeAuction(auction.id);
        if (!closeResult.success) { showToast(closeResult.message, "error"); return; }
        close();
        showToast(`Auction closed. ${formatCurrency(closeResult.data.winningBid)} is the winning bid.`, "success");
        await refreshOrganizerAuctions();
      }
    });
  }

  openModal({
    title: `Cycle ${auction.cycleNumber} auction`,
    contentHtml: `
      <div class="auction-summary">
        <div><span>Committee value</span><strong>${formatCurrency(auction.committeeValue)}</strong></div>
        <div><span>Status</span><strong>${auctionStatusBadge(auction.status)}</strong></div>
        <div><span>Start</span><strong>${formatDateTime(auction.startTime)}</strong></div>
        <div><span>End</span><strong>${formatDateTime(auction.endTime)}</strong></div>
      </div>

      ${auction.status === "CLOSED" ? `
        <div class="auction-result">
          <div><span>Winner</span><strong>${escapeHtml(winner?.name || "—")}</strong></div>
          <div><span>Winning bid</span><strong>${formatCurrency(auction.winningBid)}</strong></div>
          <div><span>Discount</span><strong>${formatCurrency(auction.discount)}</strong></div>
          <div><span>Discount / member</span><strong>${formatCurrency(auction.discountPerMember)}</strong></div>
          <div class="auction-result__highlight"><span>Adjusted contribution</span><strong>${formatCurrency(auction.adjustedContribution)}</strong></div>
        </div>` : ""}

      <div class="detail-block">
        <h3>Bids (${bidRows.length})</h3>
        ${bidRows.length ? `
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Rank</th><th>Member</th><th>Bid</th><th>Placed</th></tr></thead>
              <tbody>${bidRows.map((b,i) => {
                const m = auctionMembers.find(x => x.id === b.memberId);
                return `<tr class="${i === 0 ? "bid-row--lowest" : ""}">
                  <td>${i + 1}${i === 0 ? " 🏆" : ""}</td>
                  <td>${escapeHtml(m?.name || "Unknown")}</td>
                  <td><strong>${formatCurrency(b.amount)}</strong></td>
                  <td>${formatDateTime(b.placedAt)}</td>
                </tr>`;
              }).join("")}</tbody>
            </table>
          </div>` : `<p class="muted">No bids submitted yet.</p>`}
      </div>
    `,
    actions: [...actionButtons, { label: "Close", variant: "secondary" }]
  });
}

async function refreshOrganizerAuctions() {
  const result = await getAuctions(auctionCommittee.id);
  if (result.success) {
    organizerAuctions = result.data;
    renderOrganizerAuctions();
  } else showToast(result.message, "error");
}

function auctionStatusBadge(status) {
  const map = { SCHEDULED: "badge--neutral", OPEN: "badge--success", CLOSED: "badge--dark" };
  return `<span class="badge ${map[status] || "badge--neutral"}">${escapeHtml(status)}</span>`;
}
