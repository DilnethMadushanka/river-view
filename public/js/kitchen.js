(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => "LKR " + n.toLocaleString("en-US");
  const TYPE = { "dine-in": "Table", room: "Room", pickup: "Pickup" };
  const NEXT = { new: ["preparing", "Start cooking"], preparing: ["ready", "Mark ready"], ready: ["completed", "Complete"] };

  let pin = sessionStorage.getItem("rv-pin") || "";
  let orders = new Map();
  let sound = true;
  let audio = null;
  let fresh = new Set();

  const api = async (url, opts = {}) => {
    const res = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", "x-kitchen-pin": pin } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || "Error"), { status: res.status });
    return data;
  };

  function beep() {
    if (!sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.18].forEach((t, i) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = i ? 988 : 784; o.connect(g); g.connect(audio.destination);
        g.gain.setValueAtTime(0.0001, audio.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.16);
        o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.18);
      });
    } catch (e) {}
  }

  const ago = (iso) => {
    const m = Math.max(0, Math.round((Date.now() - new Date(iso.replace(" ", "T") + "Z").getTime()) / 60000));
    return m < 1 ? "just now" : m + " min ago";
  };

  function ticket(o) {
    const [next, label] = NEXT[o.status];
    const where = o.order_type === "pickup" ? "Pickup" : `${TYPE[o.order_type]} ${esc(o.place)}`;
    return `<article class="ticket ${fresh.has(o.id) ? "fresh" : ""}" data-id="${o.id}">
      <header><span class="code">${esc(o.code)}</span><span class="age">${ago(o.created_at)}</span></header>
      <div class="where">${where}, ${esc(o.customer_name)}</div>
      <ul>${o.items.map((i) => `<li><b>${i.qty} x</b><span>${esc(i.name)}</span></li>`).join("")}</ul>
      ${o.notes ? `<div class="note">${esc(o.notes)}</div>` : ""}
      <div class="meta"><span>${esc(o.phone)}</span><span>${money(o.total)}</span></div>
      <div class="row">
        <button class="btn btn-primary btn-sm" data-go="${next}">${label}</button>
        ${o.status === "new" ? '<button class="btn btn-ghost btn-sm" data-go="cancelled" style="flex:0 0 auto">Cancel</button>' : ""}
      </div></article>`;
  }

  function render() {
    const all = [...orders.values()].sort((a, b) => a.id - b.id);
    ["new", "preparing", "ready"].forEach((s) => {
      const list = all.filter((o) => o.status === s);
      $("n-" + s).textContent = list.length;
      $("l-" + s).innerHTML = list.length ? list.map(ticket).join("") : '<p class="empty">No orders</p>';
    });
    const fin = all.filter((o) => o.status === "completed" || o.status === "cancelled").reverse();
    $("done-sum").textContent = `Finished today (${fin.length})`;
    $("l-done").innerHTML = fin.map((o) => `<li>${esc(o.code)}, ${esc(o.customer_name)}, ${money(o.total)}, ${o.status}</li>`).join("");
  }

  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-go]");
    if (!b) return;
    const id = b.closest(".ticket").dataset.id;
    b.disabled = true;
    try {
      const o = await api("/api/kitchen/orders/" + id, { method: "PATCH", body: JSON.stringify({ status: b.dataset.go }) });
      fresh.delete(o.id);
      orders.set(o.id, o); render();
    } catch (err) { b.disabled = false; alert(err.message); }
  });

  function connect() {
    const es = new EventSource("/api/kitchen/stream?pin=" + encodeURIComponent(pin));
    es.onopen = () => { $("conn").textContent = "Live"; };
    es.onerror = () => { $("conn").textContent = "Reconnecting"; };
    es.addEventListener("order", (e) => {
      const o = JSON.parse(e.data);
      orders.set(o.id, o); fresh.add(o.id); render(); beep();
    });
    es.addEventListener("update", (e) => {
      const o = JSON.parse(e.data);
      orders.set(o.id, o); render();
    });
  }

  async function loadOrders() {
    const rows = await api("/api/kitchen/orders");
    orders = new Map(rows.map((o) => [o.id, o]));
    render();
  }

  async function loadStock() {
    const items = await (await fetch("/api/menu")).json();
    const cats = [...new Set(items.map((i) => i.category))];
    $("stock").innerHTML = '<p class="lead">Untick a dish when it runs out. Customers will see it as sold out.</p>' +
      cats.map((c) => `<h2>${esc(c)}</h2>` + items.filter((i) => i.category === c).map((i) =>
        `<label><span>${esc(i.name)}</span><input type="checkbox" data-item="${i.id}" ${i.available ? "checked" : ""}></label>`).join("")).join("");
  }

  $("stock").addEventListener("change", async (e) => {
    const cb = e.target.closest("[data-item]");
    if (!cb) return;
    try { await api("/api/kitchen/items/" + cb.dataset.item, { method: "PATCH", body: JSON.stringify({ available: cb.checked }) }); }
    catch (err) { cb.checked = !cb.checked; alert(err.message); }
  });

  const tab = (name) => {
    $("orders").hidden = name !== "orders"; $("stock").hidden = name !== "stock";
    $("t-orders").setAttribute("aria-pressed", name === "orders");
    $("t-stock").setAttribute("aria-pressed", name === "stock");
    if (name === "stock") loadStock();
  };
  $("t-orders").onclick = () => tab("orders");
  $("t-stock").onclick = () => tab("stock");
  $("sound").onclick = () => {
    sound = !sound;
    $("sound").setAttribute("aria-pressed", sound);
    $("sound").innerHTML = `<i class="ph ${sound ? "ph-speaker-high" : "ph-speaker-slash"}"></i> Sound ${sound ? "on" : "off"}`;
    if (sound) beep();
  };

  async function start() {
    await api("/api/kitchen/check");
    sessionStorage.setItem("rv-pin", pin);
    $("gate").hidden = true; $("app").hidden = false;
    await loadOrders(); connect();
    setInterval(render, 30000);
  }

  $("gate").addEventListener("submit", async (e) => {
    e.preventDefault();
    pin = $("pin").value.trim();
    $("pin-err").textContent = "";
    try { await start(); beep(); }
    catch (err) { $("pin-err").textContent = err.status === 401 ? "Wrong PIN." : "Could not connect to the server."; }
  });

  if (pin) start().catch(() => { sessionStorage.removeItem("rv-pin"); });
})();
