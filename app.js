const STORAGE_KEY = "haven-rental-data-v1";

const initialData = {
  properties: [
    { id: "p1", name: "Maple House", address: "24 Maple Street", city: "Portland", units: 4 },
    { id: "p2", name: "The Willow", address: "108 Willow Avenue", city: "Portland", units: 3 },
    { id: "p3", name: "Cedar Flats", address: "7 Cedar Lane", city: "Beaverton", units: 6 }
  ],
  tenancies: [
    { id: "t1", tenant: "Olivia Bennett", email: "olivia@example.com", propertyId: "p1", rent: 1850, dueDay: 1, startDate: "2025-08-01", endDate: "", status: "Active" },
    { id: "t2", tenant: "Ethan Brooks", email: "ethan@example.com", propertyId: "p2", rent: 1625, dueDay: 1, startDate: "2025-11-01", endDate: "", status: "Active" },
    { id: "t3", tenant: "Mia Chen", email: "mia@example.com", propertyId: "p3", rent: 2100, dueDay: 5, startDate: "2025-06-15", endDate: "", status: "Active" },
    { id: "t4", tenant: "Noah Williams", email: "noah@example.com", propertyId: "p1", rent: 1725, dueDay: 1, startDate: "2025-07-01", endDate: "", status: "Active" }
  ],
  payments: [
    { id: "r1", tenancyId: "t1", amount: 1850, date: "", status: "Paid", note: "" },
    { id: "r2", tenancyId: "t2", amount: 1625, date: "", status: "Paid", note: "" },
    { id: "r3", tenancyId: "t3", amount: 2100, date: "", status: "Pending", note: "" },
    { id: "r4", tenancyId: "t4", amount: 1725, date: "", status: "Pending", note: "" }
  ],
  tickets: [
    { id: "m1", title: "Kitchen tap is dripping", propertyId: "p1", tenancyId: "t1", priority: "Normal", status: "Open", description: "The kitchen faucet has been dripping steadily since yesterday.", createdAt: "2026-11-12" },
    { id: "m2", title: "Heating needs a check", propertyId: "p3", tenancyId: "t3", priority: "High", status: "In progress", description: "The thermostat is on, but the living room is not warming up.", createdAt: "2026-11-10" }
  ]
};

const clone = (value) => JSON.parse(JSON.stringify(value));
let data = loadData();
let toastTimer;

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && ["properties", "tenancies", "payments", "tickets"].every((key) => Array.isArray(saved[key]))) return saved;
  } catch {
    // Use sample data when local storage is unavailable or invalid.
  }
  return clone(initialData);
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    notify("Changes are visible, but could not be saved in this browser.");
  }
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function initials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
}

function propertyById(id) {
  return data.properties.find((property) => property.id === id);
}

function tenancyById(id) {
  return data.tenancies.find((tenancy) => tenancy.id === id);
}

function propertyName(id) {
  return propertyById(id)?.name || "Property removed";
}

