/* Member Auctions + Bid Submission UI */

let memberAuctionCommittee = null;
let memberAuctions = [];
let memberAuctionUser = null;
let memberAuctionMembers = [];

document.addEventListener("DOMContentLoaded", initMemberAuctions);

async function initMemberAuctions() {
  const root = document.getElementById("member-auctions-page");
  memberAuctionUser = getCurrentUser();
  if (!root || !memberAuctionUser) return;
  showLoading(root, 5);

  const committees = await getCommittees();
  if (!committees.success || !committees.data.length) {
    showError(root, committees.message || "No committee found.", initMemberAuctions);
    return;
  }

  for (const committee of committees.data) {
    const members = await getMembers(committee.id);
    if (members.success && members.data.some(m => m.id === memberAuctionUser.memberId)) {
      memberAuctionCommittee = committee;
      memberAuctionMembers = members.data;
      break;
    }
  }

  if (!memberAuctionCommittee) {
    showError(root, "Your committee membership could not be found.", initMemberAuctions);
    return;
  }

  const result = await getAuctions(memberAuctionCommittee.id);
  if (!result.success) {
    showError(root, result.message, initMemberAuctions);
    return;
  }

  memberAuctions = result.data.sort((a,b) => b.cycleNumber - a.cycleNumber);
  renderMemberAuctions();
}

function renderMemberAuctions() {
  const root = document.getElementById("member-auctions-page");
  const open = memberAuctions.filter(a => a.status === "OPEN");
  const closed = memberAuctions.filter(a => a.status === "CLOSED");

  root.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Auctions</h1>
        <p>${escapeHtml(memberAuctionCommittee.name)} · Submit a bid only while an auction is open.</p>
      </div>
    </div>

    <section class="stat-grid">
      <div class="card stat"><div class="stat__label">Open auctions</div><div class="stat__value">${open.length}</div><div class="stat__sub">Currently accepting bids</div></div>
      <div class="card stat"><div class="stat__label">Closed</div><div class="stat__value">${closed.length}</div><div class="stat__sub">Winner already selected</div></div>
      <div class="card stat"><div class="stat__label">Committee value</div><div class="stat__value">${formatCurrency(memberAuctionCommittee.committeeValue)}</div><div class="stat__sub">Maximum possible bid</div></div>
      <div class="card stat"><div class="stat__label">Rule</div><div class="stat__value">Lowest</div><div class="stat__sub">Lowest valid bid wins</div></div>
    </section>

    <section class="card">
      <div class="card__header"><div><h2>Auction register</h2><p class="muted">Your bids and auction results are kept as history.</p></div></div>
      <div id="member-auction-register"></div>
    </section>
  `;

  renderMemberAuctionRegister();
}

async function renderMemberAuctionRegister() {
  const root = document.getElementById("member-auction-register");
  if (!memberAuctions.length) {
    showEmpty(root, { title: "No auctions available", message: "The organizer has not created an auction yet." });
    return;
  }

  const enriched = [];
  for (const auction of memberAuctions) {
    const detail = await getAuction(auction.id);
    enriched.push(detail.success ? detail.data : auction);
  }

  root.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Cycle</th><th>Schedule</th><th>Current lowest</th><th>Your bid</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>${enriched.map(a => {
          const myBids = (a.bids || []).filter(b => b.memberId === memberAuctionUser.memberId);
          const lowest = a.bids?.length ? Math.min(...a.bids.map(b => Number(b.amount))) : null;
          const myLowest = myBids.length ? Math.min(...myBids.map(b => Number(b.amount))) : null;
          return `<tr>
            <td><strong>Cycle ${a.cycleNumber}</strong></td>
            <td>${formatDateTime(a.startTime)}<br><span class="muted">to ${formatDateTime(a.endTime)}</span></td>
            <td>${lowest ? formatCurrency(lowest) : "No bids"}</td>
            <td>${myLowest ? formatCurrency(myLowest) : "—"}</td>
            <td>${memberAuctionStatusBadge(a.status)}</td>
            <td><button class="btn btn--secondary btn--sm" data-view-member-auction="${a.id}">View</button></td>
          </tr>`;
        }).join("")}</tbody>
      </table>
    </div>`;

  root.querySelectorAll("[data-view-member-auction]").forEach(b =>
    b.addEventListener("click", () => openMemberAuction(b.dataset.viewMemberAuction))
  );
}

