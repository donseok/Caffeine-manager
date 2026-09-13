// ============================================================================
// 메인 화면(index.html) 로직
// ============================================================================
(async function () {
  const CM = window.CM, ui = CM.ui, store = CM.store, CFG = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  const HISTORY_PAGE = 50; // 내역 한 번에 보여줄 건수
  const state = {
    products: [], intakes: [], prices: {},
    query: "", category: "all", sort: "relevance", page: 1, range: "today", historyPage: 1,
    user: null,
  };

  // ---------- 시작 ----------
  state.user = await CM.auth.requireUser();
  ui.renderTopbarUser($("topbarUser"));
  $("todayDate").textContent = ui.fmtDateKo();
  if (ui.qs("denied")) { ui.toast("관리자만 볼 수 있는 페이지입니다.", "error"); history.replaceState(null, "", "index.html"); }

  bind(); // 데이터보다 먼저 묶는다 — 로딩 중 Enter 로 폼이 네이티브 제출되는 것을 막기 위해
  await Promise.all([loadProducts(), loadIntakes()]);
  renderAll();

  // ---------- 데이터 ----------
  async function loadProducts() {
    try { state.products = (await store.listProducts()).filter((p) => p.status !== "rejected"); }
    catch (e) { console.error(e); ui.toast("상품을 불러오지 못했습니다: " + e.message, "error"); state.products = []; }
  }
  async function loadIntakes() {
    try { state.intakes = await store.listIntakes(); state.prices = store.latestPrices(state.intakes); }
    catch (e) { console.error(e); ui.toast("기록을 불러오지 못했습니다: " + e.message, "error"); state.intakes = []; }
  }

  // ---------- 검색 · 정렬 ----------
  function norm(s) { return String(s || "").toLowerCase().replace(/\s+/g, ""); }
  function score(p, q) {
    if (!q) return 0;
    const name = norm(p.name), brand = norm(p.brand), tags = (p.tags || []).map(norm), cat = norm(ui.catInfo(p.category).label);
    const tokens = q.split(/\s+/).map(norm).filter(Boolean);
    let s = 0;
    for (const t of tokens) {
      let best = 0;
      if (name === t) best = 6; else if (name.startsWith(t)) best = 4; else if (name.includes(t)) best = 3;
      if (brand.includes(t)) best = Math.max(best, 2.5);
      if (tags.some((x) => x.includes(t))) best = Math.max(best, 2);
      if (cat.includes(t)) best = Math.max(best, 1);
      if (best === 0) return 0; // 모든 토큰이 맞아야 함
      s += best;
    }
    return s;
  }
  function visibleProducts() {
    const q = state.query.trim();
    let list = state.products.filter((p) => state.category === "all" || p.category === state.category);
    if (q) list = list.map((p) => ({ p, s: score(p, q) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.p);
    const byName = (a, b) => a.name.localeCompare(b.name, "ko");
    switch (state.sort) {
      case "caffeine-desc": list = list.slice().sort((a, b) => (b.caffeine_mg - a.caffeine_mg) || byName(a, b)); break;
      case "caffeine-asc": list = list.slice().sort((a, b) => (a.caffeine_mg - b.caffeine_mg) || byName(a, b)); break;
      case "kcal-asc": list = list.slice().sort((a, b) => ((a.kcal ?? 1e9) - (b.kcal ?? 1e9)) || byName(a, b)); break;
      case "name": list = list.slice().sort(byName); break;
      default: if (!q) { const order = Object.keys(CM.CATEGORIES); list = list.slice().sort((a, b) => (order.indexOf(a.category) - order.indexOf(b.category)) || a.brand.localeCompare(b.brand, "ko") || byName(a, b)); }
    }
    return list;
  }

  // ---------- 렌더 ----------
  function renderAll() { renderCatalog(); renderMetrics(); renderHistory(); }

  function priceInfo(p) {
    const mine = state.prices[p.id];
    if (mine) return { price: ui.fmtWon(mine.price), note: `내 최근 결제 · ${ui.isSameDay(mine.at) ? "오늘" : ui.fmtDateShort(mine.at)}` };
    if (p.base_price != null) return { price: ui.fmtWon(p.base_price), note: `${p.price_note || "기준가"} · ${p.price_checked_at ? ui.fmtDateShort(p.price_checked_at) + " 확인" : "확인 필요"}` };
    return { price: "가격 미입력", note: p.price_note || "기록 시 결제액을 입력하세요" };
  }
  function productCard(p) {
    const cat = ui.catInfo(p.category), pr = priceInfo(p);
    const badge = p.status === "pending" ? `<span class="badge badge--check" title="관리자 승인 전 · 내게만 보임">승인 대기</span>`
      : p.verified_at ? `<span class="badge" title="${ui.esc(p.source || "")} · ${ui.esc(p.verified_at)} 확인">${ui.esc((p.source || "공식").replace(" 영양정보", ""))} · ${ui.fmtDateShort(p.verified_at)} 확인</span>`
      : `<span class="badge badge--check" title="${ui.esc(p.source || "출처 미상")} · 아직 재확인하지 않은 수치">확인 필요</span>`;
    const badgeSrc = ui.brandBadgeSrc(p);
    const img = p.image_url ? `<img src="${ui.esc(p.image_url)}" alt="${ui.esc(p.brand)}">`
      : badgeSrc ? `<img class="${ui.isBrandPhoto(badgeSrc) ? "product__photo" : "product__badge"}" src="${ui.esc(badgeSrc)}" alt="${ui.esc(p.brand)}">`
      : `<span class="product__initial">${ui.esc(ui.initial(p))}</span>`;
    return `<article class="product cat-${ui.esc(p.category)}" data-id="${ui.esc(p.id)}">
      <div class="product__img">${img}${badge}</div>
      <div class="product__body">
        <p class="product__brand">${ui.esc(p.brand)} · <b>${cat.label}</b></p>
        <h3 class="product__name">${ui.esc(p.name)}</h3>
        <p class="product__serving">${ui.esc(p.serving_label)}</p>
        <dl class="facts">
          <div><dt>카페인</dt><dd class="is-main">${ui.fmtMg(p.caffeine_mg)}</dd></div>
          <div><dt>당류</dt><dd>${ui.fmtG(p.sugar_g)}</dd></div>
          <div><dt>칼로리</dt><dd>${ui.fmtKcal(p.kcal)}</dd></div>
        </dl>
        <div class="product__foot">
          <div class="product__price"><strong>${ui.esc(pr.price)}</strong><span title="${ui.esc(pr.note)}">${ui.esc(pr.note)}</span></div>
          <button type="button" class="btn-dark" data-record="${ui.esc(p.id)}">기록</button>
        </div>
      </div>
    </article>`;
  }
  function renderCatalog() {
    const list = visibleProducts();
    const pageSize = CFG.PAGE_SIZE || 8, shown = list.slice(0, state.page * pageSize);
    const q = state.query.trim();
    const approved = state.products.filter((p) => p.status === "approved");
    const sb = approved.filter((p) => p.brand_key === "starbucks").length;
    $("catalogMeta").textContent = q
      ? `‘${q}’ 검색 결과 ${list.length}종` + (state.category !== "all" ? ` · ${ui.catInfo(state.category).label}` : "")
      : `총 ${approved.length}종 · 스타벅스 ${sb} · 시판 음료 ${approved.length - sb}` + (state.category !== "all" ? ` · ${ui.catInfo(state.category).label} ${list.length}종` : "");
    $("productGrid").innerHTML = shown.map(productCard).join("");
    $("productGrid").classList.toggle("hidden", list.length === 0);
    $("emptyState").classList.toggle("hidden", list.length !== 0);
    $("moreBtn").classList.toggle("hidden", shown.length >= list.length);
    if (shown.length < list.length) $("moreBtn").textContent = `결과 더 보기 (${list.length - shown.length}종 남음)`;
  }

  function ts(v) { return Date.parse(v); } // 함수 선언(호이스팅) — 위쪽 renderAll() 보다 먼저 정의되어야 함
  function todayIntakes() { const r = store.dayRange(0); return state.intakes.filter((x) => ts(x.consumed_at) >= ts(r.from) && ts(x.consumed_at) < ts(r.to)); }
  function renderMetrics() {
    const t = store.totals(todayIntakes());
    const limit = state.user.dailyLimit || CFG.DAILY_LIMIT_MG || 400;
    const c = Math.round(t.caffeine), pct = Math.round((c / limit) * 100);
    const status = c >= limit ? "danger" : c >= limit * 0.75 ? "warning" : "ok";
    $("todayCount").textContent = t.count;
    $("todayCaffeine").textContent = ui.fmtInt(c);
    $("todayGoal").textContent = `목표 ${ui.fmtInt(limit)} mg · ${pct}%`;
    const bar = $("todayBar"); bar.className = "bar" + (status !== "ok" ? " bar--" + status : ""); bar.firstElementChild.style.width = Math.min(100, pct) + "%";
    $("todayCopy").textContent = status === "danger" ? `하루 목표를 ${ui.fmtInt(c - limit)} mg 초과했습니다. 오늘은 여기까지가 좋겠어요.`
      : status === "warning" ? `목표까지 ${ui.fmtInt(limit - c)} mg 남았습니다. 저녁에는 디카페인을 권해요.`
      : `목표까지 ${ui.fmtInt(limit - c)} mg 남았습니다.`;
    $("todaySugar").textContent = ui.fmtNum(t.sugar, 0); $("todaySugarSub").textContent = `${t.count}회 합계 · 1회 제공량 기준`;
    $("todayKcal").textContent = ui.fmtInt(t.kcal); $("todayKcalSub").textContent = `${t.count}회 합계 · 1회 제공량 기준`;
    $("todaySpend").textContent = ui.fmtInt(t.spend); $("todaySpendSub").textContent = `${t.paidCount}회 결제 · 내가 입력한 금액만`;
  }

  function rangeIntakes() {
    if (state.range === "today") return todayIntakes();
    if (state.range === "7d") { const from = ts(store.dayRange(6).from); return state.intakes.filter((x) => ts(x.consumed_at) >= from); }
    return state.intakes;
  }
  function entryRow(x) {
    const q = Number(x.quantity) || 1, qText = q === 1 ? "1회" : `${ui.fmtNum(q, 2)}회`;
    const when = state.range === "today" ? ui.fmtTime(x.consumed_at) : ui.fmtDateTimeKo(x.consumed_at);
    return `<div class="entry cat-${ui.esc(x.category || "other")}" data-id="${ui.esc(x.id)}">
      <div class="entry__thumb">${(() => { const s = ui.brandBadgeSrc(x); return s ? `<img${ui.isBrandPhoto(s) ? ' class="entry__thumb-photo"' : ""} src="${ui.esc(s)}" alt="">` : ui.esc(ui.initial(x.brand ? { brand: x.brand } : { name: x.product_name })); })()}</div>
      <div style="min-width:0"><strong class="entry__name" title="${ui.esc(x.product_name)}">${ui.esc(x.product_name)}</strong><span class="entry__meta">${when} · ${qText}${x.serving_ml ? ` · ${ui.fmtInt(x.serving_ml * q)} mL` : ""}</span></div>
      <div class="entry__right"><strong class="entry__caffeine">${ui.fmtMg((Number(x.caffeine_mg) || 0) * q)}</strong><span class="entry__price">${x.price_paid != null ? ui.fmtWon(x.price_paid * q) : "가격 미입력"}</span></div>
      <button type="button" class="entry__delete" title="기록 삭제" data-delete="${ui.esc(x.id)}">×</button>
    </div>`;
  }
  function renderHistory() {
    const list = rangeIntakes(), t = store.totals(list);
    $("historySummary").textContent = `${t.count}회 · 카페인 ${ui.fmtInt(t.caffeine)} mg · ${ui.fmtInt(t.spend)}원`;
    const shown = list.slice(0, state.historyPage * HISTORY_PAGE);
    const rest = list.length - shown.length;
    $("historyList").innerHTML = list.length
      ? shown.map(entryRow).join("") + (rest > 0 ? `<button type="button" class="btn-more" id="historyMore">이전 기록 더 보기 (${ui.fmtInt(rest)}건 남음)</button>` : "")
      : `<div class="history__empty">${state.range === "today" ? "오늘은 아직 기록이 없습니다.<br>위에서 음료를 검색해 기록해 보세요." : "해당 기간의 기록이 없습니다."}</div>`;
    // 잔존 카페인 — 최근 2일 기록으로 추정
    const from = ts(store.dayRange(1).from), recent = state.intakes.filter((x) => ts(x.consumed_at) >= from);
    const now = store.residual(recent), midnight = store.residual(recent, store.dayRange(-1).from);
    $("residualNote").textContent = `체내 잔존 카페인 약 ${ui.fmtInt(now)} mg · 자정 무렵 약 ${ui.fmtInt(midnight)} mg (반감기 ${CFG.HALF_LIFE_HOURS || 5}시간 기준 추정)`;
    $("residualNote").classList.toggle("note--warn", now >= 100);
  }

  // ---------- 팝업 ----------
  function openRecord(productId) {
    ui.openPopup("record.html?product=" + encodeURIComponent(productId), {
      title: "섭취 기록", height: 600,
      onMessage: async (m) => {
        if (m.type === "record:saved") {
          ui.closePopup(); await loadIntakes(); renderAll();
          ui.toast(`기록했습니다 · 카페인 ${ui.fmtInt(m.intake.caffeine_mg * m.intake.quantity)} mg`, "ok");
        }
      },
    });
  }
  function openProductForm() {
    ui.openPopup("product-form.html", {
      title: "상품 직접 추가", height: 640,
      onMessage: async (m) => {
        if (m.type === "product:saved") {
          ui.closePopup(); await loadProducts();
          state.query = m.product.name; $("searchInput").value = state.query; state.category = "all"; state.page = 1; syncFilters(); renderCatalog();
          ui.toast(m.product.status === "pending" ? "추가했습니다. 관리자 승인 전까지는 내게만 보입니다." : "상품을 추가했습니다.", "ok");
          if (m.record) openRecord(m.product.id);
        }
      },
    });
  }

  // ---------- 이벤트 ----------
  function syncFilters() { document.querySelectorAll("#filters .filter").forEach((b) => b.classList.toggle("is-active", b.dataset.cat === state.category)); }
  function bind() {
    $("searchForm").addEventListener("submit", (e) => { e.preventDefault(); state.query = $("searchInput").value; state.page = 1; renderCatalog(); });
    let timer; $("searchInput").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { state.query = $("searchInput").value; state.page = 1; renderCatalog(); }, 180); });
    $("quickChips").addEventListener("click", (e) => { const b = e.target.closest("[data-q]"); if (!b) return; state.query = b.dataset.q; $("searchInput").value = state.query; state.page = 1; renderCatalog(); $("productGrid").scrollIntoView({ behavior: "smooth", block: "start" }); });
    $("filters").addEventListener("click", (e) => { const b = e.target.closest("[data-cat]"); if (!b) return; state.category = b.dataset.cat; state.page = 1; syncFilters(); renderCatalog(); });
    $("sortSelect").addEventListener("change", (e) => { state.sort = e.target.value; state.page = 1; renderCatalog(); });
    $("moreBtn").addEventListener("click", () => { state.page += 1; renderCatalog(); });
    $("productGrid").addEventListener("click", (e) => { const b = e.target.closest("[data-record]"); if (b) openRecord(b.dataset.record); });
    $("addProductBtn").addEventListener("click", openProductForm);
    $("addProductBtn2").addEventListener("click", openProductForm);
    $("rangeSegment").addEventListener("click", (e) => { const b = e.target.closest("[data-range]"); if (!b) return; state.range = b.dataset.range; state.historyPage = 1; document.querySelectorAll("#rangeSegment button").forEach((x) => x.classList.toggle("is-active", x === b)); renderHistory(); });
    $("historyList").addEventListener("click", async (e) => {
      if (e.target.closest("#historyMore")) { state.historyPage += 1; renderHistory(); return; }
      const b = e.target.closest("[data-delete]"); if (!b) return;
      if (!confirm("이 기록을 삭제할까요?")) return;
      try { await store.deleteIntake(b.dataset.delete); await loadIntakes(); renderAll(); ui.toast("삭제했습니다."); }
      catch (err) { ui.toast("삭제 실패: " + err.message, "error"); }
    });
    $("sourcesLink").addEventListener("click", (e) => { e.preventDefault(); ui.toast("출처: 브랜드 공식 영양정보 · 제품 표시사항 · 사용자 직접 입력 — 각 상품 타일의 배지에서 출처와 확인일을 확인하세요."); });
    document.addEventListener("cm:profile", () => { state.user = CM.auth.getUser(); renderMetrics(); });
    // 다른 탭에서 기록/상품이 바뀐 경우(로컬 모드) 반영
    window.addEventListener("storage", async (e) => {
      if (e.key === "cm:intakes" || e.key === "cm:products") { await Promise.all([loadProducts(), loadIntakes()]); renderAll(); return; }
      // 다른 탭에서 로그아웃하거나 프로필이 바뀐 경우 — 예전엔 이 탭이 로그인된 척 계속 기록했다.
      if (e.key === "cm:session" || e.key === "cm:users") {
        const u = await CM.auth.refresh();
        if (!u) { location.replace("login.html"); return; }
        state.user = u; ui.renderTopbarUser($("topbarUser"));
        await Promise.all([loadProducts(), loadIntakes()]); renderAll();
      }
    });
  }
})();