function tenantName(id) {
  return tenancyById(id)?.tenant || "Tenant removed";
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function currentMonthPayments() {
  const month = monthKey(new Date());
  return data.payments.filter((payment) => !payment.date || payment.date.startsWith(month));
}

function paymentStatus(payment) {
  if (payment.status === "Paid") return "Paid";
  const tenancy = tenancyById(payment.tenancyId);
  const due = new Date();
  due.setDate(tenancy?.dueDay || 1);
  return due < new Date(new Date().setHours(0, 0, 0, 0)) ? "Overdue" : "Pending";
}

function badge(status) {
  const classes = {
    Paid: "paid", Pending: "pending", Overdue: "overdue", Active: "active",
    Open: "pending", "In progress": "progress", Resolved: "resolved",
    Normal: "normal", High: "high", Urgent: "urgent", Ended: "pending"
  };
  return `<span class="badge badge-${classes[status] || "pending"}">${escapeHTML(status)}</span>`;
}

function setTableState(tbodyId, emptyId, isEmpty) {
  document.getElementById(tbodyId).closest("table").classList.toggle("hidden", isEmpty);
  document.getElementById(emptyId).classList.toggle("hidden", !isEmpty);
}

function renderDashboard() {
  const properties = data.properties;
  const tenancies = data.tenancies.filter((tenancy) => tenancy.status === "Active");
  const thisMonth = currentMonthPayments();
  const collected = thisMonth.filter((payment) => payment.status === "Paid").reduce((sum, payment) => sum + Number(payment.amount), 0);
  const total = thisMonth.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const openTickets = data.tickets.filter((ticket) => ticket.status !== "Resolved");
  const occupied = tenancies.length;
  const totalUnits = properties.reduce((sum, property) => sum + Number(property.units), 0);
  const stats = [
    ["Properties", properties.length, `${totalUnits} total units`, "▦"],
    ["Occupied units", `${occupied} / ${totalUnits}`, `${totalUnits ? Math.round((occupied / totalUnits) * 100) : 0}% occupancy rate`, "⌂"],
    ["Monthly rent", money(tenancies.reduce((sum, tenancy) => sum + Number(tenancy.rent), 0)), "Across active tenancies", "＄"],
    ["Open maintenance", openTickets.length, `${data.tickets.filter((ticket) => ticket.priority === "Urgent" && ticket.status !== "Resolved").length} urgent requests`, "⚒"]
  ];
  document.getElementById("dashboard-stats").innerHTML = stats.map(([title, amount, note, icon]) => `<article class="stat-card"><div class="stat-top">${title}<span class="stat-icon">${icon}</span></div><strong>${amount}</strong><div class="stat-note">${note}</div></article>`).join("");
  document.getElementById("rent-collected").textContent = money(collected);
  document.getElementById("rent-total").textContent = `of ${money(total)} expected`;
  document.getElementById("rent-progress").style.width = `${total ? Math.min(100, Math.round(collected / total * 100)) : 0}%`;
  document.getElementById("rent-rate").textContent = `${total ? Math.round(collected / total * 100) : 0}% collected`;
  document.getElementById("rent-list").innerHTML = thisMonth.length ? thisMonth.map((payment) => `<div class="rent-row"><span class="rent-avatar">${escapeHTML(initials(tenantName(payment.tenancyId)))}</span><span class="rent-person"><strong>${escapeHTML(tenantName(payment.tenancyId))}</strong><small>${escapeHTML(propertyName(tenancyById(payment.tenancyId)?.propertyId))}</small></span><span class="rent-amount">${money(payment.amount)}</span>${badge(paymentStatus(payment))}</div>`).join("") : '<div class="empty-inline">No rent recorded for this month.</div>';
  document.getElementById("attention-list").innerHTML = openTickets.length ? openTickets.slice(0, 4).map((ticket) => `<div class="attention-item"><span class="attention-icon">⚒</span><span class="attention-copy"><strong>${escapeHTML(ticket.title)}</strong><small>${escapeHTML(propertyName(ticket.propertyId))} · ${escapeHTML(formatDate(ticket.createdAt))}</small></span><span class="attention-priority">${escapeHTML(ticket.priority)}</span></div>`).join("") : '<div class="empty-inline">All caught up. No open requests.</div>';
  document.getElementById("dashboard-properties").innerHTML = properties.length ? properties.slice(0, 3).map((property) => {
    const occupiedUnits = tenancies.filter((tenancy) => tenancy.propertyId === property.id).length;
    const rent = tenancies.filter((tenancy) => tenancy.propertyId === property.id).reduce((sum, tenancy) => sum + Number(tenancy.rent), 0);
    return `<article class="property-tile"><div class="property-art"><div class="property-building"></div></div><div class="property-info"><strong>${escapeHTML(property.name)}</strong><p>${escapeHTML(property.address)}, ${escapeHTML(property.city)}</p><div class="property-meta"><span>${occupiedUnits} of ${property.units} units</span><strong>${money(rent)}/mo</strong></div></div></article>`;
  }).join("") : '<div class="empty-inline">Add your first property to get started.</div>';
}

function renderProperties() {
  const occupied = data.tenancies.filter((tenancy) => tenancy.status === "Active");
  document.getElementById("properties-summary").textContent = `${data.properties.length} properties · ${data.properties.reduce((sum, property) => sum + Number(property.units), 0)} total units`;
  document.getElementById("properties-table").innerHTML = data.properties.map((property) => {
    const tenants = occupied.filter((tenancy) => tenancy.propertyId === property.id);
    const rent = tenants.reduce((sum, tenancy) => sum + Number(tenancy.rent), 0);
    return `<tr><td><strong>${escapeHTML(property.name)}</strong></td><td>${escapeHTML(property.address)}, ${escapeHTML(property.city)}</td><td>${property.units}</td><td>${tenants.length} / ${property.units} occupied</td><td>${money(rent)} <small>per month</small></td></tr>`;
  }).join("");
  setTableState("properties-table", "properties-empty", !data.properties.length);
}

function renderTenancies() {
  const active = data.tenancies.filter((tenancy) => tenancy.status === "Active");
  document.getElementById("tenancies-summary").textContent = `${active.length} active ${active.length === 1 ? "tenancy" : "tenancies"} · ${money(active.reduce((sum, tenancy) => sum + Number(tenancy.rent), 0))} monthly rent`;
  document.getElementById("tenancies-table").innerHTML = data.tenancies.map((tenancy) => `<tr><td><strong>${escapeHTML(tenancy.tenant)}</strong><small>${escapeHTML(tenancy.email || "No email provided")}</small></td><td>${escapeHTML(propertyName(tenancy.propertyId))}</td><td>${formatDate(tenancy.startDate)}${tenancy.endDate ? ` – ${formatDate(tenancy.endDate)}` : " – Ongoing"}</td><td>${money(tenancy.rent)} <small>due on day ${tenancy.dueDay}</small></td><td>${badge(tenancy.status)}</td></tr>`).join("");
  setTableState("tenancies-table", "tenancies-empty", !data.tenancies.length);
}

function renderPayments() {
  const payments = currentMonthPayments();
  const collected = payments.filter((payment) => payment.status === "Paid").reduce((sum, payment) => sum + Number(payment.amount), 0);
  document.getElementById("payments-summary").textContent = `${money(collected)} collected this month · ${payments.filter((payment) => payment.status !== "Paid").length} outstanding`;
  document.getElementById("payments-table").innerHTML = data.payments.map((payment) => {
    const tenancy = tenancyById(payment.tenancyId);
    const status = paymentStatus(payment);
    return `<tr><td><strong>${escapeHTML(tenantName(payment.tenancyId))}</strong>${payment.note ? `<small>${escapeHTML(payment.note)}</small>` : ""}</td><td>${escapeHTML(propertyName(tenancy?.propertyId))}</td><td>${formatDate(payment.date || dueDateFor(tenancy))}</td><td>${money(payment.amount)}</td><td>${badge(status)}</td><td>${payment.status !== "Paid" ? `<button class="payment-action" type="button" data-mark-paid="${escapeHTML(payment.id)}">Mark paid</button>` : ""}</td></tr>`;
  }).join("");
  setTableState("payments-table", "payments-empty", !data.payments.length);
}

function dueDateFor(tenancy) {
  const now = new Date();
  return `${monthKey(now)}-${String(tenancy?.dueDay || 1).padStart(2, "0")}`;
}

function renderTickets() {
  const tickets = data.tickets;
  const open = tickets.filter((ticket) => ticket.status !== "Resolved").length;
  document.getElementById("maintenance-summary").textContent = `${open} open · ${tickets.length - open} resolved`;
  document.getElementById("tickets-list").innerHTML = tickets.map((ticket) => `<article class="ticket-card"><div class="ticket-top"><span class="ticket-mark">⚒</span><div class="ticket-copy"><h3>${escapeHTML(ticket.title)}</h3><p>${escapeHTML(ticket.description || "No additional details provided.")}</p><div class="ticket-meta"><span>${escapeHTML(propertyName(ticket.propertyId))}</span><span>${escapeHTML(tenantName(ticket.tenancyId))}</span><span>Reported ${formatDate(ticket.createdAt)}</span></div></div><div class="ticket-actions">${badge(ticket.priority)}<select aria-label="Update status for ${escapeHTML(ticket.title)}" data-ticket-status="${escapeHTML(ticket.id)}"><option${ticket.status === "Open" ? " selected" : ""}>Open</option><option${ticket.status === "In progress" ? " selected" : ""}>In progress</option><option${ticket.status === "Resolved" ? " selected" : ""}>Resolved</option></select></div></div></article>`).join("");
  document.getElementById("tickets-empty").classList.toggle("hidden", tickets.length > 0);
  document.getElementById("tickets-list").classList.toggle("hidden", !tickets.length);
}

function render() {
  renderDashboard();
  renderProperties();
  renderTenancies();
  renderPayments();
  renderTickets();
  updateSelects();
}

function updateSelects() {
  const propertyOptions = data.properties.map((property) => `<option value="${escapeHTML(property.id)}">${escapeHTML(property.name)} · ${escapeHTML(property.address)}</option>`).join("");
  document.querySelectorAll('select[name="propertyId"]').forEach((select) => {
    const previous = select.value;
    select.innerHTML = propertyOptions;
    if (data.properties.some((property) => property.id === previous)) select.value = previous;
    select.disabled = !data.properties.length;
  });
  const tenancyOptions = data.tenancies.map((tenancy) => `<option value="${escapeHTML(tenancy.id)}">${escapeHTML(tenancy.tenant)} · ${escapeHTML(propertyName(tenancy.propertyId))}</option>`).join("");
  document.querySelectorAll('select[name="tenancyId"]').forEach((select) => {
    const previous = select.value;
    select.innerHTML = select.name === "tenancyId" && select.closest("#ticket-form") ? '<option value="">Not specified</option>' + tenancyOptions : tenancyOptions;
    if (data.tenancies.some((tenancy) => tenancy.id === previous)) select.value = previous;
    select.disabled = !data.tenancies.length && !select.closest("#ticket-form");
  });
  const hasProperties = data.properties.length > 0;
  document.querySelector('#tenancy-form button[type="submit"]').disabled = !hasProperties;
  document.querySelector('#ticket-form button[type="submit"]').disabled = !hasProperties;
  document.querySelector('#payment-form button[type="submit"]').disabled = !data.tenancies.length;
}

function notify(message) {
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.textContent = message;
  document.body.append(toast);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.remove(), 2800);
}

