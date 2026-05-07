const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { URL } = require("url");

const ROOT = path.resolve(__dirname, "..");
const ITEMS_CSV = path.join(ROOT, "data", "processed", "estimate_items.csv");
const FILES_CSV = path.join(ROOT, "data", "processed", "estimate_files.csv");
const EXPORT_ROOT = path.join(ROOT, "data", "exports");
const PORT = Number(process.env.PORT || 8787);
const PYTHON_EXE = process.env.PYTHON_EXE || "C:\\Users\\user\\AppData\\Local\\Programs\\Python\\Python314\\python.exe";

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^0-9a-zA-Z\uac00-\ud7a3]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const headers = rows.shift() || [];
  return rows.map((values) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header.replace(/^\uFEFF/, "")] = values[index] || "";
    });
    return record;
  });
}

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return parseCsv(fs.readFileSync(filePath, "utf8"));
}

function toNumber(value) {
  const number = Number(String(value || "").replace(/,/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function score(row, tokens) {
  const fields = {
    spec: normalize(row.spec),
    category: normalize(row.item_category),
    customer: normalize(row.customer_hint),
    recipient: normalize(row.recipient),
    attention: normalize(row.attention),
    file: normalize(row.source_file),
  };
  const all = Object.values(fields).join(" ");
  let total = 0;

  for (const token of tokens) {
    if (!all.includes(token)) return 0;
    if (fields.spec.includes(token)) total += 60;
    if (fields.category.includes(token)) total += 20;
    if (fields.customer.includes(token)) total += 15;
    if (fields.recipient.includes(token) || fields.attention.includes(token)) total += 12;
    if (fields.file.includes(token)) total += 8;
  }
  return total;
}

function queryGroups(query) {
  return String(query || "")
    .split(/[,|]+/)
    .map((part) => normalize(part).split(" ").filter(Boolean))
    .filter((tokens) => tokens.length);
}

function scoreQuery(row, groups) {
  if (!groups.length) return 1;
  return Math.max(...groups.map((tokens) => score(row, tokens)));
}

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function runPython(script, args) {
  return new Promise((resolve, reject) => {
    execFile(PYTHON_EXE, [script, ...args], { cwd: ROOT, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

function page(res) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title></title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7f8;
      --panel: #ffffff;
      --line: #d9e1e5;
      --text: #172026;
      --muted: #60717a;
      --accent: #156f72;
      --accent-strong: #0f5658;
      --soft: #eaf3f3;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "Malgun Gothic", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      letter-spacing: 0;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 22px;
      border-bottom: 1px solid var(--line);
      background: #fff;
    }
    h1 { margin: 0; font-size: 22px; }
    main {
      display: grid;
      grid-template-columns: 300px minmax(0, 1fr) 560px;
      min-height: calc(100vh - 62px);
    }
    aside, .draft {
      padding: 16px;
      background: #fbfcfc;
    }
    aside { border-right: 1px solid var(--line); }
    .draft { border-left: 1px solid var(--line); }
    section { padding: 16px; overflow: auto; }
    label {
      display: block;
      margin: 13px 0 6px;
      font-size: 13px;
      font-weight: 700;
    }
    input, select {
      width: 100%;
      height: 38px;
      border: 1px solid #cbd6db;
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 14px;
      background: white;
    }
    button {
      min-height: 34px;
      border: 1px solid var(--accent);
      border-radius: 6px;
      padding: 0 10px;
      background: var(--accent);
      color: white;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
    }
    button.secondary {
      color: var(--accent-strong);
      background: white;
    }
    button.ghost {
      border-color: #cbd6db;
      background: white;
      color: #33444b;
    }
    .actions { display: flex; gap: 8px; margin-top: 14px; }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(118px, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }
    .stat {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      padding: 12px;
    }
    .stat b { display: block; margin-top: 4px; font-size: 19px; }
    .hint { color: var(--muted); font-size: 12px; line-height: 1.45; }
    .pill {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 999px;
      background: var(--soft);
      color: #174f51;
      font-size: 12px;
      font-weight: 700;
    }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border: 1px solid var(--line);
      font-size: 13px;
    }
    th, td {
      border-bottom: 1px solid #e7ecef;
      padding: 8px;
      text-align: left;
      vertical-align: top;
    }
    th {
      position: sticky;
      top: 0;
      z-index: 1;
      background: #edf4f5;
      font-size: 12px;
    }
    tr:hover td { background: #f8fbfb; }
    .price, .qty { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .spec { min-width: 320px; max-width: 560px; line-height: 1.35; }
    .draft-list {
      display: grid;
      gap: 5px;
      max-height: 470px;
      overflow: auto;
      margin-top: 10px;
    }
    .draft-item {
      display: grid;
      grid-template-columns: minmax(150px, 1fr) 54px 86px 86px 42px;
      gap: 6px;
      align-items: start;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: white;
      padding: 6px;
    }
    .draft-item strong {
      display: block;
      margin-bottom: 2px;
      line-height: 1.35;
      font-size: 12px;
    }
    .draft-head {
      display: grid;
      grid-template-columns: minmax(150px, 1fr) 54px 86px 86px 42px;
      gap: 6px;
      margin-top: 10px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
    }
    .draft-cell input {
      height: 30px;
      padding: 5px 6px;
      font-size: 12px;
    }
    .draft-item button {
      min-height: 30px;
      padding: 0 7px;
      font-size: 12px;
    }
    .bulk-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      margin-top: 10px;
    }
    .draft-total {
      margin-top: 14px;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
    }
    .draft-total b {
      display: block;
      font-size: 22px;
      margin-top: 4px;
    }
    @media (max-width: 1180px) {
      main { grid-template-columns: 280px minmax(0, 1fr); }
      .draft { grid-column: 1 / -1; border-left: 0; border-top: 1px solid var(--line); }
    }
    @media (max-width: 860px) {
      main { grid-template-columns: 1fr; }
      aside { border-right: 0; border-bottom: 1px solid var(--line); }
      .stats { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
    }
  </style>
</head>
<body>
  <header>
    <h1 id="title"></h1>
    <div class="hint" id="updated"></div>
  </header>
  <main>
    <aside>
      <label id="qLabel" for="q"></label>
      <input id="q" autofocus />
      <label id="customerLabel" for="customer"></label>
      <select id="customer"><option value="" id="allCustomer"></option></select>
      <label id="categoryLabel" for="category"></label>
      <select id="category"><option value="" id="allCategory"></option></select>
      <label id="limitLabel" for="limit"></label>
      <select id="limit"><option>30</option><option>50</option><option>100</option><option>200</option></select>
      <div class="actions">
        <button id="search"></button>
        <button class="secondary" id="reset"></button>
      </div>
      <div class="actions">
        <button class="secondary" id="refreshData"></button>
      </div>
      <p class="hint" id="usage"></p>
      <p class="hint" id="refreshStatus"></p>
    </aside>
    <section>
      <div class="stats">
        <div class="stat"><span class="hint" id="countLabel"></span><b id="count">0</b></div>
        <div class="stat"><span class="hint" id="minLabel"></span><b id="minPrice">-</b></div>
        <div class="stat"><span class="hint" id="maxLabel"></span><b id="maxPrice">-</b></div>
        <div class="stat"><span class="hint" id="avgLabel"></span><b id="avgPrice">-</b></div>
      </div>
      <div class="toolbar">
        <div><span class="pill" id="queryLabel"></span></div>
        <div class="hint" id="priceHint"></div>
      </div>
      <table>
        <thead><tr id="headRow"></tr></thead>
        <tbody id="rows"></tbody>
      </table>
    </section>
    <aside class="draft">
      <h2 id="draftTitle"></h2>
      <div class="hint" id="draftHint"></div>
      <label id="draftCustomerLabel" for="draftCustomer"></label>
      <input id="draftCustomer" />
      <label id="draftAttentionLabel" for="draftAttention"></label>
      <input id="draftAttention" />
      <label id="draftTitleLabel" for="draftTitleInput"></label>
      <input id="draftTitleInput" />
      <label id="bulkQtyLabel" for="bulkQty"></label>
      <div class="bulk-row">
        <input id="bulkQty" />
        <button class="secondary" id="applyBulkQty"></button>
      </div>
      <div class="draft-head" id="draftHead"></div>
      <div class="draft-list" id="draftRows"></div>
      <div class="draft-total">
        <span class="hint" id="draftTotalLabel"></span>
        <b id="draftTotal">0</b>
      </div>
      <div class="actions">
        <button id="copyDraft"></button>
        <button id="createQuote"></button>
        <button class="secondary" id="clearDraft"></button>
      </div>
      <p class="hint" id="exportStatus"></p>
    </aside>
  </main>
  <script>
    const T = {
      title: "\\uac70\\ub798\\ucc98 \\uacac\\uc801\\uc11c",
      updated: "\\ub370\\uc774\\ud130 \\ud655\\uc778 \\uc911",
      qLabel: "\\uac80\\uc0c9\\uc5b4",
      qPlaceholder: "\\uc608: 5060, 12400F \\ucf00\\uc774\\uc81c\\uc774\\uc528, \\ub9c8\\uc774\\ud06c\\ub860 1TB, 12700 z790",
      customerLabel: "\\uc5c5\\uccb4/\\ud3f4\\ub354",
      categoryLabel: "\\ud488\\ubaa9",
      all: "\\uc804\\uccb4",
      limitLabel: "\\ud45c\\uc2dc \\uac1c\\uc218",
      search: "\\uac80\\uc0c9",
      reset: "\\ucd08\\uae30\\ud654",
      usage: "\\uc9c1\\uc811 \\ub9cc\\ub4e0 \\uacac\\uc801\\uc11c\\ub294 data/raw_estimates/\\uacac\\uc801\\uc11c/\\uc5c5\\uccb4\\uba85 \\ud3f4\\ub354\\uc5d0 \\ub123\\uace0 \\ub370\\uc774\\ud130 \\uac31\\uc2e0\\uc744 \\ub204\\ub974\\uba74 \\uac80\\uc0c9\\uc5d0 \\ubc18\\uc601\\ub429\\ub2c8\\ub2e4.",
      refreshData: "\\ub370\\uc774\\ud130 \\uac31\\uc2e0",
      refreshing: "\\ub370\\uc774\\ud130\\ub97c \\uac31\\uc2e0\\ud558\\ub294 \\uc911\\uc785\\ub2c8\\ub2e4...",
      refreshed: "\\ub370\\uc774\\ud130 \\uac31\\uc2e0 \\uc644\\ub8cc",
      refreshFailed: "\\ub370\\uc774\\ud130 \\uac31\\uc2e0 \\uc2e4\\ud328",
      countLabel: "\\uac80\\uc0c9 \\uacb0\\uacfc",
      minLabel: "\\ucd5c\\uc800 \\ub2e8\\uac00",
      maxLabel: "\\ucd5c\\uace0 \\ub2e8\\uac00",
      avgLabel: "\\ud3c9\\uade0 \\ub2e8\\uac00",
      allData: "\\uc804\\uccb4 \\ub370\\uc774\\ud130",
      query: "\\uac80\\uc0c9",
      priceHint: "\\ub2e8\\uac00\\ub294 \\uae30\\uc874 \\uacac\\uc801 \\uae30\\uc900\\uc785\\ub2c8\\ub2e4.",
      draftTitle: "\\uc0c8 \\uacac\\uc801 \\ucd08\\uc548",
      draftHint: "\\uac80\\uc0c9 \\uacb0\\uacfc\\uc5d0\\uc11c \\ucd94\\uac00\\ub97c \\ub204\\ub974\\uba74 \\uc774\\uacf3\\uc5d0 \\ubaa8\\uc785\\ub2c8\\ub2e4.",
      draftTotalLabel: "\\ucd08\\uc548 \\ud569\\uacc4",
      copyDraft: "\\ucd08\\uc548 \\ubcf5\\uc0ac",
      clearDraft: "\\ube44\\uc6b0\\uae30",
      add: "\\ucd94\\uac00",
      remove: "\\uc0ad\\uc81c",
      copied: "\\ud074\\ub9bd\\ubcf4\\ub4dc\\uc5d0 \\ubcf5\\uc0ac\\ub410\\uc2b5\\ub2c8\\ub2e4.",
      emptyDraft: "\\ucd08\\uc548\\uc5d0 \\ub2f4\\uae34 \\ud488\\ubaa9\\uc774 \\uc5c6\\uc2b5\\ub2c8\\ub2e4.",
      customerName: "\\uc218\\uc2e0/\\uac70\\ub798\\ucc98",
      attentionName: "\\ucc38\\uc870",
      quoteTitle: "\\uacac\\uc801\\uba85",
      bulkQty: "\\uc804\\uccb4 \\uc218\\ub7c9",
      applyBulkQty: "\\uc801\\uc6a9",
      createQuote: "\\uacac\\uc801\\uc11c \\ud30c\\uc77c \\ub9cc\\ub4e4\\uae30",
      quoteCreated: "\\uacac\\uc801\\uc11c\\uac00 \\uc0dd\\uc131\\ub418\\uace0 \\uac80\\uc0c9 \\ub370\\uc774\\ud130\\uc5d0 \\ubc18\\uc601\\ub410\\uc2b5\\ub2c8\\ub2e4.",
      quoteCreateFailed: "\\uacac\\uc801\\uc11c \\uc0dd\\uc131\\uc5d0 \\uc2e4\\ud328\\ud588\\uc2b5\\ub2c8\\ub2e4.",
      draftHeaders: ["\\ubd80\\ud488", "\\uc218\\ub7c9", "VAT incl", "VAT excl", ""],
      headers: ["\\uc120\\ud0dd", "\\uacac\\uc801\\uc77c", "\\uc5c5\\uccb4", "\\uc218\\uc2e0/\\ucc38\\uc870", "\\ud488\\ubaa9", "\\ubd80\\ud488\\uba85/\\uaddc\\uaca9", "\\uc218\\ub7c9", "\\ub2e8\\uac00", "\\uc6d0\\ubcf8"],
    };

    const els = {
      q: document.querySelector("#q"),
      customer: document.querySelector("#customer"),
      category: document.querySelector("#category"),
      limit: document.querySelector("#limit"),
      rows: document.querySelector("#rows"),
      draftRows: document.querySelector("#draftRows"),
      count: document.querySelector("#count"),
      minPrice: document.querySelector("#minPrice"),
      maxPrice: document.querySelector("#maxPrice"),
      avgPrice: document.querySelector("#avgPrice"),
      draftTotal: document.querySelector("#draftTotal"),
      queryLabel: document.querySelector("#queryLabel"),
      updated: document.querySelector("#updated"),
      refreshStatus: document.querySelector("#refreshStatus"),
      draftCustomer: document.querySelector("#draftCustomer"),
      draftAttention: document.querySelector("#draftAttention"),
      draftTitleInput: document.querySelector("#draftTitleInput"),
      bulkQty: document.querySelector("#bulkQty"),
      exportStatus: document.querySelector("#exportStatus"),
    };
    const money = new Intl.NumberFormat("ko-KR");
    const draft = [];

    function setText(id, value) {
      const node = document.querySelector("#" + id);
      if (node) node.textContent = value;
    }

    function setupText() {
      document.title = T.title;
      setText("title", T.title);
      setText("updated", T.updated);
      setText("qLabel", T.qLabel);
      els.q.placeholder = T.qPlaceholder;
      setText("customerLabel", T.customerLabel);
      setText("categoryLabel", T.categoryLabel);
      setText("allCustomer", T.all);
      setText("allCategory", T.all);
      setText("limitLabel", T.limitLabel);
      setText("search", T.search);
      setText("reset", T.reset);
      setText("refreshData", T.refreshData);
      setText("usage", T.usage);
      setText("countLabel", T.countLabel);
      setText("minLabel", T.minLabel);
      setText("maxLabel", T.maxLabel);
      setText("avgLabel", T.avgLabel);
      setText("queryLabel", T.allData);
      setText("priceHint", T.priceHint);
      setText("draftTitle", T.draftTitle);
      setText("draftHint", T.draftHint);
      setText("draftCustomerLabel", T.customerName);
      setText("draftAttentionLabel", T.attentionName);
      setText("draftTitleLabel", T.quoteTitle);
      setText("bulkQtyLabel", T.bulkQty);
      setText("applyBulkQty", T.applyBulkQty);
      setText("draftTotalLabel", T.draftTotalLabel);
      setText("copyDraft", T.copyDraft);
      setText("createQuote", T.createQuote);
      setText("clearDraft", T.clearDraft);
      document.querySelector("#headRow").innerHTML = T.headers.map((text) => "<th>" + text + "</th>").join("");
      document.querySelector("#draftHead").innerHTML = T.draftHeaders.map((text) => "<div>" + text + "</div>").join("");
    }

    function price(value) {
      const number = Number(value || 0);
      return number ? money.format(number) : "";
    }

    function includedToExcluded(included, unit = 1000) {
      const exact = Number(included || 0) / 1.1;
      if (!exact) return 0;
      const lower = Math.floor(exact / unit) * unit;
      const upper = lower === exact ? lower : lower + unit;
      return Math.abs(upper * 1.1 - included) < Math.abs(included - lower * 1.1) ? upper : lower;
    }

    function escapeHtml(value) {
      return String(value || "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }[char]));
    }

    function option(select, value) {
      const node = document.createElement("option");
      node.value = value;
      node.textContent = value;
      select.appendChild(node);
    }

    async function loadMeta() {
      const res = await fetch("/api/meta");
      const data = await res.json();
      els.updated.textContent = "\\ud488\\ubaa9 " + money.format(data.itemCount) + "\\uac74 · \\ud30c\\uc77c " + money.format(data.fileCount) + "\\uac1c";
      data.customers.forEach((value) => option(els.customer, value));
      data.categories.forEach((value) => option(els.category, value));
    }

    async function search() {
      const params = new URLSearchParams({
        q: els.q.value,
        customer: els.customer.value,
        category: els.category.value,
        limit: els.limit.value,
      });
      const res = await fetch("/api/search?" + params.toString());
      render(await res.json());
    }

    function render(data) {
      els.count.textContent = money.format(data.rows.length);
      els.minPrice.textContent = data.summary.minPrice ? price(data.summary.minPrice) : "-";
      els.maxPrice.textContent = data.summary.maxPrice ? price(data.summary.maxPrice) : "-";
      els.avgPrice.textContent = data.summary.avgPrice ? price(data.summary.avgPrice) : "-";
      els.queryLabel.textContent = data.query ? T.query + ": " + data.query : T.allData;
      els.rows.innerHTML = "";

      data.rows.forEach((row, index) => {
        const tr = document.createElement("tr");
        tr.innerHTML = [
          "<td><button data-add='" + index + "'>" + T.add + "</button></td>",
          "<td>" + escapeHtml(row.quote_date) + "</td>",
          "<td>" + escapeHtml(row.customer_hint) + "</td>",
          "<td>" + escapeHtml(row.recipient) + "<br><span class='hint'>" + escapeHtml(row.attention) + "</span></td>",
          "<td>" + escapeHtml(row.item_category) + "</td>",
          "<td class='spec'>" + escapeHtml(row.spec) + "</td>",
          "<td class='qty'>" + escapeHtml(row.quantity) + "</td>",
          "<td class='price'>" + price(row.quoted_unit_price) + "</td>",
          "<td><span class='hint'>" + escapeHtml(row.source_file) + "</span></td>",
        ].join("");
        tr.querySelector("button").addEventListener("click", () => addDraft(row));
        els.rows.appendChild(tr);
      });
    }

    function addDraft(row) {
      const basePrice = Number(row.quoted_unit_price || 0) || 0;
      draft.push({
        category: row.item_category || "",
        spec: row.spec || "",
        qty: Number(row.quantity || 1) || 1,
        unit: row.unit || "EA",
        price: basePrice,
        tax_included_price: Math.round(basePrice * 1.1),
        source: row.source_file || "",
        quoteDate: row.quote_date || "",
      });
      renderDraft();
    }

    function renderDraft() {
      els.draftRows.innerHTML = "";
      let total = 0;
      draft.forEach((item, index) => {
        const amount = item.qty * (item.tax_included_price || Math.round(item.price * 1.1));
        total += amount;
        const node = document.createElement("div");
        node.className = "draft-item";
        node.innerHTML = [
          "<div><strong>" + escapeHtml(item.category) + " · " + escapeHtml(item.spec) + "</strong><span class='hint'>" + escapeHtml(item.quoteDate) + " · " + escapeHtml(item.source) + "</span></div>",
          "<div class='draft-cell'><input data-field='qty' data-index='" + index + "' value='" + item.qty + "'></div>",
          "<div class='draft-cell'><input data-field='tax_included_price' data-index='" + index + "' value='" + (item.tax_included_price || Math.round(item.price * 1.1)) + "'></div>",
          "<div class='draft-cell'><input data-field='price' data-index='" + index + "' value='" + item.price + "'></div>",
          "<div><button class='ghost' data-remove='" + index + "'>" + T.remove + "</button></div>",
        ].join("");
        node.querySelectorAll("input").forEach((input) => {
          input.addEventListener("input", () => {
            const itemIndex = Number(input.dataset.index);
            const field = input.dataset.field;
            draft[itemIndex][field] = Number(input.value || 0);
            if (field === "tax_included_price") {
              draft[itemIndex].price = includedToExcluded(draft[itemIndex].tax_included_price);
            }
            if (field === "price") {
              draft[itemIndex].tax_included_price = Math.round(draft[itemIndex].price * 1.1);
            }
            renderDraft();
          });
        });
        node.querySelector("button").addEventListener("click", () => {
          draft.splice(index, 1);
          renderDraft();
        });
        els.draftRows.appendChild(node);
      });
      els.draftTotal.textContent = price(total) || "0";
    }

    async function copyDraft() {
      if (!draft.length) {
        alert(T.emptyDraft);
        return;
      }
      const lines = [["품목", "규격", "수량", "단위", "단가", "금액", "참고견적일", "원본파일"]];
      draft.forEach((item) => {
        lines.push([item.category, item.spec, item.qty, item.unit, item.price, item.qty * item.price, item.quoteDate, item.source]);
      });
      const text = lines.map((line) => line.join("\\t")).join("\\n");
      await navigator.clipboard.writeText(text);
      alert(T.copied);
    }

    async function createQuoteFile() {
      if (!draft.length) {
        alert(T.emptyDraft);
        return;
      }
      els.exportStatus.textContent = "";
      const payload = {
        customer: els.draftCustomer.value,
        attention: els.draftAttention.value,
        title: els.draftTitleInput.value || T.draftTitle,
        tax_mode: "vat_split",
        items: draft,
      };
      const res = await fetch("/api/export-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        els.exportStatus.textContent = T.quoteCreateFailed + " " + (data.error || "");
        return;
      }
      els.exportStatus.textContent = T.quoteCreated + " " + data.output;
      await loadMeta();
    }

    async function refreshData() {
      els.refreshStatus.textContent = T.refreshing;
      const button = document.querySelector("#refreshData");
      button.disabled = true;
      try {
        const res = await fetch("/api/update-data", { method: "POST" });
        const data = await res.json();
        if (!res.ok) {
          els.refreshStatus.textContent = T.refreshFailed + " " + (data.error || "");
          return;
        }
        els.refreshStatus.textContent = T.refreshed + " · " + (data.message || "");
        await loadMeta();
        await search();
      } finally {
        button.disabled = false;
      }
    }

    function applyBulkQty() {
      const qty = Number(els.bulkQty.value || 0);
      if (!qty) return;
      draft.forEach((item) => {
        item.qty = qty;
      });
      renderDraft();
    }

    setupText();
    document.querySelector("#search").addEventListener("click", search);
    document.querySelector("#reset").addEventListener("click", () => {
      els.q.value = "";
      els.customer.value = "";
      els.category.value = "";
      search();
    });
    document.querySelector("#copyDraft").addEventListener("click", copyDraft);
    document.querySelector("#createQuote").addEventListener("click", createQuoteFile);
    document.querySelector("#refreshData").addEventListener("click", refreshData);
    document.querySelector("#applyBulkQty").addEventListener("click", applyBulkQty);
    document.querySelector("#clearDraft").addEventListener("click", () => {
      draft.splice(0, draft.length);
      renderDraft();
    });
    els.q.addEventListener("keydown", (event) => {
      if (event.key === "Enter") search();
    });
    loadMeta().then(search);
  </script>
</body>
</html>`);
}

function handleMeta(res) {
  const items = readCsv(ITEMS_CSV);
  const files = readCsv(FILES_CSV);
  const customers = [...new Set(items.map((row) => row.customer_hint).filter(Boolean))].sort();
  const categories = [...new Set(items.map((row) => row.item_category).filter(Boolean))].sort();
  json(res, 200, { itemCount: items.length, fileCount: files.length, customers, categories });
}

function handleSearch(reqUrl, res) {
  const items = readCsv(ITEMS_CSV);
  const query = reqUrl.searchParams.get("q") || "";
  const customer = reqUrl.searchParams.get("customer") || "";
  const category = reqUrl.searchParams.get("category") || "";
  const limit = Math.min(Number(reqUrl.searchParams.get("limit") || 30), 500);
  const groups = queryGroups(query);

  let rows = items
    .map((row) => ({ ...row, _score: scoreQuery(row, groups) }))
    .filter((row) => row._score > 0)
    .filter((row) => !customer || row.customer_hint === customer)
    .filter((row) => !category || row.item_category === category);

  rows.sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    return String(b.quote_date).localeCompare(String(a.quote_date));
  });

  rows = rows.slice(0, limit);
  const prices = rows.map((row) => toNumber(row.quoted_unit_price)).filter((value) => value > 0);
  const sum = prices.reduce((total, value) => total + value, 0);
  json(res, 200, {
    query,
    rows,
    summary: {
      minPrice: prices.length ? Math.min(...prices) : 0,
      maxPrice: prices.length ? Math.max(...prices) : 0,
      avgPrice: prices.length ? Math.round(sum / prices.length) : 0,
    },
  });
}

async function handleExportDraft(req, res) {
  let draftPath = "";
  try {
    const rawBody = await readBody(req);
    const payload = JSON.parse(rawBody || "{}");
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      json(res, 400, { error: "Draft has no items." });
      return;
    }

    fs.mkdirSync(EXPORT_ROOT, { recursive: true });
    draftPath = path.join(EXPORT_ROOT, `draft_${Date.now()}.json`);
    fs.writeFileSync(draftPath, JSON.stringify(payload), "utf8");

    const script = path.join(ROOT, "scripts", "create_quote_from_draft.py");
    const stdout = await runPython(script, [draftPath]);

    const result = JSON.parse(stdout.trim().split(/\r?\n/).pop() || "{}");
    const updateScript = path.join(ROOT, "scripts", "update_estimate_database.py");
    await runPython(updateScript, []);
    result.updated = true;
    json(res, 200, result);
  } catch (error) {
    json(res, 500, { error: error.stderr || error.message || String(error) });
  } finally {
    if (draftPath && fs.existsSync(draftPath)) {
      fs.unlinkSync(draftPath);
    }
  }
}

async function handleUpdateData(res) {
  try {
    const updateScript = path.join(ROOT, "scripts", "update_estimate_database.py");
    const stdout = await runPython(updateScript, []);
    const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
    json(res, 200, {
      ok: true,
      message: lines.slice(-4).join(" · "),
      output: stdout,
    });
  } catch (error) {
    json(res, 500, { error: error.stderr || error.message || String(error) });
  }
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  if (reqUrl.pathname === "/") return page(res);
  if (reqUrl.pathname === "/api/meta") return handleMeta(res);
  if (reqUrl.pathname === "/api/search") return handleSearch(reqUrl, res);
  if (reqUrl.pathname === "/api/export-draft" && req.method === "POST") return handleExportDraft(req, res);
  if (reqUrl.pathname === "/api/update-data" && req.method === "POST") return handleUpdateData(res);
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Estimate app: http://localhost:${PORT}`);
});
