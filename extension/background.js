// Service worker — the only place that actually talks to the Sortie API.
// Content scripts run in the page's own context and can be constrained by a
// strict host CSP (LinkedIn's in particular); a background service worker's
// fetch isn't subject to that, and it also keeps the API key in one place
// rather than needing host_permissions on the Sortie domain from every site
// this extension runs on.
importScripts("config.js");

// Injected into the active tab's page context via chrome.scripting — must be
// fully self-contained (no closures over anything outside its own args; the
// engine serializes this function and re-runs it inside the page, so any
// outer reference would just be undefined there).
//
// v2 (2026-08-18) — adapter pattern, per agy research (context/build-plan.md
// §Q5 follow-up): generic autocomplete/keyword matching hits a real ceiling
// on major ATS platforms, whose field naming is actually well-documented and
// stable enough to target directly. Greenhouse/Lever selectors below are
// based on those platforms' well-known public field-naming conventions
// (widely referenced across other open-source autofill tools), NOT
// independently confirmed against a real live application in this pass —
// same honesty-about-verification-tier caveat as this file's LinkedIn/Indeed
// selectors. If an adapter's fields don't fill, the generic fallback below
// still runs afterward and may catch what the adapter missed.
function sortieAutofillPage(profile, sortieApiBase) {
  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    descriptor.set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function highlight(el) {
    el.style.outline = "2px solid #c9711f";
    setTimeout(() => {
      el.style.outline = "";
    }, 1500);
  }

  function fillBySelector(selector, value) {
    if (!value) return false;
    const el = document.querySelector(selector);
    if (!el || el.disabled || el.readOnly || el.value) return false;
    setNativeValue(el, value);
    highlight(el);
    return true;
  }

  const nameParts = (profile.full_name || "").trim().split(/\s+/).filter(Boolean);
  const values = {
    firstName: nameParts[0] || "",
    lastName: nameParts.length > 1 ? nameParts.slice(1).join(" ") : "",
    fullName: profile.full_name || "",
    email: profile.email || "",
    phone: profile.phone || "",
    linkedin: profile.linkedin_url || "",
    portfolio: profile.portfolio_url || "",
    location: profile.location || "",
    currentTitle: profile.current_title || "",
  };

  let adapterFilledCount = 0;

  // Greenhouse (boards.greenhouse.io) — the embedded application form's
  // standard fields use these exact ids/names across the vast majority of
  // Greenhouse-hosted postings.
  function runGreenhouseAdapter() {
    const fields = [
      ["#first_name, input[name='job_application[first_name]']", values.firstName],
      ["#last_name, input[name='job_application[last_name]']", values.lastName],
      ["#email, input[name='job_application[email]']", values.email],
      ["#phone, input[name='job_application[phone]']", values.phone],
    ];
    for (const [selector, value] of fields) {
      if (fillBySelector(selector, value)) adapterFilledCount++;
    }
  }

  // Lever (jobs.lever.co) — famous for a single combined "Full Name" field
  // (name="name") rather than first/last, and a urls[Label] naming scheme
  // for social/portfolio links.
  function runLeverAdapter() {
    const fields = [
      ["input[name='name']", values.fullName],
      ["input[name='email']", values.email],
      ["input[name='phone']", values.phone],
      ["input[name='urls[LinkedIn]']", values.linkedin],
      ["input[name='urls[GitHub]']", values.portfolio],
      ["input[name='urls[Portfolio]']", values.portfolio],
    ];
    for (const [selector, value] of fields) {
      if (fillBySelector(selector, value)) adapterFilledCount++;
    }
  }

  const hostname = window.location.hostname;
  if (hostname.includes("greenhouse.io")) runGreenhouseAdapter();
  else if (hostname.includes("lever.co")) runLeverAdapter();

  // Generic fallback — classifies every remaining empty input/textarea via
  // its autocomplete attribute first (the standardized, most reliable
  // signal), then a name/id/placeholder/label keyword match. Runs
  // regardless of whether an adapter matched above: it naturally skips
  // anything the adapter already filled (the `el.value` guard below), and
  // still covers custom/non-standard fields no adapter targets by name.
  function labelTextFor(el) {
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) return label.textContent || "";
    }
    const parentLabel = el.closest("label");
    if (parentLabel) return parentLabel.textContent || "";
    return el.getAttribute("aria-label") || "";
  }

  function haystackFor(el) {
    return [el.name, el.id, el.placeholder, labelTextFor(el)].filter(Boolean).join(" ").toLowerCase();
  }

  const AUTOCOMPLETE_MAP = {
    "given-name": "firstName",
    "family-name": "lastName",
    name: "fullName",
    email: "email",
    tel: "phone",
    "tel-national": "phone",
    url: "portfolio",
    "address-level2": "location",
  };

  const KEYWORD_MAP = [
    { key: "firstName", words: ["first name", "given name", "fname"] },
    { key: "lastName", words: ["last name", "family name", "surname", "lname"] },
    { key: "email", words: ["email"] },
    { key: "phone", words: ["phone", "mobile", "telephone"] },
    { key: "linkedin", words: ["linkedin"] },
    { key: "portfolio", words: ["portfolio", "website", "github", "personal site"] },
    { key: "location", words: ["location", "city"] },
    { key: "currentTitle", words: ["current title", "job title", "current role"] },
    { key: "fullName", words: ["full name", "your name"] },
  ];

  function classify(el) {
    const autocomplete = (el.getAttribute("autocomplete") || "").toLowerCase();
    if (AUTOCOMPLETE_MAP[autocomplete]) return AUTOCOMPLETE_MAP[autocomplete];
    const type = (el.getAttribute("type") || "").toLowerCase();
    if (type === "email") return "email";
    if (type === "tel") return "phone";
    if (type === "url") return "portfolio";
    const haystack = haystackFor(el);
    for (const { key, words } of KEYWORD_MAP) {
      if (words.some((word) => haystack.includes(word))) return key;
    }
    return null;
  }

  let genericFilledCount = 0;
  document.querySelectorAll("input, textarea").forEach((el) => {
    if (el.type === "hidden" || el.type === "password" || el.disabled || el.readOnly) return;
    if (el.value) return; // never overwrite something the user already typed (or the adapter just filled)
    const key = classify(el);
    if (!key) return;
    const value = values[key];
    if (!value) return;
    setNativeValue(el, value);
    highlight(el);
    genericFilledCount++;
  });

  // Fuzzy <select> matching — dropdowns fail generic autofill entirely,
  // since the profile's raw string ("Toronto, ON") won't exactly match an
  // option's text ("Toronto, Ontario, Canada"). Deliberately scoped to
  // location-labeled dropdowns only: a wrong guess there is low-stakes (the
  // user reviews before submitting either way, since this extension never
  // submits anything itself), unlike a legal eligibility/sponsorship
  // question, which this intentionally does NOT attempt to answer — guessing
  // wrong on that class of question is a real harm, not just an annoyance.
  function normalize(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function similarity(a, b) {
    const na = normalize(a);
    const nb = normalize(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    if (na.includes(nb) || nb.includes(na)) return 0.85;
    const wordsA = new Set(na.split(" "));
    const wordsB = nb.split(" ");
    const overlap = wordsB.filter((w) => wordsA.has(w)).length;
    return overlap / Math.max(wordsA.size, wordsB.length, 1);
  }

  let dropdownFilledCount = 0;
  if (values.location) {
    document.querySelectorAll("select").forEach((select) => {
      if (select.disabled || select.value) return;
      const haystack = haystackFor(select);
      if (!["location", "city", "country"].some((w) => haystack.includes(w))) return;

      let bestOption = null;
      let bestScore = 0;
      for (const option of select.options) {
        if (!option.value) continue;
        const score = similarity(option.textContent || "", values.location);
        if (score > bestScore) {
          bestScore = score;
          bestOption = option;
        }
      }
      if (bestOption && bestScore >= 0.4) {
        select.value = bestOption.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        highlight(select);
        dropdownFilledCount++;
      }
    });
  }

  // File-upload workaround — browsers block scripts (extensions included)
  // from programmatically populating a file input for real security reasons,
  // so don't attempt it. Instead, drop a real link next to any file input
  // that opens the user's own résumé library, so they can grab a file and
  // drag it in themselves in one fluid motion.
  let resumeLinksAdded = 0;
  document.querySelectorAll('input[type="file"]').forEach((fileInput) => {
    if (fileInput.disabled) return;
    if (fileInput.parentElement?.querySelector(".sortie-resume-link")) return; // already added
    const link = document.createElement("a");
    link.href = `${sortieApiBase}/resume`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Get résumé from Sortie ↗";
    link.className = "sortie-resume-link";
    link.style.cssText =
      "display: inline-block; margin-top: 6px; font-size: 12px; color: #c9711f; text-decoration: underline; cursor: pointer;";
    fileInput.insertAdjacentElement("afterend", link);
    resumeLinksAdded++;
  });

  return {
    filledCount: adapterFilledCount + genericFilledCount + dropdownFilledCount,
    resumeLinksAdded,
  };
}

async function getStoredApiKey() {
  const { sortieApiKey } = await chrome.storage.local.get("sortieApiKey");
  return sortieApiKey || null;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SORTIE_SAVE_JOB") {
    (async () => {
      const sortieApiKey = await getStoredApiKey();
      if (!sortieApiKey) {
        sendResponse({ success: false, noKey: true });
        return;
      }

      try {
        const response = await fetch(`${SORTIE_API_BASE}/api/extension/capture-job`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${sortieApiKey}` },
          body: JSON.stringify(message.job),
        });
        if (!response.ok) {
          sendResponse({ success: false });
          return;
        }
        const data = await response.json();
        sendResponse({ success: true, jobId: data.jobId });
      } catch (error) {
        console.error("[Sortie extension] background fetch failed", error);
        sendResponse({ success: false });
      }
    })();

    return true; // keep the message channel open for the async response
  }

  if (message?.type === "SORTIE_GET_SCORE_PREVIEW") {
    (async () => {
      const sortieApiKey = await getStoredApiKey();
      if (!sortieApiKey) {
        sendResponse({ success: false, noKey: true });
        return;
      }

      try {
        const response = await fetch(`${SORTIE_API_BASE}/api/extension/score-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${sortieApiKey}` },
          body: JSON.stringify(message.job),
        });
        if (!response.ok) {
          sendResponse({ success: false });
          return;
        }
        const data = await response.json();
        sendResponse({ success: true, preview: data.preview });
      } catch (error) {
        console.error("[Sortie extension] score preview fetch failed", error);
        sendResponse({ success: false });
      }
    })();

    return true;
  }

  if (message?.type === "SORTIE_FILL_PAGE") {
    (async () => {
      const sortieApiKey = await getStoredApiKey();
      if (!sortieApiKey) {
        sendResponse({ success: false, noKey: true });
        return;
      }

      try {
        const response = await fetch(`${SORTIE_API_BASE}/api/extension/profile`, {
          headers: { Authorization: `Bearer ${sortieApiKey}` },
        });
        if (!response.ok) {
          sendResponse({ success: false, errorMessage: `Profile fetch failed (HTTP ${response.status})` });
          return;
        }
        const { profile } = await response.json();

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
          sendResponse({ success: false, errorMessage: "No active tab found" });
          return;
        }

        const [injection] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: sortieAutofillPage,
          args: [profile, SORTIE_API_BASE],
        });

        // executeScript resolves (doesn't throw) even when the injected
        // function itself threw — the error shows up as injection.error
        // instead, which the outer catch below never sees.
        if (injection?.error) {
          console.error("[Sortie extension] injected autofill function threw", injection.error);
          sendResponse({ success: false, errorMessage: injection.error.message || String(injection.error) });
          return;
        }

        const result = injection?.result;
        sendResponse({
          success: true,
          filledCount: result?.filledCount ?? 0,
          resumeLinksAdded: result?.resumeLinksAdded ?? 0,
        });
      } catch (error) {
        console.error("[Sortie extension] autofill failed", error);
        sendResponse({ success: false, errorMessage: error?.message || String(error) });
      }
    })();

    return true;
  }
});
