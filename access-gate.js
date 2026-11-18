(async function () {
  const gate = document.getElementById("access-gate");
  const app = document.getElementById("rental-app");
  function deny(message) {
    gate.replaceChildren();
    const panel = document.createElement("div");
    const text = document.createElement("p");
    text.textContent = message;
    const link = document.createElement("a");
    link.href = "https://www.myops.com.my/";
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
    script.onload = () => { app.hidden = false; gate.remove(); };
    script.onerror = () => deny("Unable to load OpsRental.");
    document.body.append(script);
  } catch (error) {
    deny(error instanceof Error ? error.message : "Access unavailable.");
  }
})();
