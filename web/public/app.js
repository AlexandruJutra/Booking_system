const slotsEl = document.getElementById("slots");
const form = document.getElementById("booking-form");
const messageEl = document.getElementById("message");
const selectedLabel = document.getElementById("selected-slot-label");
const emailInput = document.getElementById("email");

// --- Cognito authentication ---------------------------------------

const {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
} = window.AmazonCognitoIdentity || {};

const authMessageEl = document.getElementById("auth-message");
const loggedOutEl = document.getElementById("auth-logged-out");
const loggedInEl = document.getElementById("auth-logged-in");
const userEmailEl = document.getElementById("user-email");
const bookingsView = document.getElementById("bookings-view");
const bookingsListEl = document.getElementById("bookings-list");

let userPool = null;
let idToken = null;
let currentEmail = null;
let pendingSignupEmail = null;

function authConfigured() {
  const cfg = window.AUTH_CONFIG || {};
  return (
    CognitoUserPool &&
    cfg.userPoolId &&
    cfg.clientId &&
    !cfg.userPoolId.includes("PLACEHOLDER") &&
    !cfg.clientId.includes("PLACEHOLDER")
  );
}

function showAuthMessage(text, type) {
  authMessageEl.textContent = text;
  authMessageEl.className = text ? `message show ${type}` : "message";
}

function showAuthForm(name) {
  ["signin", "signup", "confirm"].forEach((f) => {
    document.getElementById(`${f}-form`).classList.toggle("hidden", f !== name);
  });
  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === name);
  });
}

function setLoggedIn(email) {
  currentEmail = email;
  loggedOutEl.classList.add("hidden");
  loggedInEl.classList.remove("hidden");
  userEmailEl.textContent = email;
  bookingsView.classList.remove("hidden");
  loadBookings();
}

function setLoggedOut() {
  idToken = null;
  currentEmail = null;
  loggedInEl.classList.add("hidden");
  loggedOutEl.classList.remove("hidden");
  bookingsView.classList.add("hidden");
}

function restoreSession() {
  const user = userPool.getCurrentUser();
  if (!user) return;
  user.getSession((err, session) => {
    if (err || !session || !session.isValid()) return;
    idToken = session.getIdToken().getJwtToken();
    setLoggedIn(session.getIdToken().payload.email || user.getUsername());
  });
}

function initAuth() {
  if (!authConfigured()) {
    showAuthMessage(
      "Sign-in is not configured yet. Deploy the stack to enable accounts.",
      "error"
    );
    document
      .querySelectorAll("#auth-logged-out .btn, #auth-logged-out input")
      .forEach((el) => (el.disabled = true));
    return;
  }

  const cfg = window.AUTH_CONFIG;
  userPool = new CognitoUserPool({
    UserPoolId: cfg.userPoolId,
    ClientId: cfg.clientId,
  });
  restoreSession();
}

// Tab switching
document.querySelectorAll(".auth-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    showAuthMessage("", "");
    showAuthForm(tab.dataset.tab);
  });
});

// Sign up
document.getElementById("signup-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;

  userPool.signUp(
    email,
    password,
    [new CognitoUserAttribute({ Name: "email", Value: email })],
    null,
    (err) => {
      if (err) {
        showAuthMessage(err.message || "Sign-up failed.", "error");
        return;
      }
      pendingSignupEmail = email;
      showAuthForm("confirm");
      showAuthMessage("Check your email for a verification code.", "success");
    }
  );
});

// Confirm account
document.getElementById("confirm-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const code = document.getElementById("confirm-code").value.trim();
  const user = new CognitoUser({ Username: pendingSignupEmail, Pool: userPool });

  user.confirmRegistration(code, true, (err) => {
    if (err) {
      showAuthMessage(err.message || "Verification failed.", "error");
      return;
    }
    showAuthForm("signin");
    showAuthMessage("Account verified! You can now sign in.", "success");
  });
});

// Sign in
document.getElementById("signin-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const email = document.getElementById("signin-email").value.trim();
  const password = document.getElementById("signin-password").value;

  const user = new CognitoUser({ Username: email, Pool: userPool });
  const authDetails = new AuthenticationDetails({
    Username: email,
    Password: password,
  });

  user.authenticateUser(authDetails, {
    onSuccess: (session) => {
      idToken = session.getIdToken().getJwtToken();
      setLoggedIn(session.getIdToken().payload.email || email);
      showAuthMessage("", "");
    },
    onFailure: (err) => {
      if (err && err.code === "UserNotConfirmedException") {
        pendingSignupEmail = email;
        showAuthForm("confirm");
        showAuthMessage("Please verify your account first.", "error");
        return;
      }
      showAuthMessage(err.message || "Sign-in failed.", "error");
    },
  });
});

