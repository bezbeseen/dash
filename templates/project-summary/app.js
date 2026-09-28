const SAMPLE = {
  status: "Concept · For review",
  date: "27 September 2026",
  client: "Kollab Real Estate",
  job: "Closing-day photo props",
  location: "San Jose",
  coverImage: "boards/05.png",
  brief: {
    lead: "Eight unbranded photo props for closing day — gifts the new owners hold in front of the house, not yard riders.",
    constraints: [
      ["Client", "Kollab Real Estate, San Jose"],
      ["Use", "Photo op / housewarming gift"],
      ["Size", "24 × 6"],
      ["Qty", "One of each · 8 unique"],
      ["Type", "Futura PT Book + Heavy"],
      ["Mark", "None — unbranded"]
    ]
  },
  approach: [
    { title: "Unbranded", text: "These leave with the buyers. No Kollab lockup, no hex field — the photo is about the house and the people in it." },
    { title: "SOLD split", text: "Type left, rule, mark right. Same architecture as their sold rider, so the set still feels like the shop even without the wordmark." },
    { title: "Caption, not shout", text: "Mixed case, cheeky lines, icons only where they earn it. Reads like something you’d hold up in a photo, not a for-sale sign." }
  ],
  pieces: [
    { id: "01", name: "We Got the Keys", note: "Landscape key beside the punchline — it doesn’t want a tall column.", image: "boards/01.png", field: "Black", size: "24 × 6" },
    { id: "02", name: "Home Looks Good on Us", note: "Split. Geometric house, same stroke as the key.", image: "boards/02.png", field: "White", size: "24 × 6" },
    { id: "03", name: "Dreams → Keys", note: "Type-forward. Book to Heavy, arrow in between.", image: "boards/03.png", field: "Black", size: "24 × 6" },
    { id: "04", name: "Meet Your New Neighbors", note: "Split. Two-person mark on the right.", image: "boards/04.png", field: "White", size: "24 × 6" },
    { id: "05", name: "We Said YES to the Address", note: "The SOLD echo. We said / to the address | YES.", image: "boards/05.png", field: "Black", size: "24 × 6" },
    { id: "06", name: "Party at Our Place", note: "Split. Two flutes.", image: "boards/06.png", field: "White", size: "24 × 6" },
    { id: "07", name: "No More House Hunting", note: "Strike is the joke. Easy to drop if they want it cleaner.", image: "boards/07.png", field: "Black", size: "24 × 6" },
    { id: "08", name: "New Address, Who Dis?", note: "Split. Map pin on the right.", image: "boards/08.png", field: "White", size: "24 × 6" }
  ],
  specs: [
    ["Format", "24 × 6 photo prop"],
    ["Series", "8 unique boards, qty one each"],
    ["Color", "Black / white only"],
    ["Type", "Futura PT Book + Heavy"],
    ["Art", "Unbranded. Live type in finals."],
    ["Substrate", "To confirm — PVC or foamboard"],
    ["Bleed", "Add 0.125\" at production (24.25 × 6.25)"],
    ["Status", "Concept. Not production files."]
  ],
  next: [
    { title: "Pick", text: "Keep, kill, or rewrite any of the eight. Strike on 07 is optional." },
    { title: "Confirm build", text: "Substrate, ink, and whether these are handheld boards or mounted." },
    { title: "Produce", text: "Live-type Illustrator files, one artboard each, then print." }
  ],
  contact: {
    shop: "Be Seen",
    line: "Print · Sign · Design",
    email: "contact@beseensignshop.com"
  }
};

