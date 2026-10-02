(() => {
  const money = (n) => "LKR " + n.toLocaleString("en-US");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const menuEl = document.getElementById("menu");
  const catsEl = document.querySelector("#cats .wrap");
  const cartEl = document.getElementById("cart");
  const bodyEl = document.getElementById("cart-body");
  const barEl = document.getElementById("cart-bar");

  let items = [];
  let cart = {};
  let view = "cart";
  let form = { name: "", phone: "", type: "dine-in", place: "", notes: "", age: false };
  let error = "";
  let sending = false;
  let done = null;

  try { cart = JSON.parse(localStorage.getItem("rv-cart") || "{}"); } catch (e) { cart = {}; }
  const save = () => { try { localStorage.setItem("rv-cart", JSON.stringify(cart)); } catch (e) {} };

  const byId = (id) => items.find((i) => i.id === Number(id));
  const lines = () => Object.entries(cart).map(([id, qty]) => ({ item: byId(id), qty })).filter((l) => l.item && l.item.available);
  const count = () => lines().reduce((a, l) => a + l.qty, 0);
  const total = () => lines().reduce((a, l) => a + l.qty * l.item.price, 0);
  const hasAlcohol = () => lines().some((l) => l.item.is_alcohol);

  function setQty(id, qty) {
    if (qty <= 0) delete cart[id]; else cart[id] = Math.min(qty, 20);
    save();
    renderMenuActions();
    renderCart();
    const btn = document.querySelector("#cart-bar .btn");
    if (btn && qty > 0) { btn.classList.remove("bump"); void btn.offsetWidth; btn.classList.add("bump"); }
  }

  /* dishes fade up as they come into view */
  function revealDishes() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -6% 0px" });
    menuEl.querySelectorAll(".dish").forEach((d, i) => { d.classList.add("pre"); d.style.transitionDelay = (i % 4) * 60 + "ms"; io.observe(d); });
  }

  /* ---------- menu ---------- */
  function renderMenu() {
    const cats = [...new Set(items.map((i) => i.category))];
    catsEl.innerHTML = cats.map((c) => `<a href="#${slug(c)}" data-cat="${slug(c)}">${esc(c)}</a>`).join("");
    menuEl.innerHTML = cats.map((c) => {
      const list = items.filter((i) => i.category === c);
      const bar = list.some((i) => i.is_alcohol);
      return `<section class="cat" id="${slug(c)}">
        <h2>${esc(c)}</h2>
        ${bar ? '<p class="note">You must be 21 or older. Bar items are served at the table or in your room.</p>' : ""}
        ${list.map((i) => `<article class="dish ${i.available ? "" : "off"}" data-id="${i.id}">
          <h3>${esc(i.name)}</h3><span class="price">${money(i.price)}</span>
          <p>${esc(i.description)}</p>
          <div class="act">${i.available ? "" : '<span class="sold">Sold out today</span>'}</div>
        </article>`).join("")}
      </section>`;
    }).join("");
    renderMenuActions();
    revealDishes();
    if (location.hash) {
      const t = document.getElementById(location.hash.slice(1));
      if (t) t.scrollIntoView();
    }
  }

  function renderMenuActions() {
    menuEl.querySelectorAll(".dish").forEach((el) => {
      const id = el.dataset.id;
      const it = byId(id);
      if (!it || !it.available) return;
      const q = cart[id] || 0;
      el.querySelector(".act").innerHTML = q
        ? `<div class="qty"><button data-act="dec" aria-label="Remove one">-</button><span>${q}</span><button data-act="inc" aria-label="Add one">+</button></div>`
        : `<button class="btn btn-ghost btn-sm" data-act="inc"><i class="ph ph-plus"></i> Add</button>`;
    });
  }

  menuEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const id = b.closest(".dish").dataset.id;
    setQty(id, (cart[id] || 0) + (b.dataset.act === "inc" ? 1 : -1));
  });

  /* ---------- cart panel ---------- */
  function renderCart() {
    const ls = lines();
    const n = count();
    document.getElementById("bar-count").textContent = n;
    document.getElementById("bar-total").textContent = money(total());
    barEl.classList.toggle("show", n > 0 && !cartEl.classList.contains("open"));

    if (view === "done" && done) {
      bodyEl.innerHTML = `<div class="done">
        <i class="ph ph-check-circle big"></i>
        <h2>Order sent to the kitchen</h2>
        <div class="code">${esc(done.code)}</div>
        <p class="lead" style="margin-inline:auto">Keep this code. Use it to follow your order.</p>
        <div style="display:grid;gap:.75rem;margin-top:1.5rem">
          <a class="btn btn-primary" href="/track?code=${encodeURIComponent(done.code)}">Track order</a>
          <button class="btn btn-ghost" id="new-order">Start a new order</button>
        </div></div>`;
      return;
    }

    if (!ls.length) {
      view = "cart";
      bodyEl.innerHTML = `<h2>Your order</h2><p class="empty">Nothing here yet. Add a dish from the menu.</p>`;
      return;
    }

    if (view === "checkout") {
      const alc = hasAlcohol();
      if (alc && form.type === "pickup") form.type = "dine-in";
      bodyEl.innerHTML = `<h2>Your details</h2>
        <form id="checkout" novalidate>
          <div class="field"><label for="f-name">Name</label><input class="input" id="f-name" autocomplete="name" value="${esc(form.name)}"></div>
          <div class="field"><label for="f-phone">Phone</label><input class="input" id="f-phone" type="tel" autocomplete="tel" value="${esc(form.phone)}"><span class="hint">We call this number only if there is a problem with the order.</span></div>
          <fieldset style="border:0;padding:0;margin:0" class="field"><legend style="font-size:.9rem;font-weight:500;margin-bottom:.5rem">How do you want it?</legend>
            <div class="seg">
              <label><input type="radio" name="type" value="dine-in" ${form.type === "dine-in" ? "checked" : ""}><i class="ph ph-fork-knife"></i>Dine in</label>
              <label><input type="radio" name="type" value="room" ${form.type === "room" ? "checked" : ""}><i class="ph ph-bed"></i>To my room</label>
              <label><input type="radio" name="type" value="pickup" ${form.type === "pickup" ? "checked" : ""} ${alc ? "disabled" : ""}><i class="ph ph-shopping-bag"></i>Pickup</label>
            </div>
            ${alc ? '<span class="hint">Pickup is not available with bar items.</span>' : ""}
          </fieldset>
          <div class="field" id="place-field" ${form.type === "pickup" ? "hidden" : ""}><label for="f-place" id="place-label">${form.type === "room" ? "Room number" : "Table number"}</label><input class="input" id="f-place" value="${esc(form.place)}"></div>
          <div class="field"><label for="f-notes">Notes for the kitchen (optional)</label><textarea class="input" id="f-notes">${esc(form.notes)}</textarea><span class="hint">For example: less spicy, no onion.</span></div>
          ${alc ? `<label class="check"><input type="checkbox" id="f-age" ${form.age ? "checked" : ""}><span>I am 21 years or older.</span></label>` : ""}
          <div class="cart-total"><span>Total</span><span>${money(total())}</span></div>
          <p style="color:var(--muted);font-size:.85rem">Pay when your order arrives. Cash or card.</p>
          ${error ? `<p class="error-text" role="alert">${esc(error)}</p>` : ""}
          <button class="btn btn-primary" type="submit" ${sending ? "disabled" : ""}>${sending ? "Sending..." : "Place order"}</button>
          <button class="btn btn-ghost" type="button" id="back">Back to order</button>
        </form>`;
      return;
    }

    bodyEl.innerHTML = `<h2>Your order</h2>
      ${ls.map((l) => `<div class="cart-line" data-id="${l.item.id}">
        <b>${esc(l.item.name)}</b><span class="lt">${money(l.item.price * l.qty)}</span>
        <div class="qty"><button data-act="dec" aria-label="Remove one">-</button><span>${l.qty}</span><button data-act="inc" aria-label="Add one">+</button></div>
      </div>`).join("")}
      <div class="cart-total"><span>Total</span><span>${money(total())}</span></div>
      <button class="btn btn-primary" id="to-checkout" style="width:100%">Continue</button>`;
  }

  bodyEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (b) {
      const id = b.closest(".cart-line").dataset.id;
      setQty(id, (cart[id] || 0) + (b.dataset.act === "inc" ? 1 : -1));
      return;
    }
    if (e.target.id === "to-checkout") { view = "checkout"; error = ""; renderCart(); }
    if (e.target.id === "back") { readForm(); view = "cart"; renderCart(); }
    if (e.target.id === "new-order") { view = "cart"; done = null; cartEl.classList.remove("open"); lock(false); renderCart(); }
  });

  function readForm() {
    const g = (id) => document.getElementById(id);
    if (!g("f-name")) return;
    form.name = g("f-name").value;
    form.phone = g("f-phone").value;
    form.place = g("f-place").value;
    form.notes = g("f-notes").value;
    if (g("f-age")) form.age = g("f-age").checked;
    const t = bodyEl.querySelector('input[name="type"]:checked');
    if (t) form.type = t.value;
  }

  bodyEl.addEventListener("change", (e) => {
    if (e.target.name === "type") {
      readForm();
      document.getElementById("place-field").hidden = form.type === "pickup";
      document.getElementById("place-label").textContent = form.type === "room" ? "Room number" : "Table number";
    }
  });

  bodyEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    readForm();
    error = "";
    if (!form.name.trim()) error = "Please enter your name.";
    else if (form.phone.replace(/\D/g, "").length < 9) error = "Please enter a valid phone number.";
    else if (form.type !== "pickup" && !form.place.trim()) error = form.type === "room" ? "Please enter your room number." : "Please enter your table number.";
    else if (hasAlcohol() && !form.age) error = "Please confirm that you are 21 or older.";
    if (error) { renderCart(); return; }

    sending = true; renderCart();
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name, phone: form.phone, type: form.type, place: form.place, notes: form.notes, ageConfirmed: form.age,
          items: lines().map((l) => ({ id: l.item.id, qty: l.qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      done = data; cart = {}; save(); view = "done";
      renderMenuActions();
    } catch (err) {
      error = err.message || "Could not reach the server. Please call us.";
    }
    sending = false; renderCart();
  });

  /* mobile sheet */
  const lock = (on) => { document.documentElement.style.overflow = on ? "hidden" : ""; };
  document.getElementById("cart-open").addEventListener("click", () => { cartEl.classList.add("open"); lock(true); renderCart(); });
  document.getElementById("cart-close").addEventListener("click", () => { cartEl.classList.remove("open"); lock(false); renderCart(); });

  /* highlight the category chip for the section in view */
  function watchCats() {
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (e.isIntersecting) {
          catsEl.querySelectorAll("a").forEach((a) => a.classList.toggle("on", a.dataset.cat === e.target.id));
        }
      });
    }, { rootMargin: "-30% 0px -60% 0px" });
    menuEl.querySelectorAll(".cat").forEach((s) => io.observe(s));
  }

  /* ---------- load ---------- */
  async function load() {
    try {
      const res = await fetch("/api/menu");
      if (!res.ok) throw new Error("bad");
      items = await res.json();
      if (!items.length) { menuEl.innerHTML = '<p class="state">The menu is empty right now. Please call the hotel to order.</p>'; return; }
      renderMenu(); renderCart(); watchCats();
    } catch (e) {
      menuEl.innerHTML = '<div class="state"><p>We could not load the menu.</p><button class="btn btn-ghost" style="margin-top:1rem" id="retry">Try again</button></div>';
      document.getElementById("retry").onclick = () => { menuEl.innerHTML = '<div class="skel"></div><div class="skel"></div>'; load(); };
    }
  }
  renderCart();
  load();
})();
