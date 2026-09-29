/* auth.js — mock authentication for the current frontend, ready for later backend integration. */

const SESSION_KEY = "chitflow_session";
const REGISTERED_USERS_KEY = "chitflow_registered_users";
const AUTH_BACKEND_ENABLED = false;
const AUTH_API_BASE = "http://localhost:5000/api";

function getCurrentUser() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY));
  } catch (e) {
    return null;
  }
}

function getRegisteredUsers() {
  try {
    return JSON.parse(localStorage.getItem(REGISTERED_USERS_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveRegisteredUsers(users) {
  localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(users));
}

async function backendRequest(path, body) {
  try {
    const res = await fetch(`${AUTH_API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const result = await res.json();
    return result;
  } catch (error) {
    return fail(
      "Backend is not reachable. Start the ChitFlow API or keep mock authentication enabled.",
      "NETWORK"
    );
  }
}

async function login(email, password) {
  await delay(MOCK_LATENCY_MS);

  if (!email.trim() || !password) {
    return fail("Enter your email and password.", "VALIDATION");
  }

  const normalized = email.trim().toLowerCase();

  if (AUTH_BACKEND_ENABLED) {
    const result = await backendRequest("/auth/login", {
      email: normalized,
      password
    });

    if (!result.success) return result;

    const user = result.data.user;

    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        ...user,
        token: result.data.token
      })
    );

    return ok(user);
  }

  // Demo users have fixed demo passwords.
  const demoUser = MOCK_USERS.find(
    user => user.email.toLowerCase() === normalized
  );

  if (demoUser) {
    if (password !== "demo-password") {
      return fail("Incorrect password.", "UNAUTHORIZED");
    }

    const session = {
      id: demoUser.id,
      name: demoUser.name,
      email: demoUser.email,
      role: demoUser.role,
      memberId: demoUser.memberId || null
    };

    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return ok(session);
  }

  // Locally-created accounts have their password stored only for this
  // frontend demo. This MUST be replaced by backend password hashing later.
  const registeredUser = getRegisteredUsers().find(
    user => user.email.toLowerCase() === normalized
  );

  if (!registeredUser) {
    return fail(
      "Account does not exist. Please create an account first.",
      "NOT_FOUND"
    );
  }

  if (registeredUser.password !== password) {
    return fail("Incorrect password.", "UNAUTHORIZED");
  }

  const session = {
    id: registeredUser.id,
    name: registeredUser.name,
    email: registeredUser.email,
    role: registeredUser.role,
    memberId: registeredUser.memberId || null
  };

  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return ok(session);
}

async function registerAccount(data) {
  const name = data.name.trim();
  const email = data.email.trim().toLowerCase();
  const password = data.password;
  const confirmPassword = data.confirmPassword;
  const role = data.role;

  if (!name || !email || !password || !confirmPassword) {
    return fail("Complete all required fields.", "VALIDATION");
  }

  if (password.length < 8) {
    return fail("Password must contain at least 8 characters.", "VALIDATION");
  }

  if (password !== confirmPassword) {
    return fail("Passwords do not match.", "VALIDATION");
  }

  if (!["organizer", "member"].includes(role)) {
    return fail("Choose a valid account type.", "VALIDATION");
  }

  if (AUTH_BACKEND_ENABLED) {
    return backendRequest("/auth/register", {
      name,
      email,
      password,
      role
    });
  }

  const users = getRegisteredUsers();

  const existsInDemoUsers = MOCK_USERS.some(
    user => user.email.toLowerCase() === email
  );

  const existsInLocalUsers = users.some(
    user => user.email.toLowerCase() === email
  );

  if (existsInDemoUsers || existsInLocalUsers) {
    return fail("An account with this email already exists.", "DUPLICATE");
  }

  const user = {
    id: `u-local-${Date.now()}`,
    name,
    email,
    role,
    password, // frontend demo only; real backend will hash this
    memberId: null,
    joinedAt: new Date().toISOString().slice(0, 10)
  };

  users.push(user);
  saveRegisteredUsers(users);

  return ok({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    memberId: null,
    joinedAt: user.joinedAt
  });
}

function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  window.location.href = "login.html";
}

function homePageFor(role) {
  return role === "organizer"
    ? "organizer-dashboard.html"
    : "member-dashboard.html";
}

function requireRole(role) {
  const user = getCurrentUser();

  if (!user) {
    window.location.href = "login.html";
    return false;
  }

  if (role !== "any" && user.role !== role) {
    window.location.href = homePageFor(user.role);
    return false;
  }

  return true;
}

function showAuthCard(name) {
  document
    .getElementById("signin-card")
    ?.classList.toggle("hidden", name !== "signin");

  document
    .getElementById("register-card")
    ?.classList.toggle("hidden", name !== "register");
}

function initLoginPage() {
  const existing = getCurrentUser();

  if (existing) {
    window.location.href = homePageFor(existing.role);
    return;
  }

  const form = document.getElementById("login-form");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const errorBox = document.getElementById("login-error");
  const submitBtn = document.getElementById("login-submit");

  document.querySelectorAll("[data-demo-role]").forEach(btn => {
    btn.addEventListener("click", () => {
      const role = btn.dataset.demoRole;

      document
        .querySelectorAll("[data-demo-role]")
        .forEach(button => button.classList.remove("is-selected"));

      btn.classList.add("is-selected");

      emailInput.value =
        role === "organizer"
          ? "organizer@chitflow.test"
          : "member@chitflow.test";

      passwordInput.value = "demo-password";
      errorBox.classList.add("hidden");
      passwordInput.focus();
    });
  });

  document.getElementById("show-register")?.addEventListener("click", () => {
    showAuthCard("register");
  });

  document.getElementById("show-signin")?.addEventListener("click", () => {
    showAuthCard("signin");
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();

    errorBox.classList.add("hidden");
    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in…";

    const result = await login(
      emailInput.value,
      passwordInput.value
    );

    if (result.success) {
      window.location.href = homePageFor(result.data.role);
      return;
    }

    errorBox.textContent = result.message;
    errorBox.classList.remove("hidden");

    submitBtn.disabled = false;
    submitBtn.textContent = "Sign in";
  });

  const registerForm = document.getElementById("register-form");

  registerForm?.addEventListener("submit", async event => {
    event.preventDefault();

    const error = document.getElementById("register-error");
    const button = document.getElementById("register-submit");

    error.classList.add("hidden");
    button.disabled = true;
    button.textContent = "Creating account…";

    const result = await registerAccount({
      name: document.getElementById("register-name").value,
      email: document.getElementById("register-email").value,
      role: document.getElementById("register-role").value,
      password: document.getElementById("register-password").value,
      confirmPassword: document.getElementById("register-confirm").value
    });

    if (result.success) {
      alert("Account created successfully. You can now sign in.");

      registerForm.reset();
      emailInput.value = result.data.email;
      passwordInput.value = "";

      document
        .querySelectorAll("[data-demo-role]")
        .forEach(button => button.classList.remove("is-selected"));

      showAuthCard("signin");
    } else {
      error.textContent = result.message;
      error.classList.remove("hidden");
    }

    button.disabled = false;
    button.textContent = "Create account";
  });
}