function blankProject() {
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const now = new Date();
  return {
    status: "Concept · For review",
    date: now.getDate() + " " + months[now.getMonth()] + " " + now.getFullYear(),
    client: "",
    job: "",
    location: "",
    coverImage: "",
    brief: {
      lead: "",
      constraints: [
        ["Client", ""],
        ["Use", ""],
        ["Size", ""],
        ["Qty", ""]
      ]
    },
    approach: [
      { title: "", text: "" },
      { title: "", text: "" },
      { title: "", text: "" }
    ],
    pieces: [
      { id: "01", name: "", note: "", image: "", field: "White", size: "24 × 6" }
    ],
    specs: [
      ["Format", ""],
      ["Qty", ""],
      ["Color", ""],
      ["Type", ""],
      ["Substrate", ""],
      ["Status", "Concept"]
    ],
    next: [
      { title: "Pick", text: "" },
      { title: "Confirm build", text: "" },
      { title: "Produce", text: "" }
    ],
    contact: {
      shop: "Be Seen",
      line: "Print · Sign · Design",
      email: "contact@beseensignshop.com"
    }
  };
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function jobIdFromQuery() {
  try {
    return new URLSearchParams(location.search).get("job") || "";
  } catch {
    return "";
  }
}

const TICKET_JOB_ID = jobIdFromQuery();
let TICKET_DEFAULTS = null;

const DB_NAME = "beseen-project-summary";
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("p");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function loadSaved() {
  try {
    const saved = await Promise.race([
      (async () => {
        const db = await openDb();
        return await new Promise((resolve, reject) => {
          const tx = db.transaction("p", "readonly");
          const get = tx.objectStore("p").get("current");
          get.onsuccess = () => resolve(get.result || null);
          get.onerror = () => reject(get.error);
        });
      })(),
      new Promise((resolve) => setTimeout(() => resolve(null), 600))
    ]);
    return saved;
  } catch (err) {
    return null;
  }
}
async function saveProjectToTicket() {
  const res = await fetch(`/api/jobs/${encodeURIComponent(TICKET_JOB_ID)}/project-book`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "include",
    body: JSON.stringify(PROJECT)
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((body && body.error) || "Could not save to the job folder");
  }
}

async function saveProject() {
  try {
    if (TICKET_JOB_ID) {
      await saveProjectToTicket();
      setSaveState("Saved in the job folder");
      return;
    }
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("p", "readwrite");
      tx.objectStore("p").put(PROJECT, "current");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    setSaveState("Saved in this browser");
  } catch (err) {
    setSaveState(TICKET_JOB_ID ? (err && err.message) || "Couldn’t save to the job folder" : "Couldn’t autosave images — print before you close");
  }
}

let saveTimer = null;
function scheduleSave() {
  setSaveState("Saving…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveProject, TICKET_JOB_ID ? 2000 : 400);
}
function setSaveState(text) {
  const el = document.getElementById("save-state");
  if (el) el.textContent = text;
}

let PROJECT = clone(SAMPLE);
let slides = [];
let i = 0;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));

function setPath(path, value) {
  const parts = path.split(".");
  let cur = PROJECT;
  for (let n = 0; n < parts.length - 1; n++) {
    const key = /^\d+$/.test(parts[n]) ? Number(parts[n]) : parts[n];
    cur = cur[key];
  }
  const last = parts[parts.length - 1];
  cur[/^\d+$/.test(last) ? Number(last) : last] = value;
}

function hasApproach() {
  return PROJECT.approach.some((a) => (a.title || a.text || "").trim());
}

function layout() {
  const approach = hasApproach();
  const n = PROJECT.pieces.length;
  const set = approach ? 3 : 2;
  return {
    cover: 0,
    ask: 1,
    approach: approach ? 2 : -1,
    set,
    piece0: set + 1,
    specs: set + 1 + n,
    next: set + 2 + n
  };
}

function imgTag(src, alt) {
  if (!src) return `<div class="ph">No art yet</div>`;
  return `<img src="${esc(src)}" alt="${esc(alt || "")}">`;
}

function foot() {
  return `<div class="foot">
    <span>Be Seen<span class="dot">·</span>${esc(PROJECT.client || "Client")}</span>
    <span class="pg"></span>
  </div>`;
}

