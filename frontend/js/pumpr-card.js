import { api } from "./api.js?v=20260630signin";
import { walletState } from "./core.js?v=20260630signin";

const form = document.getElementById("pumprCardWaitlistForm");
const emailInput = document.getElementById("pumprCardEmail");
const statusEl = document.getElementById("pumprCardStatus");

function setStatus(message = "", isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("error", Boolean(isError));
}

function activeWalletAddress() {
  const ws = walletState();
  return String(ws.address || ws.solanaAddress || "").trim();
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = String(emailInput?.value || "").trim();
  if (!email) {
    setStatus("Enter your email to join the PUMPR Card waitlist.", true);
    return;
  }
  const submitBtn = form.querySelector('button[type="submit"]');
  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Joining...";
    }
    setStatus("Saving your spot...");
    await api.pumprCardWaitlist({
      email,
      wallet: activeWalletAddress(),
      source: "pumpr-card-page"
    });
    form.reset();
    setStatus("You're on the PUMPR Card waitlist. Watch your inbox for early access updates.");
  } catch (error) {
    setStatus(error?.message || "Could not join the waitlist. Try again.", true);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Join waitlist";
    }
  }
});
