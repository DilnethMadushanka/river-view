(() => {
  const money = (n) => "LKR " + n.toLocaleString("en-US");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const input = document.getElementById("code");
  const err = document.getElementById("err");
  const out = document.getElementById("result");
  let timer = null;

  const STEPS = [
    { key: "new", icon: "ph-receipt", title: "Order received", text: "The kitchen has your order." },
    { key: "preparing", icon: "ph-cooking-pot", title: "Being prepared", text: "Your food is being cooked." },
    { key: "ready", icon: "ph-bell-ringing", title: "Ready", text: "Your order is ready to be served or collected." },
    { key: "completed", icon: "ph-check-circle", title: "Completed", text: "Enjoy your meal." },
  ];

  function render(o) {
    if (o.status === "cancelled") {
      out.innerHTML = `<p class="lead" style="margin-top:2rem">This order was cancelled. Please call the hotel if you have questions.</p>`;
      return;
    }
    const idx = STEPS.findIndex((s) => s.key === o.status);
    out.innerHTML = `<div class="steps">${STEPS.map((s, i) => `
      <div class="step ${i <= idx ? "on" : ""}"><span class="dot"><i class="ph ${s.icon}"></i></span><div><b>${s.title}</b>${i === idx ? s.text : ""}</div></div>`).join("")}</div>
      <div class="summary"><ul>${o.items.map((i) => `<li><span>${i.qty} x ${esc(i.name)}</span><span>${money(i.qty * i.price)}</span></li>`).join("")}
      <li style="font-weight:600;padding-top:.75rem"><span>Total</span><span>${money(o.total)}</span></li></ul></div>`;
  }

  async function check(code) {
    err.textContent = "";
    clearTimeout(timer);
    try {
      const res = await fetch("/api/orders/" + encodeURIComponent(code));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Not found");
      render(data);
      history.replaceState(null, "", "/track?code=" + encodeURIComponent(data.code));
      if (data.status !== "completed" && data.status !== "cancelled") timer = setTimeout(() => check(code), 8000);
    } catch (e) {
      out.innerHTML = "";
      err.textContent = e.message || "Could not check the order. Try again.";
    }
  }

  document.getElementById("f").addEventListener("submit", (e) => {
    e.preventDefault();
    const c = input.value.trim();
    if (!c) { err.textContent = "Please enter your order code."; return; }
    check(c);
  });

  const preset = new URLSearchParams(location.search).get("code");
  if (preset) { input.value = preset; check(preset); }
})();
