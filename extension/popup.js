const disconnectedView = document.getElementById("disconnected-view");
const connectedView = document.getElementById("connected-view");
const apiKeyInput = document.getElementById("api-key-input");
const connectButton = document.getElementById("connect-button");
const connectError = document.getElementById("connect-error");
const generateKeyLink = document.getElementById("generate-key-link");
const saveNowButton = document.getElementById("save-now-button");
const saveStatus = document.getElementById("save-status");
const fillNowButton = document.getElementById("fill-now-button");
const fillStatus = document.getElementById("fill-status");
const disconnectButton = document.getElementById("disconnect-button");
const jobContext = document.getElementById("job-context");
const jobContextTitle = document.getElementById("job-context-title");
const jobContextCompany = document.getElementById("job-context-company");
const jobContextScore = document.getElementById("job-context-score");
const stageSelect = document.getElementById("stage-select");

generateKeyLink.href = `${SORTIE_API_BASE}/dashboard?settings=1`;

let currentJob = null; // the job detected on the active tab when the popup opened, if any

function scoreTier(score) {
  if (score >= 70) return "high";
  if (score >= 40) return "mid";
  return "low";
}

function renderJobContext(job, preview) {
  currentJob = job;
  if (!job) {
    jobContext.classList.add("hidden");
    return;
  }
  jobContext.classList.remove("hidden");
  jobContextTitle.textContent = job.title;
  jobContextCompany.textContent = job.company;
  if (preview) {
    jobContextScore.hidden = false;
    jobContextScore.dataset.tier = scoreTier(preview.matchScore);
    jobContextScore.textContent = `${preview.matchScore}% match`;
  } else {
    jobContextScore.hidden = true;
  }
}

// Context-aware popup (2026-08-18 v1.2) — shows the job the content script
// already detected on the active tab (and its match-score preview, once
// resolved) before the user decides to save, plus a stage picker. Reuses
// the content script's own extraction/caching rather than re-scoring here.
async function loadJobContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "SORTIE_GET_CURRENT_JOB" });
    renderJobContext(response?.job ?? null, response?.preview ?? null);
    // The score preview often hasn't resolved yet at the instant the popup
    // opens (it's a real network round-trip) — one retry after a beat
    // catches the common case without polling indefinitely.
    if (response?.job && !response?.preview) {
      setTimeout(async () => {
        const retry = await chrome.tabs.sendMessage(tab.id, { type: "SORTIE_GET_CURRENT_JOB" }).catch(() => null);
        if (retry?.preview) renderJobContext(retry.job, retry.preview);
      }, 1200);
    }
  } catch {
    renderJobContext(null, null);
  }
}

function showConnected() {
  disconnectedView.classList.add("hidden");
  connectedView.classList.remove("hidden");
  loadJobContext();
}

function showDisconnected() {
  connectedView.classList.add("hidden");
  disconnectedView.classList.remove("hidden");
}

chrome.storage.local.get("sortieApiKey").then(({ sortieApiKey }) => {
  if (sortieApiKey) showConnected();
  else showDisconnected();
});

connectButton.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  connectError.textContent = "";
  if (!key.startsWith("sortie_")) {
    connectError.textContent = "That doesn't look like a Sortie key — copy it from Settings > Browser extension.";
    return;
  }
  await chrome.storage.local.set({ sortieApiKey: key });
  apiKeyInput.value = "";
  showConnected();
});

disconnectButton.addEventListener("click", async () => {
  await chrome.storage.local.remove("sortieApiKey");
  showDisconnected();
});

saveNowButton.addEventListener("click", async () => {
  saveStatus.textContent = "Saving…";

  // Prefer the job already detected for the context panel (avoids a second
  // extraction round-trip) — but still fall back to the content script's
  // own SORTIE_SAVE_NOW path if the popup opened before extraction finished,
  // so saving isn't blocked on the context panel having resolved first.
  if (currentJob) {
    const job = { ...currentJob, markApplied: stageSelect.value === "applied" };
    const response = await chrome.runtime.sendMessage({ type: "SORTIE_SAVE_JOB", job });
    if (response?.noKey) {
      saveStatus.textContent = "Key not recognized — reconnect below.";
      await chrome.storage.local.remove("sortieApiKey");
      showDisconnected();
    } else if (response?.success) {
      saveStatus.textContent = "Saved to your Sortie tracker.";
    } else {
      saveStatus.textContent = "Couldn't save — try again.";
    }
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    saveStatus.textContent = "No active tab found.";
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "SORTIE_SAVE_NOW" });
    if (response?.state === "saved") {
      saveStatus.textContent = "Saved to your Sortie tracker.";
    } else if (response?.state === "no-key") {
      saveStatus.textContent = "Key not recognized — reconnect below.";
      await chrome.storage.local.remove("sortieApiKey");
      showDisconnected();
    } else {
      saveStatus.textContent = "Couldn't save — open a LinkedIn or Indeed job posting first.";
    }
  } catch {
    saveStatus.textContent = "Open a LinkedIn or Indeed job posting tab first.";
  }
});

// Fills whatever application form is open on the active tab from the
// user's own Sortie profile (name/email/phone/LinkedIn/portfolio/location) —
// works on any site, not just LinkedIn/Indeed, since it's injected directly
// into the active tab rather than relying on a declared content script. This
// only fills fields; it never clicks Submit or Apply — the user always
// reviews and sends the application themselves.
fillNowButton.addEventListener("click", async () => {
  fillStatus.textContent = "Filling…";
  try {
    const response = await chrome.runtime.sendMessage({ type: "SORTIE_FILL_PAGE" });
    if (response?.noKey) {
      fillStatus.textContent = "Key not recognized — reconnect below.";
      await chrome.storage.local.remove("sortieApiKey");
      showDisconnected();
    } else if (response?.success) {
      const parts = [];
      if (response.filledCount > 0) {
        parts.push(`Filled ${response.filledCount} field${response.filledCount === 1 ? "" : "s"}`);
      }
      if (response.resumeLinksAdded > 0) {
        parts.push(`added a résumé link near upload field${response.resumeLinksAdded === 1 ? "" : "s"}`);
      }
      fillStatus.textContent = parts.length > 0 ? `${parts.join(", ")}.` : "No matching fields found on this page.";
    } else {
      fillStatus.textContent = response?.errorMessage ? `Couldn't fill: ${response.errorMessage}` : "Couldn't fill this page — try again.";
    }
  } catch {
    fillStatus.textContent = "Couldn't reach this tab — try reloading the page.";
  }
});
