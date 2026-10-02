const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { DatabaseSync } = require("node:sqlite");

const PORT = process.env.PORT || 3000;
const KITCHEN_PIN = process.env.KITCHEN_PIN || "1234";
const STATUSES = ["new", "preparing", "ready", "completed", "cancelled"];

/* Serverless hosts (Vercel) have a read-only project folder, so fall back to the temp folder.
   Data there is NOT permanent. Use a normal server (Render, Railway, VPS) for real orders. */
let dataDir = path.join(__dirname, "data");
try { fs.mkdirSync(dataDir, { recursive: true }); fs.accessSync(dataDir, fs.constants.W_OK); }
catch (e) { dataDir = os.tmpdir(); }
const db = new DatabaseSync(path.join(dataDir, "riverview.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price INTEGER NOT NULL,
    is_alcohol INTEGER NOT NULL DEFAULT 0,
    available INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    order_type TEXT NOT NULL,
    place TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    total INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    item_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    qty INTEGER NOT NULL
  );
`);

/* Sample menu. Edit prices and dishes to match the real menu. */
const SEED = [
  ["Rice and Curry", "Chicken Curry Rice and Curry", "Chicken curry with dhal, three vegetable curries, sambol and papadam.", 1450, 0],
  ["Rice and Curry", "Fish Ambul Thiyal Rice and Curry", "Sour fish curry with dhal, three vegetable curries and pol sambol.", 1650, 0],
  ["Rice and Curry", "Vegetable Rice and Curry", "Dhal, seasonal vegetable curries, mallum, sambol and papadam.", 1150, 0],
  ["Rice and Curry", "Prawn Curry Rice and Curry", "Coconut milk prawn curry with the usual sides.", 1950, 0],
  ["Starters", "Devilled Cuttlefish", "Fried cuttlefish tossed in a sweet chilli onion sauce.", 1350, 0],
  ["Starters", "Chicken Wings", "Crisp wings with garlic and chilli glaze.", 1250, 0],
  ["Starters", "Vegetable Spring Rolls", "Six rolls with sweet chilli dip.", 850, 0],
  ["Starters", "Tomato Soup", "Roasted tomato soup with garlic bread.", 750, 0],
  ["Mains", "Kottu Roti, Chicken", "Chopped roti with egg, vegetables and chicken, cooked on the griddle.", 1350, 0],
  ["Mains", "Kottu Roti, Cheese", "Chopped roti with egg, vegetables and melted cheese.", 1450, 0],
  ["Mains", "Nasi Goreng", "Fried rice with chicken, prawn, egg and acharu.", 1550, 0],
  ["Mains", "Grilled Chicken Steak", "Mushroom sauce, mashed potato and buttered vegetables.", 2250, 0],
  ["Mains", "Beef Pepper Steak", "Black pepper sauce, chips and salad.", 2650, 0],
  ["Mains", "Club Sandwich", "Chicken, egg, bacon, tomato and chips.", 1250, 0],
  ["Seafood", "River Fish, Fried or Grilled", "Catch of the day with garlic butter, chips and salad.", 2450, 0],
  ["Seafood", "Garlic Butter Prawns", "Prawns pan fried in garlic butter with rice.", 2850, 0],
  ["Seafood", "Crab Curry", "Whole crab in a spicy Jaffna style curry with bread or rice.", 4200, 0],
  ["Desserts", "Watalappan", "Coconut custard with jaggery and cashew.", 650, 0],
  ["Desserts", "Curd and Treacle", "Buffalo curd with kithul treacle.", 600, 0],
  ["Desserts", "Chocolate Brownie", "Warm brownie with vanilla ice cream.", 850, 0],
  ["Drinks", "King Coconut", "Served chilled.", 350, 0],
  ["Drinks", "Fresh Lime Juice", "With or without sugar.", 450, 0],
  ["Drinks", "Mango Lassi", "Yoghurt, mango and a little cardamom.", 650, 0],
  ["Drinks", "Ceylon Tea or Coffee", "Pot for one.", 400, 0],
  ["Drinks", "Soft Drink", "Coke, Sprite or Fanta.", 300, 0],
  ["Bar", "Lion Lager, 625ml", "Cold, bottled.", 1100, 1],
  ["Bar", "Draught Beer, Pint", "Ask the bar what is on tap.", 950, 1],
  ["Bar", "Arrack Sour", "Coconut arrack, lime, sugar, egg white.", 1450, 1],
  ["Bar", "River View Mojito", "Rum, mint, lime and soda.", 1550, 1],
  ["Bar", "Gin and Tonic", "Served with cucumber and lime.", 1650, 1],
  ["Bar", "House Red or White, Glass", "Ask for the label of the day.", 1750, 1],
];

if (db.prepare("SELECT COUNT(*) AS n FROM menu_items").get().n === 0) {
  const ins = db.prepare(
    "INSERT INTO menu_items (category, name, description, price, is_alcohol, sort) VALUES (?,?,?,?,?,?)"
  );
  SEED.forEach((r, i) => ins.run(r[0], r[1], r[2], r[3], r[4], i));
}

const app = express();
app.use(express.json({ limit: "20kb" }));

/* ---------- live updates for the kitchen screen ---------- */
const clients = new Set();
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

function requirePin(req, res, next) {
  const pin = req.get("x-kitchen-pin") || req.query.pin;
  if (pin !== KITCHEN_PIN) return res.status(401).json({ error: "Wrong PIN" });
  next();
}

function loadOrder(row) {
  if (!row) return null;
  const items = db
    .prepare("SELECT name, price, qty FROM order_items WHERE order_id = ? ORDER BY id")
    .all(row.id);
  return { ...row, items };
}

/* ---------- public API ---------- */
app.get("/api/menu", (req, res) => {
  const rows = db
    .prepare("SELECT id, category, name, description, price, is_alcohol, available FROM menu_items ORDER BY sort")
    .all();
  res.json(rows);
});

const hits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const list = (hits.get(req.ip) || []).filter((t) => now - t < 60000);
  if (list.length >= 5) return res.status(429).json({ error: "Too many orders. Please wait a minute." });
  list.push(now);
  hits.set(req.ip, list);
  next();
}

function makeCode() {
  for (let i = 0; i < 20; i++) {
    const code = "RV-" + Math.floor(1000 + Math.random() * 9000);
    if (!db.prepare("SELECT 1 FROM orders WHERE code = ?").get(code)) return code;
  }
  return "RV-" + Date.now().toString().slice(-6);
}

const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

app.post("/api/orders", rateLimit, (req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 60);
  const phone = clean(b.phone, 20);
  const type = ["dine-in", "room", "pickup"].includes(b.type) ? b.type : null;
  const place = clean(b.place, 20);
  const notes = clean(b.notes, 300);

  if (!name) return res.status(400).json({ error: "Please enter your name." });
  if (phone.replace(/\D/g, "").length < 9) return res.status(400).json({ error: "Please enter a valid phone number." });
  if (!type) return res.status(400).json({ error: "Choose dine in, room or pickup." });
  if (type !== "pickup" && !place)
    return res.status(400).json({ error: type === "room" ? "Please enter your room number." : "Please enter your table number." });
  if (!Array.isArray(b.items) || b.items.length === 0 || b.items.length > 40)
    return res.status(400).json({ error: "Your cart is empty." });

  const lookup = db.prepare("SELECT * FROM menu_items WHERE id = ?");
  const lines = [];
  let total = 0;
  let hasAlcohol = false;
  for (const it of b.items) {
    const qty = Math.floor(Number(it.qty));
    const row = lookup.get(Number(it.id));
    if (!row || !(qty >= 1 && qty <= 20)) return res.status(400).json({ error: "Invalid item in cart." });
    if (!row.available) return res.status(409).json({ error: `${row.name} is not available right now. Please remove it.` });
    if (row.is_alcohol) hasAlcohol = true;
    total += row.price * qty;
    lines.push({ id: row.id, name: row.name, price: row.price, qty });
  }
  if (hasAlcohol && !b.ageConfirmed)
    return res.status(400).json({ error: "Please confirm that you are 21 or older to order from the bar." });
  if (hasAlcohol && type === "pickup")
    return res.status(400).json({ error: "Bar items can only be served at the hotel. Choose dine in or room." });

  const code = makeCode();
  db.exec("BEGIN");
  try {
    const info = db
      .prepare("INSERT INTO orders (code, customer_name, phone, order_type, place, notes, total) VALUES (?,?,?,?,?,?,?)")
      .run(code, name, phone, type, place, notes, total);
    const insLine = db.prepare("INSERT INTO order_items (order_id, item_id, name, price, qty) VALUES (?,?,?,?,?)");
    for (const l of lines) insLine.run(info.lastInsertRowid, l.id, l.name, l.price, l.qty);
    db.exec("COMMIT");
    const order = loadOrder(db.prepare("SELECT * FROM orders WHERE id = ?").get(info.lastInsertRowid));
    broadcast("order", order);
    res.status(201).json({ code, total });
  } catch (e) {
    db.exec("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "Could not place the order. Please try again or call us." });
  }
});

app.get("/api/orders/:code", (req, res) => {
  const row = db.prepare("SELECT * FROM orders WHERE code = ?").get(clean(req.params.code, 12).toUpperCase());
  if (!row) return res.status(404).json({ error: "We could not find that order." });
  const o = loadOrder(row);
  res.json({ code: o.code, status: o.status, type: o.order_type, total: o.total, created_at: o.created_at, items: o.items });
});

/* ---------- kitchen API ---------- */
app.get("/api/kitchen/check", requirePin, (req, res) => res.json({ ok: true }));

app.get("/api/kitchen/orders", requirePin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT * FROM orders
       WHERE status IN ('new','preparing','ready')
          OR (status IN ('completed','cancelled') AND date(updated_at) = date('now'))
       ORDER BY id DESC LIMIT 200`
    )
    .all();
  res.json(rows.map(loadOrder));
});