function renderDeck() {
  const p = PROJECT;
  const pieceCount = p.pieces.length;
  const gridCols = pieceCount <= 4 ? 2 : pieceCount <= 6 ? 3 : 4;
  const html = [];

  html.push(`
    <section class="slide">
      <div class="bar"></div>
      <div class="body">
        <div class="cover-brand">
          <img class="logo-wide" src="assets/logo-wide.png" alt="Be Seen" />
          <div class="eyebrow" style="margin:0;text-align:right">${esc(p.status)}<br>${esc(p.date)}</div>
        </div>
        <h1 style="margin-top:56px">${esc(p.job || "Project title")}</h1>
        <p class="lead">${esc(p.client || "Client")}</p>
        <dl class="meta">
          <div><dt>Where</dt><dd>${esc(p.location || "—")}</dd></div>
          <div><dt>Pieces</dt><dd>${pieceCount}</dd></div>
          <div><dt>Size</dt><dd>${esc((p.pieces[0] && p.pieces[0].size) || "—")}</dd></div>
        </dl>
      </div>
      ${p.coverImage ? `<div class="cover-hero"><img src="${esc(p.coverImage)}" alt=""></div>` : ""}
    </section>
  `);

  html.push(`
    <section class="slide">
      <div class="bar"></div>
      <div class="body">
        <p class="eyebrow">The ask</p>
        <div class="split">
          <div class="ask">
            <h2>What this is</h2>
            <p>${esc(p.brief.lead || "What’s the job?")}</p>
          </div>
          <dl class="kv">${p.brief.constraints.map(([k, v]) =>
            `<div><dt>${esc(k || " ")}</dt><dd>${esc(v)}</dd></div>`
          ).join("")}</dl>
        </div>
      </div>
      ${foot()}
    </section>
  `);

  if (hasApproach()) {
    html.push(`
      <section class="slide">
        <div class="bar"></div>
        <div class="body">
          <p class="eyebrow">Approach</p>
          <h2>How we’re thinking</h2>
          <div class="principles">${p.approach.map((a, n) => `
            <article>
              <span class="n">${String(n + 1).padStart(2, "0")}</span>
              <h3>${esc(a.title || " ")}</h3>
              <p>${esc(a.text)}</p>
            </article>
          `).join("")}</div>
        </div>
        ${foot()}
      </section>
    `);
  }

  html.push(`
    <section class="slide">
      <div class="bar"></div>
      <div class="body">
        <p class="eyebrow">The set</p>
        <h2>All ${pieceCount}</h2>
        <div class="grid cols-${gridCols}">${p.pieces.map((piece) => `
          <div class="thumb">
            <div class="well">${imgTag(piece.image, piece.name)}</div>
            <label><span>${esc(piece.id)}</span>${esc(piece.name || "Untitled")}</label>
          </div>
        `).join("")}</div>
      </div>
      ${foot()}
    </section>
  `);

  p.pieces.forEach((piece) => {
    const dark = /black/i.test(piece.field || "");
    html.push(`
      <section class="slide${dark ? " dark" : ""}">
        <div class="bar"></div>
        <div class="body">
          <div class="piece-head">
            <div class="piece-n">${esc(piece.id)}</div>
            <div>
              <h3>${esc(piece.name || "Untitled")}</h3>
              <p>${esc(piece.note)}</p>
            </div>
            <div class="piece-size">${esc(piece.size)} · ${esc(piece.field)}</div>
          </div>
          <div class="piece-well">${imgTag(piece.image, piece.name)}</div>
        </div>
        ${foot()}
      </section>
    `);
  });

  html.push(`
    <section class="slide">
      <div class="bar"></div>
      <div class="body">
        <p class="eyebrow">Production</p>
        <h2>Specs</h2>
        <dl class="kv two">${p.specs.map(([k, v]) =>
          `<div><dt>${esc(k || " ")}</dt><dd>${esc(v)}</dd></div>`
        ).join("")}</dl>
      </div>
      ${foot()}
    </section>
  `);

  html.push(`
    <section class="slide">
      <div class="bar"></div>
      <div class="body">
        <p class="eyebrow">Next</p>
        <h2>From here</h2>
        <div class="nexts">${p.next.map((step, n) => `
          <article>
            <span class="n">${String(n + 1).padStart(2, "0")}</span>
            <h3>${esc(step.title || " ")}</h3>
            <p>${esc(step.text)}</p>
          </article>
        `).join("")}</div>
        <div class="close-mark">
          <img src="assets/logo-wide.png" alt="Be Seen" />
          <div class="close-contact">${esc(p.contact.shop)}<br>${esc(p.contact.line)}<br>${esc(p.contact.email)}</div>
        </div>
      </div>
      ${foot()}
    </section>
  `);

  const frame = document.getElementById("frame");
  frame.innerHTML = html.join("");
  slides = [...frame.querySelectorAll(".slide")];
  slides.forEach((el, n) => {
    const f = el.querySelector(".foot .pg");
    if (f) f.textContent = String(n + 1).padStart(2, "0") + " / " + String(slides.length).padStart(2, "0");
  });
  if (!slides.length) return;
  if (i >= slides.length) i = slides.length - 1;
  show(i, true);
  scale();
}

