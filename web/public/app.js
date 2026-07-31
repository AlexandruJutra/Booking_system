const slotsEl = document.getElementById("slots");
const form = document.getElementById("booking-form");
const messageEl = document.getElementById("message");
const selectedLabel = document.getElementById("selected-slot-label");

// Auth token sent automatically with booking requests.
const AUTH_TOKEN = "demo-secret-token";

let selectedSlotId = null;

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
  document
    .querySelectorAll(".slot.selected")
    .forEach((el) => el.classList.remove("selected"));
  btn.classList.add("selected");
  selectedLabel.textContent = `${formatDay(slot.date)} at ${slot.time}`;
}

// POST /bookings (Requires Auth token)
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!selectedSlotId) {
    showMessage("Please choose a time slot first.", "error");
    return;
  }

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const reason = document.getElementById("reason").value.trim();

  try {
    const res = await fetch("/bookings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AUTH_TOKEN}`,
      },
      body: JSON.stringify({ slotId: selectedSlotId, name, email, reason }),
    });

    const data = await res.json();

    if (!res.ok) {
      showMessage(data.error || "Booking failed.", "error");
      return;
    }

    showMessage(
      `✅ Booked! See you on ${formatDay(data.booking.date)} at ${data.booking.time}, ${data.booking.name}.`,
      "success"
    );
    form.reset();
    selectedSlotId = null;
    selectedLabel.textContent = "none";
    loadSlots();
  } catch (err) {
    showMessage("Something went wrong. Please try again.", "error");
  }
});

loadSlots();