app.patch("/api/kitchen/orders/:id", requirePin, (req, res) => {
  const status = req.body && req.body.status;
  if (!STATUSES.includes(status)) return res.status(400).json({ error: "Bad status" });
  const info = db
    .prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: "Order not found" });
  const order = loadOrder(db.prepare("SELECT * FROM orders WHERE id = ?").get(Number(req.params.id)));
  broadcast("update", order);
  res.json(order);
});

app.patch("/api/kitchen/items/:id", requirePin, (req, res) => {
  const available = req.body && req.body.available ? 1 : 0;
  const info = db.prepare("UPDATE menu_items SET available = ? WHERE id = ?").run(available, Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: "Item not found" });
  res.json({ ok: true });
});

app.get("/api/kitchen/stream", requirePin, (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  res.write("retry: 3000\n\n");
  clients.add(res);
  const ping = setInterval(() => res.write(": ping\n\n"), 25000);
  req.on("close", () => {
    clearInterval(ping);
    clients.delete(res);
  });
});

/* ---------- static files ---------- */
app.use("/fonts", express.static(path.join(__dirname, "node_modules/@fontsource-variable")));
app.use("/vendor/gsap", express.static(path.join(__dirname, "node_modules/gsap/dist")));
app.use("/vendor/lenis", express.static(path.join(__dirname, "node_modules/lenis/dist")));
app.use("/icons", express.static(path.join(__dirname, "node_modules/@phosphor-icons/web/src")));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

/* Photos: drop real files into public/img (for example hero.jpg).
   Until then, a stock placeholder is used so the layout can be reviewed. */
app.get("/img/:name", (req, res) => {
  const seed = path.parse(req.params.name).name.replace(/[^a-z0-9-]/gi, "");
  const dims = { hero: "1000/1300", wide: "1600/900", tall: "900/1200", room: "900/700", sq: "900/900" };
  const kind = (req.query.k && dims[req.query.k]) || dims.room;
  res.redirect(302, `https://picsum.photos/seed/riverview-${seed}/${kind}`);
});

if (require.main === module) app.listen(PORT, () => {
  console.log(`River View site:     http://localhost:${PORT}`);
  console.log(`Kitchen dashboard:   http://localhost:${PORT}/kitchen  (PIN: ${KITCHEN_PIN})`);
});

module.exports = app;