function show(n, quiet) {
  if (!slides.length) return;
  i = (n + slides.length) % slides.length;
  slides.forEach((s, k) => s.classList.toggle("on", k === i));
  document.getElementById("counter").textContent =
    String(i + 1).padStart(2, "0") + " / " + String(slides.length).padStart(2, "0");
  if (!quiet) location.hash = String(i + 1);
}

function scale() {
  const frame = document.getElementById("frame");
  const stage = document.querySelector(".stage");
  const present = document.body.classList.contains("present");
  const w = present ? window.innerWidth : stage.clientWidth;
  const h = present ? window.innerHeight : stage.clientHeight;
  const pad = present ? 0.94 : 0.9;
  frame.style.transform = "scale(" + Math.min(w / 1920, h / 1080) * pad + ")";
}

function field(label, path, extra) {
  return `<label class="field"><span>${label}</span><input type="text" data-f="${path}" value="${esc(extra)}"></label>`;
}

function area(label, path, extra) {
  return `<label class="field"><span>${label}</span><textarea data-f="${path}">${esc(extra)}</textarea></label>`;
}

function drop(path, src) {
  return `<label class="drop${src ? " has-art" : ""}">
    <input type="file" accept="image/*" hidden data-file="${path}">
    ${src ? `<img src="${esc(src)}" alt="">` : ""}
    <span>Drop art or click</span>
  </label>`;
}

function renderForm() {
  try {
    renderFormInner();
  } catch (err) {
    document.getElementById("editor").innerHTML =
      "<div class='editor-top'><p>Form error: " + esc(err.message) + "</p></div>";
    console.error(err);
  }
}