function addRecord(collection, record) {
  data[collection].unshift({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, ...record });
  saveData();
  render();
}

document.querySelectorAll("[data-view]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const view = link.dataset.view;
    document.querySelectorAll(".view").forEach((section) => section.classList.toggle("active", section.id === `${view}-view`));
    document.querySelectorAll(".nav-link").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
    document.getElementById("breadcrumb-current").textContent = link.textContent.trim();
    history.replaceState(null, "", `#${view}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

document.querySelectorAll("[data-open-dialog]").forEach((button) => {
  button.addEventListener("click", () => {
    updateSelects();
    document.getElementById(button.dataset.openDialog).showModal();
  });
});

document.querySelectorAll(".close-button").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
}));

document.getElementById("property-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = new FormData(form);
  addRecord("properties", { name: fields.get("name").trim(), address: fields.get("address").trim(), city: fields.get("city").trim(), units: Number(fields.get("units")) });
  form.reset();
  form.elements.units.value = "1";
  document.getElementById("property-dialog").close();
  notify("Property added to your portfolio.");
});

document.getElementById("tenancy-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = new FormData(form);
  const startDate = fields.get("startDate");
  const endDate = fields.get("endDate");
  if (endDate && endDate < startDate) {
    form.elements.endDate.setCustomValidity("Lease end date must be on or after the start date.");
    form.elements.endDate.reportValidity();
    form.elements.endDate.setCustomValidity("");
    return;
  }
  const tenancy = { tenant: fields.get("tenant").trim(), email: fields.get("email").trim(), propertyId: fields.get("propertyId"), rent: Number(fields.get("rent")), dueDay: Number(fields.get("dueDay")), startDate, endDate, status: "Active" };
  addRecord("tenancies", tenancy);
  const firstPayment = { tenancyId: tenancy.id, amount: tenancy.rent, date: "", status: "Pending", note: "Monthly rent" };
  data.payments.unshift({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, ...firstPayment });
  saveData();
  render();
  form.reset();
  document.getElementById("tenancy-dialog").close();
  notify("Tenancy added. Rent tracking is ready.");
});

document.getElementById("payment-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const fields = new FormData(event.currentTarget);
  addRecord("payments", { tenancyId: fields.get("tenancyId"), amount: Number(fields.get("amount")), date: fields.get("date"), status: "Paid", note: fields.get("note").trim() });
  event.currentTarget.reset();
  document.getElementById("payment-dialog").close();
  notify("Payment recorded.");
});

document.getElementById("ticket-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const fields = new FormData(event.currentTarget);
  addRecord("tickets", { title: fields.get("title").trim(), propertyId: fields.get("propertyId"), tenancyId: fields.get("tenancyId"), priority: fields.get("priority"), status: fields.get("status"), description: fields.get("description").trim(), createdAt: new Date().toISOString().slice(0, 10) });
  event.currentTarget.reset();
  document.getElementById("ticket-dialog").close();
  notify("Maintenance ticket created.");
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-mark-paid]");
  if (!button) return;
  const payment = data.payments.find((item) => item.id === button.dataset.markPaid);
  if (!payment) return;
  payment.status = "Paid";
  payment.date = new Date().toISOString().slice(0, 10);
  saveData();
  render();
  notify("Rent marked as paid.");
});

document.addEventListener("change", (event) => {
  const select = event.target.closest("[data-ticket-status]");
  if (!select) return;
  const ticket = data.tickets.find((item) => item.id === select.dataset.ticketStatus);
  if (!ticket) return;
  ticket.status = select.value;
  saveData();
  render();
  notify(`Ticket marked ${ticket.status.toLowerCase()}.`);
});

document.getElementById("notifications-button").addEventListener("click", () => {
  const open = data.tickets.filter((ticket) => ticket.status !== "Resolved").length;
  const outstanding = data.payments.filter((payment) => paymentStatus(payment) !== "Paid").length;
  notify(open || outstanding ? `${open} open maintenance request${open === 1 ? "" : "s"} · ${outstanding} rent payment${outstanding === 1 ? "" : "s"} outstanding` : "You’re all caught up.");
});

const now = new Date();
document.getElementById("today-label").textContent = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
document.getElementById("greeting").textContent = now.getHours() < 12 ? "YOUR RENTAL PORTFOLIO" : "YOUR RENTAL PORTFOLIO";
const initialView = window.location.hash.slice(1);
const initialLink = document.querySelector(`[data-view="${initialView}"]`);
if (initialLink) initialLink.click();
render();