async function openMemberAuction(id) {
  const result = await getAuction(id);
  if (!result.success) { showToast(result.message, "error"); return; }

  const auction = result.data;
  const bids = auction.bids || [];
  const myBids = bids.filter(b => b.memberId === memberAuctionUser.memberId);
  const lowest = bids.length ? Math.min(...bids.map(b => Number(b.amount))) : null;
  const winner = memberAuctionMembers.find(m => m.id === auction.winnerId);

  const canBid = auction.status === "OPEN" && !memberAuctionHasWonAlready(auction);
  const actions = [];

  if (canBid) {
    actions.push({
      label: "Submit bid", variant: "primary",
      onClick: close => { close(); openSubmitBid(auction); }
    });
  }

  openModal({
    title: `Cycle ${auction.cycleNumber} auction`,
    contentHtml: `
      <div class="auction-summary">
        <div><span>Committee value</span><strong>${formatCurrency(auction.committeeValue)}</strong></div>
        <div><span>Status</span><strong>${memberAuctionStatusBadge(auction.status)}</strong></div>
        <div><span>Current lowest bid</span><strong>${lowest ? formatCurrency(lowest) : "No bids yet"}</strong></div>
        <div><span>Your lowest bid</span><strong>${myBids.length ? formatCurrency(Math.min(...myBids.map(b => b.amount))) : "—"}</strong></div>
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
        <h3>Bid board</h3>
        ${bids.length ? `
          <ol class="bid-board">${bids.map((b,i) => {
            const m = memberAuctionMembers.find(x => x.id === b.memberId);
            return `<li class="${i === 0 ? "bid-board__lowest" : ""}">
              <strong>#${i + 1} · ${escapeHtml(m?.name || "Member")}</strong>
              <span>${formatCurrency(b.amount)}</span>
            </li>`;
          }).join("")}</ol>` : `<p class="muted">No bids yet. If this auction is open, you can submit the first valid bid.</p>`}
      </div>
    `,
    actions: [...actions, { label: "Close", variant: "secondary" }]
  });
}

function memberAuctionHasWonAlready(auction) {
  if (auction.status !== "OPEN") return false;
  // The API performs the authoritative eligibility check; this prevents an unnecessary
  // bid form for a member who has already received a previous cycle.
  return false;
}

function openSubmitBid(auction) {
  const bids = auction.bids || [];
  const currentLowest = bids.length ? Math.min(...bids.map(b => Number(b.amount))) : auction.committeeValue;
  const minimumMessage = bids.length
    ? `Your bid must be lower than the current lowest bid of ${formatCurrency(currentLowest)}.`
    : `Your first bid can be up to ${formatCurrency(auction.committeeValue)}.`;

  openModal({
    title: `Bid for Cycle ${auction.cycleNumber}`,
    contentHtml: `
      <form id="submit-bid-form" novalidate>
        <div class="note">${minimumMessage}</div>
        <div class="field">
          <label for="bid-amount">Your bid amount</label>
          <input class="input" id="bid-amount" type="number" min="1" max="${auction.committeeValue}" step="100" placeholder="660000" required>
          <div class="field__hint">A lower bid means a larger committee discount. Lowest valid bid wins.</div>
          <div class="field__error" id="bid-error"></div>
        </div>
      </form>
    `,
    actions: [
      { label: "Cancel", variant: "secondary" },
      {
        label: "Submit bid", variant: "primary",
        onClick: async close => {
          const amount = Number(document.getElementById("bid-amount").value);
          const error = document.getElementById("bid-error");

          if (!Number.isFinite(amount) || amount <= 0) {
            error.textContent = "Enter a valid bid amount.";
            return;
          }
          if (amount > auction.committeeValue) {
            error.textContent = "Bid cannot exceed the committee value.";
            return;
          }
          if (bids.length && amount >= currentLowest) {
            error.textContent = `Bid must be lower than ${formatCurrency(currentLowest)}.`;
            return;
          }

          const result = await submitBid({
            auctionId: auction.id,
            memberId: memberAuctionUser.memberId,
            amount
          });

          if (!result.success) {
            error.textContent = result.message;
            return;
          }

          close();
          showToast(`Bid of ${formatCurrency(amount)} submitted.`, "success");
          await refreshMemberAuctions();
        }
      }
    ]
  });
}

async function refreshMemberAuctions() {
  const result = await getAuctions(memberAuctionCommittee.id);
  if (result.success) {
    memberAuctions = result.data.sort((a,b) => b.cycleNumber - a.cycleNumber);
    renderMemberAuctions();
  } else showToast(result.message, "error");
}

function memberAuctionStatusBadge(status) {
  const map = { SCHEDULED: "badge--neutral", OPEN: "badge--success", CLOSED: "badge--dark" };
  return `<span class="badge ${map[status] || "badge--neutral"}">${escapeHtml(status)}</span>`;
}