function renderFormInner() {
  const p = PROJECT;
  const L = layout();
  const editor = document.getElementById("editor");
  editor.innerHTML = `
    <div class="editor-top">
      <div class="brand">
        <img src="assets/logo-face.png" alt="">
        <span>Project summary</span>
      </div>
      <div class="editor-actions">
        <button type="button" class="primary" data-act="present">Present</button>
        <button type="button" data-act="print">Print PDF</button>
        <button type="button" data-act="blank">New</button>
        ${TICKET_JOB_ID ? "" : `<button type="button" data-act="sample">Load sample</button>`}
        ${TICKET_JOB_ID ? `<button type="button" data-act="save-folder">Save to folder</button>` : ""}
        <label class="btn">Add images
          <input type="file" accept="image/*" multiple hidden id="bulk">
        </label>
      </div>
      <div class="save-state" id="save-state">${TICKET_JOB_ID ? "Saving to this ticket’s job folder" : "Fills the deck as you type"}</div>
    </div>
    <div class="form">
      <h3 data-jump="${L.cover}">Cover</h3>
      <div data-jump="${L.cover}">
        ${field("Job name", "job", p.job)}
        ${field("Client", "client", p.client)}
        <div class="row2">
          ${field("Location", "location", p.location)}
          ${field("Date", "date", p.date)}
        </div>
        ${field("Status", "status", p.status)}
        <label class="field"><span>Cover image</span></label>
        ${drop("coverImage", p.coverImage)}
      </div>

      <h3 data-jump="${L.ask}">The ask</h3>
      <div data-jump="${L.ask}">
        ${area("What this is", "brief.lead", p.brief.lead)}
        ${p.brief.constraints.map((row, n) => `
          <div class="pair">
            <input type="text" data-f="brief.constraints.${n}.0" value="${esc(row[0])}" placeholder="Label">
            <input type="text" data-f="brief.constraints.${n}.1" value="${esc(row[1])}" placeholder="Value">
            <button type="button" class="linkish" data-act="del-constraint" data-i="${n}">×</button>
          </div>
        `).join("")}
        <button type="button" class="linkish" data-act="add-constraint">+ Fact</button>
      </div>

      <h3 data-jump="${L.approach >= 0 ? L.approach : L.ask}">Approach</h3>
      ${p.approach.map((a, n) => `
        <div class="card" data-jump="${L.approach >= 0 ? L.approach : L.ask}">
          <div class="card-top">
            <span class="ghost">${String(n + 1).padStart(2, "0")}</span>
            <button type="button" class="linkish" data-act="del-approach" data-i="${n}">Remove</button>
          </div>
          ${field("Title", "approach." + n + ".title", a.title)}
          ${area("Note", "approach." + n + ".text", a.text)}
        </div>
      `).join("")}
      <button type="button" class="linkish" data-act="add-approach">+ Point</button>

      <h3 data-jump="${L.set}">Pieces</h3>
      <p class="ghost" style="margin:0 0 10px">Drop several images at once — they fill 01, 02, 03…</p>
      ${p.pieces.map((piece, n) => `
        <div class="card" data-jump="${L.piece0 + n}">
          <div class="card-top">
            <span class="ghost">${esc(piece.id)}</span>
            <button type="button" class="linkish" data-act="del-piece" data-i="${n}">Remove</button>
          </div>
          ${field("Name", "pieces." + n + ".name", piece.name)}
          ${area("Caption", "pieces." + n + ".note", piece.note)}
          <div class="row2">
            ${field("Size", "pieces." + n + ".size", piece.size)}
            <label class="field"><span>Field</span>
              <select data-f="pieces.${n}.field">
                <option${piece.field === "White" ? " selected" : ""}>White</option>
                <option${piece.field === "Black" ? " selected" : ""}>Black</option>
              </select>
            </label>
          </div>
          ${drop("pieces." + n + ".image", piece.image)}
          <button type="button" class="linkish" data-act="cover-from" data-i="${n}" style="margin-top:8px">Use as cover</button>
        </div>
      `).join("")}
      <button type="button" class="linkish" data-act="add-piece">+ Piece</button>

      <h3 data-jump="${L.specs}">Specs</h3>
      <div data-jump="${L.specs}">
        ${p.specs.map((row, n) => `
          <div class="pair">
            <input type="text" data-f="specs.${n}.0" value="${esc(row[0])}" placeholder="Label">
            <input type="text" data-f="specs.${n}.1" value="${esc(row[1])}" placeholder="Value">
            <button type="button" class="linkish" data-act="del-spec" data-i="${n}">×</button>
          </div>
        `).join("")}
        <button type="button" class="linkish" data-act="add-spec">+ Spec</button>
      </div>

      <h3 data-jump="${L.next}">Next</h3>
      ${p.next.map((step, n) => `
        <div class="card" data-jump="${L.next}">
          ${field("Title", "next." + n + ".title", step.title)}
          ${area("Note", "next." + n + ".text", step.text)}
          <button type="button" class="linkish" data-act="del-next" data-i="${n}">Remove</button>
        </div>
      `).join("")}
      <button type="button" class="linkish" data-act="add-next">+ Step</button>

      <h3>Shop</h3>
      ${field("Name", "contact.shop", p.contact.shop)}
      ${field("Line", "contact.line", p.contact.line)}
      ${field("Email", "contact.email", p.contact.email)}
    </div>
  `;
}

