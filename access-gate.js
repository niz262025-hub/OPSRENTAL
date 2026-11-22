(async function () {
  const gate = document.getElementById("access-gate");
  const app = document.getElementById("rental-app");
  function deny(message) {
    gate.replaceChildren();
    const panel = document.createElement("div");
    const text = document.createElement("p");
    text.textContent = message;
    const link = document.createElement("a");
    link.href = "/api/sso/return";
    link.textContent = "Return to MYOPS";
    panel.append(text, link);
    gate.append(panel);
  }
  try {
    const params = new URLSearchParams(location.hash.slice(1));
    const ticket = params.get("t");
    if (ticket) {
      history.replaceState(null, "", location.pathname + location.search);
      if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) throw new Error("Invalid launch ticket.");
      const redeem = await fetch("/api/sso/redeem", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket }), credentials: "same-origin", cache: "no-store"
      });
      if (!redeem.ok) throw new Error("MYOPS SSO launch was rejected.");
    }
    const response = await fetch("/api/sso/session", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error(response.status === 403 ? "OpsRental subscription or access is not active." : "Sign in through MYOPS to open OpsRental.");
    const result = await response.json();
    if (result.authenticated !== true || result.product !== "opsrental") throw new Error("Session verification failed.");
    const script = document.createElement("script");
    script.src = "/app.js";
    script.onload = () => {
      app.hidden = false;
      if (!result.activity_enabled) { gate.remove(); return; }
      gate.hidden = true;

      let lastAttempt = -Infinity;
      let requesting = false;
      async function renewOnInteraction(event) {
        if (!event.isTrusted || event.repeat || document.hidden || app.hidden || requesting) return;
        const now = performance.now();
        if (now - lastAttempt < 60_000) return;
        lastAttempt = now;
        requesting = true;
        try {
          const renewal = await fetch("/api/sso/session", {
            method: "POST", credentials: "same-origin", cache: "no-store",
          });
          if (renewal.status === 401 || renewal.status === 403) {
            app.hidden = true;
            gate.hidden = false;
            deny("Sign in through MYOPS to continue.");
          }
        } catch {
          // A transient request failure never extends the session locally.
        } finally {
          requesting = false;
        }
      }
      app.addEventListener("pointerdown", renewOnInteraction, { passive: true });
      app.addEventListener("keydown", renewOnInteraction);
    };
    script.onerror = () => deny("Unable to load OpsRental.");
    document.body.append(script);
  } catch (error) {
    deny(error instanceof Error ? error.message : "Access unavailable.");
  }
})();
