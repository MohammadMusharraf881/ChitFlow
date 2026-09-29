/* auth.js — sign-in, sign-out, and role guards.

   !!! DEVELOPMENT ONLY — THIS IS NOT REAL AUTHENTICATION !!!
   The "session" is a plain object in sessionStorage. Anyone can edit it in the browser console.
   Any password is accepted. When the Node + Express backend exists, replace login() with
   POST /api/auth/login (httpOnly cookie or JWT) and let the server decide who the user is
   and what they may do. Hiding buttons by role is only user-experience polish. */

const SESSION_KEY = "chitflow_session";

function getCurrentUser() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
}

// Mirrors the API envelope: { success, data } or { success:false, message }.
async function login(email, password) {
  await delay(MOCK_LATENCY_MS);
  if (!email || !password) return fail("Enter your email and password.", "VALIDATION");
  // Read users straight from the seed so login works before any API call has run.
  const user = MOCK_USERS.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
  if (!user) return fail("No account matches that email. Try one of the demo accounts.", "UNAUTHORIZED");
  const session = { id: user.id, name: user.name, email: user.email, role: user.role, memberId: user.memberId };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return ok(session);
}

function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  window.location.href = "login.html";
}

function homePageFor(role) {
  return role === "organizer" ? "organizer-dashboard.html" : "member-dashboard.html";
}

// Called at the top of every protected page. Returns true if the page may continue to render.
function requireRole(role) {
  const user = getCurrentUser();
  if (!user) { window.location.href = "login.html"; return false; }
  if (role !== "any" && user.role !== role) { window.location.href = homePageFor(user.role); return false; }
  return true;
}

// Wires up pages/login.html
function initLoginPage() {
  const existing = getCurrentUser();
  if (existing) { window.location.href = homePageFor(existing.role); return; }

  const form = document.getElementById("login-form");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const errorBox = document.getElementById("login-error");
  const submitBtn = document.getElementById("login-submit");

  document.querySelectorAll("[data-demo-email]").forEach(btn => {
    btn.addEventListener("click", () => {
      emailInput.value = btn.dataset.demoEmail;
      passwordInput.value = "demo-password";
      passwordInput.focus();
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.classList.add("hidden");
    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in…";
    const result = await login(emailInput.value, passwordInput.value);
    if (result.success) {
      window.location.href = homePageFor(result.data.role);
    } else {
      errorBox.textContent = result.message;
      errorBox.classList.remove("hidden");
      submitBtn.disabled = false;
      submitBtn.textContent = "Sign in";
    }
  });
}
