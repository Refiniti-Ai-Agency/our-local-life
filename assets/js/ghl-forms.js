/**
 * Send Our Local Life form submissions to GoHighLevel via inbound webhook.
 * Requires window.OLL_GHL_CONFIG.webhookUrl from assets/data/ghl-config.js
 */
(function () {
  const cfg = () => window.OLL_GHL_CONFIG || {};

  function detectFormType(form) {
    if (form.id === "course-optin-form") return "focus_course";
    if (form.closest("#subscribe-modal")) return "newsletter_subscribe";
    const names = new Set(
      [...form.querySelectorAll("[name]")].map((el) => el.getAttribute("name"))
    );
    if (names.has("contactEmail") || names.has("contactMessage")) return "contact";
    if (names.has("storyTitle") || names.has("storySummary")) return "story_submit";
    if (names.has("entrepreneurName") || names.has("spotlightEmail"))
      return "entrepreneur_nominate";
    if (names.has("commentBody") || names.has("commentEmail")) return "story_comment";
    if (names.has("guestName") || names.has("guestEmail")) return "podcast_guest";
    if (names.has("firstName") && names.has("email")) return "newsletter_subscribe";
    return "website_form";
  }

  function collectPayload(form, formType) {
    const data = {};
    const fd = new FormData(form);
    fd.forEach((value, key) => {
      if (typeof value === "string") data[key] = value.trim();
    });

    // Normalize common GHL contact fields
    const email =
      data.email ||
      data.contactEmail ||
      data.submitEmail ||
      data.spotlightEmail ||
      data.commentEmail ||
      data.guestEmail ||
      "";
    const firstName =
      data.firstName ||
      data.name ||
      data.contactName ||
      data.submitName ||
      data.spotlightSubmitter ||
      data.commentName ||
      data.guestSubmitter ||
      "";
    const lastName = data.lastName || "";
    const phone = data.phone || data.contactPhone || "";

    const payload = {
      ...data,
      email,
      firstName,
      lastName,
      phone,
      form_type: formType,
      formType,
      source: cfg().source || "Our Local Life Website",
      location: cfg().location || "ourlocallife.com",
      page_url: window.location.href,
      page_path: window.location.pathname,
      submitted_at: new Date().toISOString(),
    };

    // GHL often expects these aliases too
    payload.first_name = firstName;
    payload.last_name = lastName;
    if (firstName && !payload.name) payload.name = [firstName, lastName].filter(Boolean).join(" ");

    return payload;
  }

  function setStatus(form, message, isError) {
    let el = form.querySelector("[data-ghl-status]");
    if (!el) {
      el = document.createElement("p");
      el.setAttribute("data-ghl-status", "1");
      el.className = "text-sm mt-4";
      form.appendChild(el);
    }
    el.textContent = message;
    el.style.opacity = "0.85";
    el.style.color = isError ? "#b42318" : "";
  }

  function setSubmitting(form, busy) {
    const btn = form.querySelector('button[type="submit"]');
    if (!btn) return;
    if (busy) {
      btn.dataset.ghlOriginalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Sending...";
    } else {
      btn.disabled = false;
      if (btn.dataset.ghlOriginalText) {
        btn.textContent = btn.dataset.ghlOriginalText;
        delete btn.dataset.ghlOriginalText;
      }
    }
  }

  async function sendToGhl(payload) {
    const url = (cfg().webhookUrl || "").trim();
    if (!url) {
      throw new Error(
        "GHL webhook is not configured yet. Add webhookUrl in assets/data/ghl-config.js"
      );
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      mode: "cors",
    });
    // Some GHL endpoints return opaque/empty success; treat 2xx as ok
    if (!res.ok && res.status !== 0) {
      throw new Error("Could not send to GHL (HTTP " + res.status + ")");
    }
    return true;
  }

  async function handleSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    // Only handle OLL lead forms (skip unrelated forms if any)
    const formType = detectFormType(form);
    const known = [
      "contact",
      "newsletter_subscribe",
      "story_submit",
      "entrepreneur_nominate",
      "story_comment",
      "podcast_guest",
      "focus_course",
    ];
    if (!known.includes(formType)) return;

    event.preventDefault();
    event.stopPropagation();

    const payload = collectPayload(form, formType);
    if (!payload.email) {
      setStatus(form, "Please enter a valid email.", true);
      return;
    }

    setSubmitting(form, true);
    setStatus(form, "Sending...", false);

    try {
      await sendToGhl(payload);
      setStatus(form, "Thanks! You’re on the list — we’ll be in touch.", false);
      form.reset();

      // Focus course: keep existing redirect behavior after successful send
      if (formType === "focus_course") {
        try {
          sessionStorage.setItem("focusCourseName", payload.firstName || "");
          sessionStorage.setItem("focusCourseEmail", payload.email || "");
        } catch (err) {}
        window.location.href = "focus-course-content.html";
        return;
      }

      // Close subscribe modal after success
      if (formType === "newsletter_subscribe" && typeof window.toggleSubscribe === "function") {
        setTimeout(() => window.toggleSubscribe(), 1200);
      }
    } catch (err) {
      console.error("[OLL GHL]", err);
      setStatus(
        form,
        err.message || "Something went wrong. Please try again or email hello@ourlocallife.com.",
        true
      );
    } finally {
      setSubmitting(form, false);
    }
  }

  // Expose for focus-course inline handler override / manual use
  window.OLL_sendFormToGhl = async function (form) {
    const formType = detectFormType(form);
    const payload = collectPayload(form, formType);
    return sendToGhl(payload);
  };

  document.addEventListener("submit", handleSubmit, true);
})();
