(function () {
  const config = window.ArturoConfig;
  if (!config) return;

  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: config.currency || "USD",
    maximumFractionDigits: 0
  });

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function availableFlavors() {
    return (config.flavors || []).filter(function (flavor) {
      return flavor.available;
    });
  }

  function remaining(flavor) {
    if (!config.inventoryEnabled) return Infinity;
    return Math.max(0, Number(flavor.dozensAvailable) || 0);
  }

  function priceLabel() {
    return money.format(config.pricePerDozen) + " / dozen";
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach(function (node) {
      node.textContent = value;
    });
  }

  function renderMenu() {
    const grid = document.getElementById("menu-grid");
    if (!grid) return;
    grid.innerHTML = availableFlavors()
      .map(function (flavor) {
        const left = remaining(flavor);
        const soldOut = config.inventoryEnabled && left <= 0;
        const stock = !config.inventoryEnabled
          ? "Ask about this batch"
          : soldOut
            ? "Sold out for this batch"
            : left + " dozen available";
        const photo = flavor.image
          ? '<img src="' +
            escapeHtml(flavor.image) +
            '" alt="' +
            escapeHtml(flavor.imageAlt || flavor.name) +
            '" width="' +
            escapeHtml(flavor.imageWidth || 800) +
            '" height="' +
            escapeHtml(flavor.imageHeight || 533) +
            '" loading="lazy" decoding="async" />'
          : "";
        return (
          '<article class="flavor-card' +
          (soldOut ? " sold-out" : "") +
          '">' +
          '<div class="flavor-media">' +
          photo +
          '<span class="badge badge-price">' +
          escapeHtml(money.format(config.pricePerDozen)) +
          "</span>" +
          '<span class="badge badge-stock' +
          (soldOut ? " is-out" : "") +
          '">' +
          escapeHtml(stock) +
          "</span>" +
          "</div>" +
          '<div class="flavor-body">' +
          '<span class="category">' +
          escapeHtml(flavor.category) +
          "</span>" +
          "<h3>" +
          escapeHtml(flavor.name) +
          "</h3>" +
          "<p>" +
          escapeHtml(flavor.description) +
          "</p>" +
          (soldOut
            ? '<span class="cardLink muted">Currently unavailable</span>'
            : '<a class="cardLink" href="#order">Order ' +
              escapeHtml(flavor.name) +
              "</a>") +
          "</div></article>"
        );
      })
      .join("");
  }

  function renderFlavorFields() {
    const mount = document.getElementById("flavor-fields");
    if (!mount) return;
    mount.innerHTML = availableFlavors()
      .map(function (flavor) {
        const max = remaining(flavor);
        const soldOut = config.inventoryEnabled && max <= 0;
        const maxAttr = config.inventoryEnabled ? ' max="' + max + '"' : "";
        return (
          "<label>" +
          escapeHtml(flavor.name) +
          " (dozens)" +
          '<input type="number" min="0" step="1"' +
          maxAttr +
          ' value="0" inputmode="numeric" data-flavor-id="' +
          escapeHtml(flavor.id) +
          '"' +
          (soldOut ? " disabled" : "") +
          " />" +
          (config.inventoryEnabled
            ? '<span class="field-hint">' +
              escapeHtml(soldOut ? "Sold out" : max + " dozen left in this batch") +
              "</span>"
            : "") +
          "</label>"
        );
      })
      .join("");
  }

  function orderQuantities() {
    const quantities = {};
    document.querySelectorAll("[data-flavor-id]").forEach(function (input) {
      quantities[input.getAttribute("data-flavor-id")] = String(input.value || "0").trim();
    });
    return quantities;
  }

  function dozenCount(raw) {
    if (!/^\d+$/.test(String(raw || "0"))) return null;
    return parseInt(raw || "0", 10);
  }

  function allSoldOut() {
    const flavors = availableFlavors();
    return (
      config.inventoryEnabled &&
      flavors.length > 0 &&
      flavors.every(function (flavor) {
        return remaining(flavor) <= 0;
      })
    );
  }

  function updateOrderSummary() {
    const summary = document.getElementById("order-summary");
    const button = document.querySelector("#order-form button[type=submit]");
    if (!summary) return;
    const soldOut = allSoldOut();
    if (button && button.dataset.sending !== "1") button.disabled = soldOut;
    if (!availableFlavors().length) {
      summary.textContent = "Nothing is on the menu right now.";
      if (button && button.dataset.sending !== "1") button.disabled = true;
      return;
    }
    if (soldOut) {
      summary.textContent = "Sold out for this batch. Check back when the next batch is ready.";
      return;
    }

    const quantities = orderQuantities();
    let totalDozens = 0;
    const lines = availableFlavors()
      .map(function (flavor) {
        const qty = dozenCount(quantities[flavor.id]);
        const safe = qty == null ? 0 : qty;
        totalDozens += safe;
        return safe ? flavor.name + " × " + safe : "";
      })
      .filter(Boolean);
    const mixNote = lines.length > 1 ? " Mixed order." : "";
    summary.textContent = totalDozens
      ? lines.join(" · ") +
        ". " +
        totalDozens +
        " dozen totaling " +
        money.format(totalDozens * config.pricePerDozen) +
        "." +
        mixNote
      : "Select how many dozen of each flavor. Mix Green Chicken and Shredded Red Pork in one order if you like.";
  }

  function validateOrder(quantities) {
    const flavors = availableFlavors();
    if (!flavors.length) return "Nothing is on the menu right now.";
    if (allSoldOut()) return "Sold out for this batch.";
    let total = 0;
    for (let i = 0; i < flavors.length; i += 1) {
      const flavor = flavors[i];
      const raw = quantities[flavor.id] == null || quantities[flavor.id] === "" ? "0" : quantities[flavor.id];
      const qty = dozenCount(raw);
      if (qty == null) return "Enter whole dozens for " + flavor.name + ".";
      if (config.inventoryEnabled && qty > remaining(flavor)) {
        return (
          "Only " +
          remaining(flavor) +
          " dozen of " +
          flavor.name +
          " are available in this batch."
        );
      }
      total += qty;
    }
    if (total < 1) return "Add at least one dozen.";
    return "";
  }

  function phoneDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function formatPhoneTel(value) {
    const digits = phoneDigits(value);
    if (digits.length === 10) return "+1" + digits;
    if (digits.length === 11 && digits.charAt(0) === "1") return "+" + digits;
    return "";
  }

  function formatPhoneDisplay(value) {
    const digits = phoneDigits(value);
    const core = digits.length === 11 && digits.charAt(0) === "1" ? digits.slice(1) : digits;
    if (core.length === 10) {
      return "(" + core.slice(0, 3) + ") " + core.slice(3, 6) + "-" + core.slice(6);
    }
    return String(value || "").trim();
  }

  function isValidPhone(value) {
    if (/[a-z]/i.test(value)) return false;
    const digits = phoneDigits(value);
    if (digits.length === 10) return true;
    return digits.length === 11 && digits.charAt(0) === "1";
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function leadDays() {
    const n = Number(config.minimumLeadDays);
    if (!isFinite(n) || n < 0) return 1;
    return Math.floor(n);
  }

  function startOfToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  function minimumDate() {
    const date = startOfToday();
    date.setDate(date.getDate() + leadDays());
    return date;
  }

  function formatISODate(date) {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return date.getFullYear() + "-" + month + "-" + day;
  }

  function parseISODate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    date.setHours(0, 0, 0, 0);
    if (
      date.getFullYear() !== Number(match[1]) ||
      date.getMonth() !== Number(match[2]) - 1 ||
      date.getDate() !== Number(match[3])
    ) {
      return null;
    }
    return date;
  }

  function formatHuman(date) {
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric"
    });
  }

  function dateError(value) {
    if (!value) return "Choose a date.";
    const picked = parseISODate(value);
    if (!picked) return "Enter a valid date.";
    const min = minimumDate();
    if (picked < min) {
      if (leadDays() === 0) return "Choose today or a later date.";
      if (leadDays() === 1) return "Choose tomorrow or a later date.";
      return "Choose " + formatHuman(min) + " or later.";
    }
    return "";
  }

  function leadHint() {
    if (leadDays() === 0) return "Today or later.";
    if (leadDays() === 1) return "Tomorrow or later.";
    return formatHuman(minimumDate()) + " or later.";
  }

  function applyDateMins() {
    const min = formatISODate(minimumDate());
    const hint = leadHint();
    document.querySelectorAll('input[type="date"]').forEach(function (input) {
      input.min = min;
    });
    document.querySelectorAll("[data-lead-hint]").forEach(function (node) {
      node.textContent = hint;
    });
  }

  function formValues(form) {
    const data = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.type === "submit" || el.name === "_honey") return;
      if (el.type === "checkbox") {
        data[el.name] = el.checked ? String(el.value || "yes") : "";
        return;
      }
      data[el.name] = String(el.value || "").trim();
    });
    return data;
  }

  function showNotice(id, message, isError) {
    const node = document.getElementById(id);
    if (!node) return null;
    node.hidden = false;
    node.textContent = message;
    node.classList.toggle("notice-error", Boolean(isError));
    node.classList.toggle("notice-ok", !isError);
    node.setAttribute("role", isError ? "alert" : "status");
    return node;
  }

  function focusNotice(id) {
    const node = document.getElementById(id);
    if (node) node.focus();
  }

  function clearErrors(form) {
    form.querySelectorAll(".field-error").forEach(function (node) {
      node.remove();
    });
    form.querySelectorAll("[aria-invalid]").forEach(function (input) {
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
    });
  }

  function setFieldError(input, message) {
    if (!input.id) input.id = (input.form && input.form.id ? input.form.id : "field") + "-" + input.name;
    const errorId = input.id + "-error";
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", errorId);
    const error = document.createElement("span");
    error.className = "field-error";
    error.id = errorId;
    error.textContent = message;
    input.insertAdjacentElement("afterend", error);
  }

  function validateFields(form, checks) {
    clearErrors(form);
    let first = null;
    checks.forEach(function (check) {
      const input = form.elements[check.name];
      if (!input || input.disabled) return;
      const message = check.test(input);
      if (message) {
        setFieldError(input, message);
        if (!first) first = input;
      }
    });
    if (first) first.focus();
    return !first;
  }

  function requireText(message) {
    return function (input) {
      return String(input.value || "").trim() ? "" : message;
    };
  }

  function contactChecks() {
    return [
      { name: "first", test: requireText("Enter your first name.") },
      { name: "last", test: requireText("Enter your last name.") },
      {
        name: "email",
        test: function (input) {
          return isValidEmail(String(input.value || "").trim())
            ? ""
            : "Enter an email address like name@email.com.";
        }
      },
      {
        name: "phone",
        test: function (input) {
          return isValidPhone(String(input.value || "").trim())
            ? ""
            : "Enter a 10-digit phone number.";
        }
      }
    ];
  }

  function onFieldEdit(event) {
    const input = event.target;
    if (!input || !input.form || input.getAttribute("aria-invalid") !== "true") return;
    input.removeAttribute("aria-invalid");
    input.removeAttribute("aria-describedby");
    const next = input.nextElementSibling;
    if (next && next.classList.contains("field-error")) next.remove();
  }

  function customerErrorMessage() {
    const email = String(config.inquiryEmail || "").trim();
    if (email) {
      return "We couldn’t send that. Your details are still here. Try again, or email " + email + ".";
    }
    return "We couldn’t send that. Your details are still here. Please try again.";
  }

  function submissionSucceeded(data) {
    return Boolean(data) && (data.success === true || data.success === "true");
  }

  function setBusy(form, busy) {
    const button = form.querySelector("button[type=submit]");
    if (!button) return;
    if (!button.dataset.label) button.dataset.label = button.textContent;
    button.dataset.sending = busy ? "1" : "0";
    button.disabled = busy;
    button.textContent = busy ? "Sending…" : button.dataset.label;
  }

  function postInquiry(payload) {
    const endpoint = String(config.formEndpoint || "").trim();
    if (!endpoint) return Promise.reject(new Error("Missing form endpoint"));
    payload._honey = "";
    payload._captcha = "false";
    payload._template = "table";
    return fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(payload)
    }).then(function (response) {
      return response
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          if (!response.ok || !submissionSucceeded(data)) {
            const error = new Error((data && data.message) || "Request failed");
            error.detail = data;
            error.status = response.status;
            throw error;
          }
          return data;
        });
    });
  }

  function honeyFilled(form) {
    const honey = form.querySelector('[name="_honey"]');
    return Boolean(honey && String(honey.value || "").trim());
  }

  function sendForm(form, noticeId, payload, successMessage, afterSuccess) {
    if (honeyFilled(form) || !String(config.formEndpoint || "").trim()) {
      showNotice(noticeId, customerErrorMessage(), true);
      focusNotice(noticeId);
      return;
    }
    setBusy(form, true);
    postInquiry(payload)
      .then(function () {
        clearErrors(form);
        form.reset();
        showNotice(noticeId, successMessage, false);
        if (afterSuccess) afterSuccess();
        focusNotice(noticeId);
      })
      .catch(function () {
        showNotice(noticeId, customerErrorMessage(), true);
        focusNotice(noticeId);
      })
      .then(function () {
        setBusy(form, false);
        if (form.id === "order-form") updateOrderSummary();
      });
  }

  function flavorSummary(quantities) {
    return availableFlavors()
      .map(function (flavor) {
        const qty = dozenCount(quantities[flavor.id] || "0") || 0;
        return qty ? flavor.name + ": " + qty + " dozen" : "";
      })
      .filter(Boolean)
      .join(" · ");
  }

  function updatesLine(form, yesText) {
    return form.elements.updates && form.elements.updates.checked ? yesText : "No";
  }

  function handleOrderSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fieldsOk = validateFields(
      form,
      contactChecks().concat([{ name: "date", test: function (input) { return dateError(input.value); } }])
    );
    const quantities = orderQuantities();
    const orderError = validateOrder(quantities);
    if (!fieldsOk) {
      showNotice("order-notice", "Check the highlighted fields.", true);
      return;
    }
    if (orderError) {
      showNotice("order-notice", orderError, true);
      const flavorInput = form.querySelector("[data-flavor-id]:not(:disabled)");
      if (flavorInput) flavorInput.focus();
      return;
    }

    const fields = formValues(form);
    const total = availableFlavors().reduce(function (sum, flavor) {
      return sum + (dozenCount(quantities[flavor.id] || "0") || 0);
    }, 0);
    const name = fields.first + " " + fields.last;
    let success = "Order request sent. We’ll email you to confirm availability and the total.";
    if (form.elements.updates && form.elements.updates.checked) {
      success += " You also asked for a note when a new batch is ready.";
    }
    sendForm(
      form,
      "order-notice",
      {
        _subject: "Tamale order from " + name,
        name: name,
        email: fields.email,
        phone: fields.phone,
        request_type: "Tamale order",
        order: flavorSummary(quantities),
        total: total + " dozen (" + money.format(total * config.pricePerDozen) + " before confirmation)",
        requested_date: fields.date,
        pickup_or_delivery: fields.receive,
        notes: fields.notes || "(none)",
        updates: updatesLine(form, "Yes — batch updates")
      },
      success,
      function () {
        renderFlavorFields();
        applyDateMins();
        updateOrderSummary();
      }
    );
  }

  function handleCateringSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fieldsOk = validateFields(
      form,
      contactChecks().concat([
        {
          name: "guests",
          test: function (input) {
            return /^[1-9]\d*$/.test(String(input.value || "").trim())
              ? ""
              : "Enter a guest count of at least 1.";
          }
        },
        { name: "date", test: function (input) { return dateError(input.value); } },
        { name: "location", test: requireText("Enter the event location.") }
      ])
    );
    if (!fieldsOk) {
      showNotice("catering-notice", "Check the highlighted fields.", true);
      return;
    }
    const fields = formValues(form);
    const name = fields.first + " " + fields.last;
    let success = "Catering request sent. We’ll email you with availability and a quote.";
    if (form.elements.updates && form.elements.updates.checked) {
      success += " You also asked for notes about catering dates.";
    }
    sendForm(
      form,
      "catering-notice",
      {
        _subject: "Catering inquiry from " + name,
        name: name,
        email: fields.email,
        phone: fields.phone,
        request_type: "Catering inquiry",
        guest_count: fields.guests,
        event_date: fields.date,
        location: fields.location,
        service_style: fields.style,
        food_preferences: fields.food || "(none)",
        details: fields.details || "(none)",
        updates: updatesLine(form, "Yes — catering notes")
      },
      success,
      applyDateMins
    );
  }

  function handleEmailSignup(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fieldsOk = validateFields(form, [
      {
        name: "email",
        test: function (input) {
          return isValidEmail(String(input.value || "").trim())
            ? ""
            : "Enter an email address like name@email.com.";
        }
      }
    ]);
    if (!fieldsOk) {
      showNotice("signup-notice", "Check the highlighted field.", true);
      return;
    }
    const email = String(form.email.value || "").trim();
    sendForm(
      form,
      "signup-notice",
      {
        _subject: "Updates request",
        email: email,
        request_type: "Updates request",
        message: "Please email this address when a batch or catering date is coming up. This is a request, not an automatic mailing list."
      },
      "Updates request received. We’ll email you when a batch or catering date is coming up."
    );
  }

  function renderContact() {
    const phoneLink = document.getElementById("contact-phone");
    const emailLink = document.getElementById("contact-email");
    const address = document.getElementById("contact-address");
    const phone = String(config.phone || "").trim();
    const tel = formatPhoneTel(phone);
    if (phoneLink) {
      if (!phone || !tel) {
        phoneLink.remove();
      } else {
        phoneLink.textContent = formatPhoneDisplay(phone);
        phoneLink.href = "tel:" + tel;
      }
    }
    if (emailLink) {
      const email = String(config.inquiryEmail || "").trim();
      if (!email) {
        emailLink.remove();
      } else {
        emailLink.textContent = email;
        emailLink.href = "mailto:" + email;
      }
    }
    if (address) {
      const street = String(config.streetAddress || "").trim();
      if (!street) {
        address.remove();
      } else {
        address.hidden = false;
        address.textContent = street;
      }
    }
    document.querySelectorAll("[data-venmo]").forEach(function (link) {
      if (config.venmoUrl) link.href = config.venmoUrl;
    });
    if (config.venmoHandle) setText("[data-venmo-handle]", config.venmoHandle);
    renderVenmoAvatar();
  }

  function renderBrand() {
    const mark = String(config.logoMark || "").trim();
    if (!mark) return;
    document.querySelectorAll("[data-logo]").forEach(function (img) {
      img.src = mark;
    });
  }

  function renderVenmoAvatar() {
    const src = String(config.venmoAvatar || "").trim();
    const row = document.querySelector(".pay-actions");
    if (!row || !src) return;
    const photo = document.createElement("img");
    photo.className = "venmo-avatar";
    photo.src = src;
    photo.alt = String(config.venmoAvatarAlt || "").trim() || "Venmo profile";
    photo.width = 48;
    photo.height = 48;
    row.insertBefore(photo, row.firstChild);
  }

  function injectSeo() {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    const data = {
      "@context": "https://schema.org",
      "@type": "FoodEstablishment",
      name: config.businessName,
      description: config.tagline + ". Tamales " + priceLabel() + ".",
      url: config.siteUrl,
      areaServed: config.city + ", " + config.region,
      servesCuisine: "Mexican",
      priceRange: money.format(config.pricePerDozen) + " per dozen",
      email: config.inquiryEmail
    };
    const tel = formatPhoneTel(config.phone);
    if (tel) data.telephone = tel;
    if (String(config.streetAddress || "").trim()) {
      data.address = {
        "@type": "PostalAddress",
        streetAddress: String(config.streetAddress).trim(),
        addressLocality: config.city,
        addressRegion: "MO"
      };
    }
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }

  function setupHeader() {
    const header = document.querySelector(".topbar");
    if (!header) return;
    function onScroll() {
      header.classList.toggle("is-condensed", window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  function setupReveal() {
    const nodes = document.querySelectorAll(".reveal");
    if (!nodes.length) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -4% 0px" });
    nodes.forEach(function (node) { observer.observe(node); });
  }

  function setupNav() {
    const toggle = document.querySelector(".nav-toggle");
    const nav = document.getElementById("site-nav");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", function () {
      const open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  document.addEventListener("input", onFieldEdit);
  document.addEventListener("change", onFieldEdit);

  document.addEventListener("DOMContentLoaded", function () {
    setText("[data-price]", priceLabel());
    setText("[data-price-number]", money.format(config.pricePerDozen));
    setText("[data-business-name]", config.businessName);
    setText("[data-tagline]", config.tagline);
    setText("[data-area]", config.area);
    setText("[data-radius]", String(config.deliveryRadiusMiles));
    setText("[data-place]", config.city + ", " + config.region);

    renderBrand();
    renderMenu();
    renderFlavorFields();
    renderContact();
    applyDateMins();
    updateOrderSummary();
    injectSeo();
    setupHeader();
    setupReveal();
    setupNav();

    const flavorMount = document.getElementById("flavor-fields");
    if (flavorMount) flavorMount.addEventListener("input", updateOrderSummary);

    const orderForm = document.getElementById("order-form");
    if (orderForm) orderForm.addEventListener("submit", handleOrderSubmit);

    const cateringForm = document.getElementById("catering-form");
    if (cateringForm) cateringForm.addEventListener("submit", handleCateringSubmit);

    const signupForm = document.getElementById("signup-form");
    if (signupForm) signupForm.addEventListener("submit", handleEmailSignup);
  });
})();
