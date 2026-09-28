(function () {
  const config = window.ArturoConfig;
  if (!config) return;

  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: config.currency || "USD",
    maximumFractionDigits: 0
  });

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
          ? "Ask us about today’s batch"
          : soldOut
            ? "Sold out for this batch"
            : left + " dozen available";
        return (
          '<article class="' +
          (soldOut ? "sold-out" : "") +
          '">' +
          '<span class="category">' +
          flavor.category +
          "</span>" +
          "<h3>" +
          flavor.name +
          "</h3>" +
          "<p>" +
          flavor.description +
          "</p>" +
          '<p class="stock">' +
          stock +
          "</p>" +
          (soldOut
            ? '<span class="cardLink muted">Currently unavailable</span>'
            : '<a class="cardLink" href="#order">Order ' +
              flavor.name +
              "</a>") +
          "</article>"
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
          '<label>' +
          flavor.name +
          " (dozens)" +
          '<input type="number" min="0"' +
          maxAttr +
          ' value="0" data-flavor-id="' +
          flavor.id +
          '" ' +
          (soldOut ? "disabled" : "") +
          " />" +
          (config.inventoryEnabled
            ? '<span class="field-hint">' +
              (soldOut ? "Sold out" : max + " dozen left in this batch") +
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
      quantities[input.getAttribute("data-flavor-id")] = Number(input.value) || 0;
    });
    return quantities;
  }

  function updateOrderSummary() {
    const summary = document.getElementById("order-summary");
    if (!summary) return;
    const quantities = orderQuantities();
    let totalDozens = 0;
    const lines = availableFlavors().map(function (flavor) {
      const qty = quantities[flavor.id] || 0;
      totalDozens += qty;
      return qty
        ? flavor.name + " × " + qty
        : "";
    }).filter(Boolean);

    const mixNote =
      lines.length > 1 ? " Mixed order." : lines.length === 1 ? "" : " Choose at least one flavor.";

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
    let total = 0;
    for (let i = 0; i < availableFlavors().length; i += 1) {
      const flavor = availableFlavors()[i];
      const qty = quantities[flavor.id] || 0;
      if (qty < 0) return flavor.name + " can’t be negative.";
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
    if (total < 1) return "Add at least one dozen to continue.";
    return "";
  }

  function formValues(form) {
    const data = {};
    new FormData(form).forEach(function (value, key) {
      data[key] = String(value).trim();
    });
    return data;
  }

  function buildMailto(subject, body) {
    const email = config.inquiryEmail;
    if (!email) return "";
    return (
      "mailto:" +
      encodeURIComponent(email) +
      "?subject=" +
      encodeURIComponent(subject) +
      "&body=" +
      encodeURIComponent(body)
    );
  }

  function showNotice(id, message, isError) {
    const node = document.getElementById(id);
    if (!node) return;
    node.hidden = false;
    node.textContent = message;
    node.classList.toggle("notice-error", Boolean(isError));
    node.classList.toggle("notice-ok", !isError);
  }

  function optionalUpdatesLine(checked) {
    return checked
      ? "Also asked to join the email list for updates."
      : "Did not join the email list.";
  }

  function missingContact(fields, extras) {
    if (!fields.first || !fields.last) return "Add your first and last name.";
    if (!fields.email || fields.email.indexOf("@") === -1) return "Add a valid email.";
    if (!fields.phone) return "Add a phone number.";
    if (extras) return extras(fields);
    return "";
  }

  function handleOrderSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = formValues(form);
    const contactError = missingContact(fields, function (values) {
      if (!values.date) return "Choose a requested date.";
      return "";
    });
    if (contactError) {
      showNotice("order-notice", contactError, true);
      return;
    }
    const quantities = orderQuantities();
    const error = validateOrder(quantities);
    if (error) {
      showNotice("order-notice", error, true);
      return;
    }

    const flavors = availableFlavors()
      .map(function (flavor) {
        const qty = quantities[flavor.id] || 0;
        return qty ? flavor.name + ": " + qty + " dozen" : "";
      })
      .filter(Boolean)
      .join("\n");
    const total = Object.keys(quantities).reduce(function (sum, id) {
      return sum + (quantities[id] || 0);
    }, 0);

    const body = [
      "Tamale order inquiry",
      "",
      fields.first + " " + fields.last,
      fields.email,
      fields.phone,
      "",
      flavors,
      "Total: " + total + " dozen (" + money.format(total * config.pricePerDozen) + " before confirmation)",
      "Date: " + fields.date,
      "Receive: " + fields.receive,
      "",
      "Notes:",
      fields.notes || "(none)",
      "",
      optionalUpdatesLine(form.updates && form.updates.checked)
    ].join("\n");

    const mailto = buildMailto("Tamale order from " + fields.first + " " + fields.last, body);
    showNotice(
      "order-notice",
      "Thanks. This is an inquiry, not a paid order. We’ll confirm availability and a total before you pay." +
        (mailto ? " Your email app should open with the details." : " Add your inquiry email in config.js to receive these automatically."),
      false
    );
    if (mailto) window.location.href = mailto;
    form.reset();
    renderFlavorFields();
    updateOrderSummary();
  }

  function handleCateringSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = formValues(form);
    const contactError = missingContact(fields, function (values) {
      if (!values.guests || Number(values.guests) < 1) return "Add an estimated guest count.";
      if (!values.date) return "Choose an event date.";
      if (!values.location) return "Add the event location.";
      return "";
    });
    if (contactError) {
      showNotice("catering-notice", contactError, true);
      return;
    }
    const body = [
      "Catering inquiry",
      "",
      fields.first + " " + fields.last,
      fields.email,
      fields.phone,
      "",
      "Guest count: " + fields.guests,
      "Event date: " + fields.date,
      "Location: " + fields.location,
      "Service style: " + fields.style,
      "Food preferences: " + (fields.food || "(none)"),
      "",
      "Details:",
      fields.details || "(none)",
      "",
      optionalUpdatesLine(form.updates && form.updates.checked)
    ].join("\n");

    const mailto = buildMailto("Catering inquiry from " + fields.first + " " + fields.last, body);
    showNotice(
      "catering-notice",
      "Thanks. We’ll follow up with availability and a quote. Submitting this form does not book the date." +
        (mailto ? " Your email app should open with the details." : " Add your inquiry email in config.js to receive these automatically."),
      false
    );
    if (mailto) window.location.href = mailto;
    form.reset();
  }

  function handleEmailSignup(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(form.email.value || "").trim();
    if (!email) return;
    const mailto = buildMailto(
      "Email list signup",
      "Please add this address to the Arturo’s updates list:\n\n" + email
    );
    showNotice(
      "signup-notice",
      "You’re on the list request. We’ll send flavor, availability, and catering notes—not every inquiry is subscribed." +
        (mailto ? "" : " Add your inquiry email in config.js to collect signups."),
      false
    );
    if (mailto) window.location.href = mailto;
    form.reset();
  }

  function injectSeo() {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    const data = {
      "@context": "https://schema.org",
      "@type": "FoodEstablishment",
      name: config.businessName,
      description: config.tagline + ". Tamales " + priceLabel() + ".",
      areaServed: config.city + ", " + config.region,
      servesCuisine: "Mexican",
      priceRange: money.format(config.pricePerDozen) + " per dozen"
    };
    if (config.phone) data.telephone = config.phone;
    if (config.streetAddress) {
      data.address = {
        "@type": "PostalAddress",
        streetAddress: config.streetAddress,
        addressLocality: config.city,
        addressRegion: "MO"
      };
    }
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
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

  document.addEventListener("DOMContentLoaded", function () {
    setText("[data-price]", priceLabel());
    setText("[data-price-number]", money.format(config.pricePerDozen));
    setText("[data-business-name]", config.businessName);
    setText("[data-tagline]", config.tagline);
    setText("[data-area]", config.area);
    setText("[data-radius]", String(config.deliveryRadiusMiles));
    document.querySelectorAll("[data-payments]").forEach(function (link) {
      if (config.paymentsUrl) link.href = config.paymentsUrl;
    });
    document.querySelectorAll("[data-inbox]").forEach(function (link) {
      if (config.ownerInboxUrl) link.href = config.ownerInboxUrl;
    });

    renderMenu();
    renderFlavorFields();
    updateOrderSummary();
    injectSeo();
    setupNav();

    const flavorMount = document.getElementById("flavor-fields");
    if (flavorMount) {
      flavorMount.addEventListener("input", updateOrderSummary);
    }

    const orderForm = document.getElementById("order-form");
    if (orderForm) orderForm.addEventListener("submit", handleOrderSubmit);

    const cateringForm = document.getElementById("catering-form");
    if (cateringForm) cateringForm.addEventListener("submit", handleCateringSubmit);

    const signupForm = document.getElementById("signup-form");
    if (signupForm) signupForm.addEventListener("submit", handleEmailSignup);
  });
})();
