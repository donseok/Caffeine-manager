// ============================================================================
// 슈퍼관리자(admin.html) 로직
// ============================================================================
(async function () {
  const CM = window.CM, ui = CM.ui, store = CM.store;
  const $ = (id) => document.getElementById(id);
  const state = { products: [], users: [], stats: null, tab: "dashboard", q: "", cat: "all", status: "all", unverified: false };

  const me = await CM.auth.requireUser({ admin: true });
  ui.renderTopbarUser($("topbarUser"));
  $("modeMeta").textContent = CM.mode === "supabase" ? "클라우드 모드 · Supabase" : "로컬 모드 · 이 브라우저의 데이터만 관리합니다";
  if (CM.mode === "local") $("reseedBtn").classList.remove("hidden");

  await reloadAll();
  bind();

  // ---------- 데이터 ----------
  async function reloadAll() {
    try {
      const [products, users, stats] = await Promise.all([store.listProducts({ all: true }), store.listUsers(), store.adminStats()]);
      state.products = products; state.users = users; state.stats = stats;
    } catch (e) { console.error(e); ui.toast("불러오기 실패: " + e.message, "error"); }
    renderCounts(); renderTab();
  }
  function renderCounts() {
    $("countProducts").textContent = state.products.filter((p) => p.status === "approved").length;
    const pending = state.products.filter((p) => p.status === "pending").length;
    $("countPending").textContent = pending; $("countPending").classList.toggle("is-hot", pending > 0);
    $("countUsers").textContent = state.users.length;
  }
  function renderTab() {
    ["dashboard", "products", "pending", "users"].forEach((t) => $("tab-" + t).classList.toggle("hidden", t !== state.tab));
    document.querySelectorAll("#tabs .tab").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === state.tab));
    ({ dashboard: renderDashboard, products: renderProducts, pending: renderPending, users: renderUsers })[state.tab]();
  }

  // ---------- 대시보드 ----------
  async function renderDashboard() {
    const s = state.stats || {};
    $("stats").innerHTML = [
      ["가입 사용자", s.users, "명"], ["승인된 상품", s.products, `종 · 대기 ${s.pending || 0}`], ["전체 섭취 기록", s.intakes, "건"], ["최근 7일 기록", s.intakes7d, "건"],
    ].map(([l, v, sub]) => `<div class="stat"><div class="stat__label">${l}</div><div class="stat__value">${ui.fmtInt(v || 0)}</div><div class="stat__sub">${sub}</div></div>`).join("");
    let rows = [];
    try { rows = await store.listIntakes({ userId: "all", limit: 20 }); } catch (e) { console.warn(e); }
    const byId = {}; state.users.forEach((u) => { byId[u.id] = u; });
    $("recentIntakes").innerHTML = rows.length ? rows.map((x) => { const u = byId[x.user_id]; const q = Number(x.quantity) || 1; return `<tr>
      <td>${ui.fmtDateTimeKo(x.consumed_at)}</td><td>${ui.esc(u ? u.display_name || u.email : (x.user_id || "").slice(0, 8))}</td><td>${ui.esc(x.product_name)}</td>
      <td><span class="pill cat-${ui.esc(x.category || "other")}">${ui.catInfo(x.category).label}</span></td><td class="num">${ui.fmtNum(q, 2)}</td><td class="num">${ui.fmtMg((Number(x.caffeine_mg) || 0) * q)}</td><td class="num">${x.price_paid != null ? ui.fmtWon(x.price_paid * q) : "—"}</td></tr>`; }).join("")
      : `<tr><td colspan="7" style="text-align:center;color:#6B7380;padding:24px">아직 기록이 없습니다.</td></tr>`;
  }

  // ---------- 상품 ----------
  function productMatches(p) {
    const q = state.q.trim().toLowerCase().replace(/\s+/g, "");
    if (q && !(p.name + p.brand).toLowerCase().replace(/\s+/g, "").includes(q)) return false;
    if (state.cat !== "all" && p.category !== state.cat) return false;
    if (state.status !== "all" && p.status !== state.status) return false;
    if (state.unverified && p.verified_at) return false;
    return true;
  }
  function statusPill(s) { return `<span class="pill pill--${s}">${{ approved: "승인", pending: "대기", rejected: "반려" }[s] || s}</span>`; }
  function renderProducts() {
    const list = state.products.filter(productMatches).sort((a, b) => a.brand.localeCompare(b.brand, "ko") || a.name.localeCompare(b.name, "ko"));
    $("productRows").innerHTML = list.map((p) => `<tr data-id="${ui.esc(p.id)}">
      <td>${ui.esc(p.brand)}</td><td><b style="font-weight:500">${ui.esc(p.name)}</b></td><td><span class="pill cat-${ui.esc(p.category)}">${ui.catInfo(p.category).label}</span></td><td>${ui.esc(p.serving_label)}</td>
      <td class="num"><b>${ui.fmtNum(p.caffeine_mg, 1)}</b></td><td class="num">${p.sugar_g == null ? "—" : ui.fmtNum(p.sugar_g, 1)}</td><td class="num">${p.kcal == null ? "—" : ui.fmtInt(p.kcal)}</td><td class="num">${p.base_price == null ? "—" : ui.fmtInt(p.base_price)}</td>
      <td>${ui.esc(p.source || "—")}<br><small style="color:${p.verified_at ? "#175243" : "#9A5B00"}">${p.verified_at ? ui.esc(p.verified_at) + " 확인" : "확인 필요"}</small></td>
      <td>${statusPill(p.status)}</td>
      <td><div class="actions"><button type="button" class="btn-ghost btn-sm" data-act="verify" title="영양정보 확인일을 오늘로">확인✓</button><button type="button" class="btn-ghost btn-sm" data-act="edit">수정</button><button type="button" class="btn-danger btn-sm" data-act="delete">삭제</button></div></td>
    </tr>`).join("") || `<tr><td colspan="11" style="text-align:center;color:#6B7380;padding:24px">조건에 맞는 상품이 없습니다.</td></tr>`;
    $("productCount").textContent = `${list.length}종 표시 · 전체 ${state.products.length}종`;
  }
  function openForm(p) {
    const f = $("productForm"); f.classList.remove("hidden"); $("f_error").classList.add("hidden");
    const set = (k, v) => { $("f_" + k).value = v == null ? "" : v; };
    set("id", p ? p.id : ""); set("brand", p?.brand); set("category", p?.category || "coffee"); set("name", p?.name); set("serving_label", p?.serving_label); set("serving_ml", p?.serving_ml);
    set("caffeine_mg", p?.caffeine_mg); set("sugar_g", p?.sugar_g); set("kcal", p?.kcal); set("base_price", p?.base_price); set("price_note", p?.price_note); set("price_checked_at", p?.price_checked_at);
    set("source", p?.source || "공식 영양정보"); set("verified_at", p?.verified_at); set("image_url", p?.image_url); set("status", p?.status || "approved"); set("tags", (p?.tags || []).join(", "));
    f.scrollIntoView({ behavior: "smooth", block: "start" }); $("f_brand").focus();
  }
  async function saveForm(e) {
    e.preventDefault();
    const g = (k) => $("f_" + k).value;
    const data = { brand: g("brand"), category: g("category"), name: g("name"), serving_label: g("serving_label"), serving_ml: g("serving_ml"), caffeine_mg: g("caffeine_mg"), sugar_g: g("sugar_g"), kcal: g("kcal"),
      base_price: g("base_price"), price_note: g("price_note"), price_checked_at: g("price_checked_at") || null, source: g("source"), verified_at: g("verified_at") || null, image_url: g("image_url") || null, tags: g("tags") };
    const err = $("f_error"); err.classList.add("hidden");
    if (!data.brand.trim() || !data.name.trim()) { err.textContent = "브랜드와 상품명은 필수입니다."; err.classList.remove("hidden"); return; }
    if (data.caffeine_mg === "" || !(Number(data.caffeine_mg) >= 0)) { err.textContent = "카페인(mg)을 입력해 주세요."; err.classList.remove("hidden"); return; }
    $("saveProductBtn").disabled = true;
    try {
      const norm = store.normalizeProduct(data); norm.status = g("status");
      if (g("id")) { await store.updateProduct(g("id"), norm); }
      else { const created = await store.createProduct(norm); if (norm.status !== created.status) await store.updateProduct(created.id, { status: norm.status }); }
      $("productForm").classList.add("hidden"); ui.toast("저장했습니다.", "ok"); await reloadAll();
    } catch (ex) { err.textContent = "저장 실패: " + ex.message; err.classList.remove("hidden"); }
    $("saveProductBtn").disabled = false;
  }
  async function productAction(id, act) {
    const p = state.products.find((x) => x.id === id); if (!p) return;
    try {
      if (act === "edit") return openForm(p);
      if (act === "verify") { await store.updateProduct(id, { verified_at: new Date().toISOString().slice(0, 10) }); ui.toast(`${p.name} · 확인일 갱신`, "ok"); }
      if (act === "delete") { if (!confirm(`‘${p.name}’ 을(를) 삭제할까요? 기존 기록은 스냅샷으로 남습니다.`)) return; await store.deleteProduct(id); ui.toast("삭제했습니다."); }
      if (act === "approve") { await store.updateProduct(id, { status: "approved" }); ui.toast(`${p.name} · 승인`, "ok"); }
      if (act === "reject") { await store.updateProduct(id, { status: "rejected" }); ui.toast(`${p.name} · 반려`); }
      await reloadAll();
    } catch (ex) { ui.toast("실패: " + ex.message, "error"); }
  }

  // ---------- 승인 대기 ----------
  function renderPending() {
    const list = state.products.filter((p) => p.status === "pending").sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const byId = {}; state.users.forEach((u) => { byId[u.id] = u; });
    $("pendingRows").innerHTML = list.map((p) => `<tr data-id="${ui.esc(p.id)}">
      <td>${p.created_at ? ui.fmtDateTimeKo(p.created_at) : "—"}<br><small style="color:#6B7380">${ui.esc(byId[p.created_by]?.email || "")}</small></td>
      <td>${ui.esc(p.brand)}</td><td><b style="font-weight:500">${ui.esc(p.name)}</b></td><td><span class="pill cat-${ui.esc(p.category)}">${ui.catInfo(p.category).label}</span></td><td>${ui.esc(p.serving_label)}</td>
      <td class="num"><b>${ui.fmtNum(p.caffeine_mg, 1)}</b></td><td class="num">${p.sugar_g == null ? "—" : ui.fmtNum(p.sugar_g, 1)}</td><td class="num">${p.kcal == null ? "—" : ui.fmtInt(p.kcal)}</td><td>${ui.esc(p.source || "—")}</td>
      <td><div class="actions"><button type="button" class="btn-green btn-sm" data-act="approve">승인</button><button type="button" class="btn-ghost btn-sm" data-act="edit">수정</button><button type="button" class="btn-danger btn-sm" data-act="reject">반려</button></div></td>
    </tr>`).join("") || `<tr><td colspan="10" style="text-align:center;color:#6B7380;padding:24px">승인 대기 중인 상품이 없습니다.</td></tr>`;
  }

  // ---------- 사용자 ----------
  function renderUsers() {
    const admins = state.users.filter((u) => u.role === "admin").length;
    $("usersMeta").textContent = `전체 ${state.users.length}명 · 관리자 ${admins}명`;
    $("userRows").innerHTML = state.users.map((u) => { const self = u.id === me.id; return `<tr data-id="${ui.esc(u.id)}">
      <td>${ui.esc(u.email)}${self ? ' <small style="color:#6B7380">(나)</small>' : ""}</td><td>${ui.esc(u.display_name || "—")}</td>
      <td><span class="pill pill--${u.role === "admin" ? "admin" : "user"}">${u.role === "admin" ? "관리자" : "사용자"}</span></td>
      <td class="num">${ui.fmtInt(u.daily_limit_mg || 400)}</td><td class="num">${ui.fmtInt(u.intake_count || 0)}</td><td>${u.last_intake_at ? ui.fmtDateTimeKo(u.last_intake_at) : "—"}</td><td>${u.created_at ? ui.fmtDateShort(u.created_at) : "—"}</td>
      <td><span class="pill pill--${u.is_active === false ? "off" : "approved"}">${u.is_active === false ? "비활성" : "활성"}</span></td>
      <td><div class="actions">${self ? "" : `<button type="button" class="btn-ghost btn-sm" data-uact="role">${u.role === "admin" ? "관리자 해제" : "관리자 지정"}</button><button type="button" class="${u.is_active === false ? "btn-green" : "btn-danger"} btn-sm" data-uact="active">${u.is_active === false ? "활성화" : "비활성화"}</button>`}</div></td>
    </tr>`; }).join("") || `<tr><td colspan="9" style="text-align:center;color:#6B7380;padding:24px">사용자가 없습니다.</td></tr>`;
  }
  async function userAction(id, act) {
    const u = state.users.find((x) => x.id === id); if (!u || u.id === me.id) return;
    try {
      if (act === "role") { const to = u.role === "admin" ? "user" : "admin"; if (!confirm(`${u.email} 을(를) ${to === "admin" ? "관리자로 지정" : "일반 사용자로 변경"}할까요?`)) return; await store.updateUser(id, { role: to }); }
      if (act === "active") { const to = u.is_active === false; if (!to && !confirm(`${u.email} 계정을 비활성화할까요? 로그인이 막힙니다.`)) return; await store.updateUser(id, { is_active: to }); }
      ui.toast("반영했습니다.", "ok"); await reloadAll();
    } catch (ex) { ui.toast("실패: " + ex.message, "error"); }
  }

  // ---------- 이벤트 ----------
  function bind() {
    $("tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (!b) return; state.tab = b.dataset.tab; renderTab(); });
    $("newProductBtn").addEventListener("click", () => openForm(null));
    $("cancelEditBtn").addEventListener("click", () => $("productForm").classList.add("hidden"));
    $("productForm").addEventListener("submit", saveForm);
    $("productSearch").addEventListener("input", (e) => { state.q = e.target.value; renderProducts(); });
    $("productCat").addEventListener("change", (e) => { state.cat = e.target.value; renderProducts(); });
    $("productStatus").addEventListener("change", (e) => { state.status = e.target.value; renderProducts(); });
    $("onlyUnverified").addEventListener("change", (e) => { state.unverified = e.target.checked; renderProducts(); });
    $("productRows").addEventListener("click", (e) => { const b = e.target.closest("[data-act]"); if (!b) return; productAction(b.closest("tr").dataset.id, b.dataset.act); });
    $("pendingRows").addEventListener("click", (e) => { const b = e.target.closest("[data-act]"); if (!b) return; if (b.dataset.act === "edit") { state.tab = "products"; renderTab(); } productAction(b.closest("tr").dataset.id, b.dataset.act); });
    $("userRows").addEventListener("click", (e) => { const b = e.target.closest("[data-uact]"); if (!b) return; userAction(b.closest("tr").dataset.id, b.dataset.uact); });
    $("reseedBtn").addEventListener("click", async () => { try { const n = await store.reseed(); ui.toast(`시드 상품 ${n}종을 추가했습니다.`, "ok"); await reloadAll(); } catch (ex) { ui.toast(ex.message, "error"); } });
  }
})();
