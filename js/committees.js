/* committees.js — real committee management UI using the existing API layer. */

let committeesCache = [];

 document.addEventListener("DOMContentLoaded", () => {
  loadCommittees();
  document.getElementById("create-committee-btn")?.addEventListener("click", openCreateCommitteeModal);
  document.getElementById("committee-search")?.addEventListener("input", renderFilteredCommittees);
  document.getElementById("committee-status")?.addEventListener("change", renderFilteredCommittees);
});

async function loadCommittees() {
  const list = document.getElementById("committee-list");
  if (!list) return;
  showLoading(list, 5);

  const result = await getCommittees();
  if (!result.success) {
    showError(list, result.message, loadCommittees);
    return;
  }

  committeesCache = result.data;
  renderCommitteeStats(committeesCache);
  renderFilteredCommittees();
}

function renderCommitteeStats(committees) {
  const stats = document.getElementById("committee-stats");
  const active = committees.filter(c => c.status === "ACTIVE");
  const members = committees.reduce((sum, c) => sum + Number(c.totalMembers || 0), 0);
  const value = committees.reduce((sum, c) => sum + Number(c.committeeValue || 0), 0);

  stats.innerHTML = `
    <div class="card stat">
      <div class="stat__label">Total committees</div>
      <div class="stat__value">${committees.length}</div>
      <div class="stat__sub">${active.length} active</div>
    </div>
    <div class="card stat">
      <div class="stat__label">Active members</div>
      <div class="stat__value">${members}</div>
      <div class="stat__sub">Across all committees</div>
    </div>
    <div class="card stat">
      <div class="stat__label">Total committee value</div>
      <div class="stat__value">${formatCurrency(value)}</div>
      <div class="stat__sub">Configured committee value</div>
    </div>
    <div class="card stat">
      <div class="stat__label">Current cycles</div>
      <div class="stat__value">${committees.reduce((sum, c) => sum + Number(c.currentCycle || 0), 0)}</div>
      <div class="stat__sub">Progress across committees</div>
    </div>`;
}

function renderFilteredCommittees() {
  const query = String(document.getElementById("committee-search")?.value || "").trim().toLowerCase();
  const status = document.getElementById("committee-status")?.value || "ALL";
  let rows = committeesCache.filter(c => status === "ALL" || c.status === status);

  if (query) {
    rows = rows.filter(c => `${c.name} ${c.description || ""}`.toLowerCase().includes(query));
  }

  renderCommitteeTable(rows);
}

function renderCommitteeTable(committees) {
  const container = document.getElementById("committee-list");
  if (!committees.length) {
    showEmpty(container, {
      title: "No committees found",
      message: "Try a different search or create a new committee.",
      actionLabel: "Create committee",
      onAction: openCreateCommitteeModal,
    });
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Committee</th>
            <th>Members</th>
            <th>Base contribution</th>
            <th>Committee value</th>
            <th>Cycle</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${committees.map(c => `
            <tr>
              <td>
                <div class="committee-name">${escapeHtml(c.name)}</div>
                <div class="committee-description">${escapeHtml(c.description || "No description")}</div>
              </td>
              <td>${Number(c.totalMembers || 0)}</td>
              <td>${formatCurrency(c.baseContribution)}</td>
              <td>${formatCurrency(c.committeeValue)}</td>
              <td>${Number(c.currentCycle || 0)} / ${Number(c.durationCycles || 0)}</td>
              <td>${statusBadge(c.status)}</td>
              <td>
                <a class="btn btn--secondary btn--sm" href="committee-details.html?id=${encodeURIComponent(c.id)}">View</a>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function openCreateCommitteeModal() {
  const content = `
    <form id="create-committee-form" novalidate>
      <div id="committee-form-message" class="form-message" hidden></div>
      <div class="field">
        <label for="committee-name">Committee name</label>
        <input class="input" id="committee-name" name="name" required placeholder="e.g. Friends Savings 2027">
      </div>
      <div class="field">
        <label for="committee-description">Description</label>
        <textarea class="textarea" id="committee-description" name="description" placeholder="What is this committee for?"></textarea>
      </div>
      <div class="form-grid">
        <div class="field">
          <label for="committee-members">Members</label>
          <input class="input" id="committee-members" name="totalMembers" type="number" min="2" value="24" required>
        </div>
        <div class="field">
          <label for="committee-base">Base contribution (₹)</label>
          <input class="input" id="committee-base" name="baseContribution" type="number" min="1" value="30000" required>
        </div>
        <div class="field">
          <label for="committee-duration">Duration (cycles)</label>
          <input class="input" id="committee-duration" name="durationCycles" type="number" min="2" value="24" required>
        </div>
        <div class="field">
          <label for="committee-start">Start date</label>
          <input class="input" id="committee-start" name="startDate" type="date" required>
        </div>
        <div class="field field--full">
          <label for="committee-rule">Discount distribution rule</label>
          <select class="select" id="committee-rule" name="discountRule">
            <option value="EQUAL_DISTRIBUTION">Equal distribution among members</option>
          </select>
          <div class="field__hint">This is configurable for the committee. ChitFlow does not assume this rule is universal.</div>
        </div>
      </div>
      <div class="committee-calculator" id="committee-calculator">
        <span>Committee value</span>
        <strong id="calculated-value">₹7,20,000</strong>
        <small>Members × base contribution</small>
      </div>
    </form>`;

  const close = openModal({
    title: "Create committee",
    contentHtml: content,
    actions: [
      { label: "Cancel", variant: "secondary" },
      { label: "Create committee", variant: "primary", onClick: async (closeModal) => {
        const form = document.getElementById("create-committee-form");
        const message = document.getElementById("committee-form-message");
        const data = Object.fromEntries(new FormData(form).entries());
        data.totalMembers = Number(data.totalMembers);
        data.baseContribution = Number(data.baseContribution);
        data.durationCycles = Number(data.durationCycles);
        data.committeeValue = calculateCommitteeValue(data.totalMembers, data.baseContribution);
        data.currentCycle = 0;
        data.status = "ACTIVE";
        data.paymentDeadlineDay = 10;
        data.auctionFrequency = "Monthly";
        data.firstCycleRule = "ORGANIZER_ALLOCATION";

        if (!data.name.trim() || data.totalMembers < 2 || data.baseContribution <= 0 || data.durationCycles < 2 || !data.startDate) {
          message.hidden = false;
          message.textContent = "Please fill all required fields with valid values.";
          return;
        }

        const button = [...document.querySelectorAll(".modal__footer .btn")].find(b => b.textContent.includes("Create committee"));
        if (button) { button.disabled = true; button.textContent = "Creating..."; }

        const result = await createCommittee(data);
        if (!result.success) {
          message.hidden = false;
          message.textContent = result.message;
          if (button) { button.disabled = false; button.textContent = "Create committee"; }
          return;
        }

        closeModal();
        showToast("Committee created successfully.", "success");
        await loadCommittees();
      } },
    ],
  });

  const start = document.getElementById("committee-start");
  if (start) start.value = new Date().toISOString().slice(0, 10);

  const updateValue = () => {
    const members = Number(document.getElementById("committee-members")?.value || 0);
    const base = Number(document.getElementById("committee-base")?.value || 0);
    const value = calculateCommitteeValue(members, base);
    const output = document.getElementById("calculated-value");
    if (output) output.textContent = formatCurrency(value);
  };
  document.getElementById("committee-members")?.addEventListener("input", updateValue);
  document.getElementById("committee-base")?.addEventListener("input", updateValue);
  updateValue();

  return close;
}