// Sign out
document.getElementById("signout-btn").addEventListener("click", () => {
  const user = userPool && userPool.getCurrentUser();
  if (user) user.signOut();
  setLoggedOut();
  showAuthForm("signin");
});

// --- Booking -------------------------------------------------------

let selectedSlotId = null;
let selectedSlot = null;

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = `message show ${type}`;
}

function formatDay(isoDate) {
  return new Date(isoDate + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

// GET /slots (Public)
async function loadSlots() {
  slotsEl.innerHTML = '<p class="muted">Loading available slots…</p>';
  try {
    const res = await fetch("/slots");
    if (!res.ok) throw new Error("Failed to load slots");
    const { slots } = await res.json();

    if (!slots.length) {
      slotsEl.innerHTML = '<p class="muted">No slots available right now.</p>';
      return;
    }

    slotsEl.innerHTML = "";
    let currentDay = null;
    for (const slot of slots) {
      if (slot.date !== currentDay) {
        currentDay = slot.date;
        const day = document.createElement("div");
        day.className = "slot-day";
        day.textContent = formatDay(slot.date);
        slotsEl.appendChild(day);
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slot";
      btn.textContent = slot.time;
      btn.dataset.id = slot.id;
      btn.addEventListener("click", () => selectSlot(slot, btn));
      slotsEl.appendChild(btn);
    }
  } catch (err) {
    slotsEl.innerHTML =
      '<p class="muted">Could not load slots. Is the server running?</p>';
  }
}

function selectSlot(slot, btn) {
  selectedSlotId = slot.id;
  selectedSlot = slot;
  document
    .querySelectorAll(".slot.selected")
    .forEach((el) => el.classList.remove("selected"));
  btn.classList.add("selected");
  selectedLabel.textContent = `${formatDay(slot.date)} at ${slot.time}`;
}

function escapeHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]
  );
}

// GET /bookings (Requires a Cognito ID token)
async function loadBookings() {
  if (!idToken) return;
  bookingsListEl.innerHTML = '<p class="muted">Loading reservations…</p>';
  try {
    const res = await fetch("/bookings", {
      headers: { Authorization: `Bearer ${idToken}` },
    });

    if (res.status === 401) {
      bookingsListEl.innerHTML =
        '<p class="muted">Your session expired. Please sign in again.</p>';
      return;
    }
    if (!res.ok) throw new Error("Failed to load bookings");

    const { bookings } = await res.json();
    if (!bookings.length) {
      bookingsListEl.innerHTML = '<p class="muted">No reservations yet.</p>';
      return;
    }

    const rows = bookings
      .map(
        (b) => `
        <tr>
          <td>${escapeHtml(b.name)}</td>
          <td>${escapeHtml(b.email)}</td>
          <td>${escapeHtml(b.slotId)}</td>
          <td>${escapeHtml(b.reason || "")}</td>
          <td>${b.createdAt ? new Date(b.createdAt).toLocaleString() : ""}</td>
        </tr>`
      )
      .join("");

    bookingsListEl.innerHTML = `
      <table class="bookings-table">
        <thead>
          <tr>
            <th>Name</th><th>Email</th><th>Slot</th><th>Reason</th><th>Booked at</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  } catch (err) {
    bookingsListEl.innerHTML =
      '<p class="muted">Could not load reservations.</p>';
  }
}

// POST /bookings (Public — no sign-in required)
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!selectedSlotId) {
    showMessage("Please choose a time slot first.", "error");
    return;
  }

  const name = document.getElementById("name").value.trim();
  const email = emailInput.value.trim();
  const reason = document.getElementById("reason").value.trim();

  try {
    const res = await fetch("/bookings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ slotId: selectedSlotId, name, email, reason }),
    });

    const data = await res.json();

    if (!res.ok) {
      showMessage(data.error || "Booking failed.", "error");
      return;
    }

    showMessage(
      `✅ Booked! See you on ${formatDay(selectedSlot.date)} at ${selectedSlot.time}, ${data.booking.name}.`,
      "success"
    );
    form.reset();
    selectedSlotId = null;
    selectedSlot = null;
    selectedLabel.textContent = "none";
    loadSlots();
    if (idToken) loadBookings();
  } catch (err) {
    showMessage("Something went wrong. Please try again.", "error");
  }
});

initAuth();
loadSlots();