function nextId() {
  const n = PROJECT.pieces.length + 1;
  return String(n).padStart(2, "0");
}

function renumberPieces() {
  PROJECT.pieces.forEach((piece, n) => {
    piece.id = String(n + 1).padStart(2, "0");
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function assignImage(path, file) {
  const url = await fileToDataUrl(file);
  setPath(path, url);
}

function bindEditor() {
  const editor = document.getElementById("editor");
  editor.addEventListener("input", (e) => {
    const t = e.target;
    if (!t.dataset.f) return;
    setPath(t.dataset.f, t.value);
    renderDeck();
    scheduleSave();
  });
  editor.addEventListener("change", async (e) => {
    const t = e.target;
    if (t.dataset.f) {
      setPath(t.dataset.f, t.value);
      renderDeck();
      scheduleSave();
      return;
    }
    if (t.id === "bulk" && t.files && t.files.length) {
      const files = [...t.files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      for (let n = 0; n < files.length; n++) {
        if (!PROJECT.pieces[n]) {
          PROJECT.pieces.push({ id: "", name: files[n].name.replace(/\.[^.]+$/, ""), note: "", image: "", field: "White", size: PROJECT.pieces[0] ? PROJECT.pieces[0].size : "24 × 6" });
        }
        PROJECT.pieces[n].image = await fileToDataUrl(files[n]);
        if (!PROJECT.pieces[n].name) PROJECT.pieces[n].name = files[n].name.replace(/\.[^.]+$/, "");
      }
      if (!PROJECT.coverImage && PROJECT.pieces[0]) PROJECT.coverImage = PROJECT.pieces[0].image;
      renumberPieces();
      t.value = "";
      renderForm();
      renderDeck();
      scheduleSave();
      return;
    }
    if (t.dataset.file && t.files && t.files[0]) {
      await assignImage(t.dataset.file, t.files[0]);
      renderForm();
      renderDeck();
      scheduleSave();
    }
  });
  editor.addEventListener("dragover", (e) => {
    if (e.target.closest(".drop")) e.preventDefault();
  });
  editor.addEventListener("drop", async (e) => {
    const drop = e.target.closest(".drop");
    if (!drop) return;
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    const input = drop.querySelector("[data-file]");
    if (!file || !input) return;
    await assignImage(input.dataset.file, file);
    renderForm();
    renderDeck();
    scheduleSave();
  });
  editor.addEventListener("click", (e) => {
    const jump = e.target.closest("[data-jump]");
    if (jump && jump.dataset.jump !== "" && !e.target.closest("button, input, textarea, select, label.drop")) {
      show(Number(jump.dataset.jump));
    }
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    const idx = Number(btn.dataset.i);
    if (act === "present") return setMode("present");
    if (act === "print") return window.print();
    if (act === "save-folder") {
      setSaveState("Saving…");
      void saveProject();
      return;
    }
    if (act === "blank") {
      if (!confirm("Start a blank project? The current one stays saved until you type.")) return;
      PROJECT = TICKET_DEFAULTS ? clone(TICKET_DEFAULTS) : blankProject();
    } else if (act === "sample") {
      PROJECT = clone(SAMPLE);
    } else if (act === "add-constraint") {
      PROJECT.brief.constraints.push(["", ""]);
    } else if (act === "del-constraint") {
      PROJECT.brief.constraints.splice(idx, 1);
    } else if (act === "add-approach") {
      PROJECT.approach.push({ title: "", text: "" });
    } else if (act === "del-approach") {
      PROJECT.approach.splice(idx, 1);
    } else if (act === "add-piece") {
      PROJECT.pieces.push({ id: nextId(), name: "", note: "", image: "", field: "White", size: PROJECT.pieces[0] ? PROJECT.pieces[0].size : "24 × 6" });
    } else if (act === "del-piece") {
      PROJECT.pieces.splice(idx, 1);
      if (!PROJECT.pieces.length) PROJECT.pieces.push({ id: "01", name: "", note: "", image: "", field: "White", size: "24 × 6" });
      renumberPieces();
    } else if (act === "cover-from") {
      PROJECT.coverImage = PROJECT.pieces[idx].image;
    } else if (act === "add-spec") {
      PROJECT.specs.push(["", ""]);
    } else if (act === "del-spec") {
      PROJECT.specs.splice(idx, 1);
    } else if (act === "add-next") {
      PROJECT.next.push({ title: "", text: "" });
    } else if (act === "del-next") {
      PROJECT.next.splice(idx, 1);
    } else {
      return;
    }
    renderForm();
    renderDeck();
    scheduleSave();
  });
  editor.addEventListener("focusin", (e) => {
    const box = e.target.closest("[data-jump]");
    if (box && box.dataset.jump !== "") show(Number(box.dataset.jump), true);
  });
}

function setMode(mode) {
  document.body.classList.toggle("edit", mode === "edit");
  document.body.classList.toggle("present", mode === "present");
  const editBtn = document.getElementById("edit");
  if (editBtn) editBtn.style.display = mode === "present" ? "" : "none";
  scale();
  if (mode === "present") {
    const root = document.documentElement;
    if (root.requestFullscreen && !document.fullscreenElement) {
      root.requestFullscreen().catch(() => {});
    }
  } else if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}

function typingInField() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

async function boot() {
  bindEditor();
  renderForm();
  renderDeck();
  setMode("edit");

  document.getElementById("prev").onclick = () => show(i - 1);
  document.getElementById("next").onclick = () => show(i + 1);
  document.getElementById("print").onclick = () => window.print();
  document.getElementById("edit").onclick = () => setMode("edit");
  window.addEventListener("resize", scale);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { setMode("edit"); return; }
    if (typingInField()) return;
    const present = document.body.classList.contains("present");
    if (e.key === "ArrowRight" || e.key === "PageDown" || (present && e.key === " ")) { e.preventDefault(); show(i + 1); }
    if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); show(i - 1); }
    if (e.key === "Home") { e.preventDefault(); show(0); }
    if (e.key === "End") { e.preventDefault(); show(slides.length - 1); }
    if ((e.key === "p" || e.key === "P") && present) {
      e.preventDefault();
      window.print();
    }
  });
  window.addEventListener("hashchange", () => {
    const n = parseInt(location.hash.replace("#", ""), 10);
    if (n >= 1 && n <= slides.length) show(n - 1, true);
  });
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && document.body.classList.contains("present")) {
      document.body.classList.add("edit");
      document.body.classList.remove("present");
      const editBtn = document.getElementById("edit");
      if (editBtn) editBtn.style.display = "none";
      scale();
    }
  });

  if (TICKET_JOB_ID) {
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(TICKET_JOB_ID)}/project-book`, {
        headers: { Accept: "application/json" },
        credentials: "include"
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body && body.project) {
        PROJECT = body.project;
        TICKET_DEFAULTS = clone(body.project);
        renderForm();
        renderDeck();
        setSaveState(body.exists ? "Loaded from the job folder" : "Started from this ticket — save to write the folder file");
      } else {
        setSaveState((body && body.error) || "Could not load this ticket’s project book");
      }
    } catch (err) {
      setSaveState("Could not load this ticket’s project book");
    }
  } else {
    const saved = await loadSaved();
    if (saved && saved.job !== undefined) {
      PROJECT = saved;
      renderForm();
      renderDeck();
    }
  }
  const fromHash = parseInt(location.hash.replace("#", ""), 10);
  if (fromHash >= 1 && fromHash <= slides.length) show(fromHash - 1, true);
}

boot();
