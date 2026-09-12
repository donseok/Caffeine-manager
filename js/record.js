// ============================================================================
// 섭취 기록 팝업(record.html) 로직
//   index.html 이 iframe 으로 띄웁니다. URL: record.html?product=<상품 id>
//   저장되면 부모에게 { type: 'record:saved', intake } 를 postMessage 합니다.
// ============================================================================
(async function () {
  const CM = window.CM, ui = CM.ui, store = CM.store, CFG = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const pp = ui.popupPage;
  pp.bindClose(); pp.autosize();

  const user = await CM.auth.requireUser();
  const productId = ui.qs("product");
  let product = productId ? await store.getProduct(productId) : null;
  if (!product) { $("title").textContent = "상품을 찾을 수 없습니다"; $("form").classList.add("hidden"); return; }

  // ---------- 상품 요약 ----------
  const cat = ui.catInfo(product.category);
  document.getElementById("productBox").classList.add("cat-" + product.category);
  $("title").textContent = product.name;
  $("thumb").innerHTML = product.image_url ? `<img src="${ui.esc(product.image_url)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain">` : ui.esc(ui.initial(product));
  $("productLine").innerHTML = `${ui.esc(product.brand)} · <b>${cat.label}</b> · ${ui.esc(product.serving_label)}`;
  $("nutritionLine").textContent = `카페인 ${ui.fmtMg(product.caffeine_mg)} · 당류 ${ui.fmtG(product.sugar_g)} · ${ui.fmtKcal(product.kcal)}`;

  // ---------- 기본값 ----------
  $("consumedAt").value = ui.toLocalInput();
  $("consumedAt").max = ui.toLocalInput(new Date(Date.now() + 5 * 60e3));
  let todayIntakes = [], lastPrice = null;
  try {
    const r = store.dayRange(0);
    const [today, recent] = await Promise.all([store.listIntakes({ from: r.from, to: r.to }), store.listIntakes({ limit: 300 })]);
    todayIntakes = today; lastPrice = store.latestPrices(recent)[product.id] || null;
  } catch (e) { console.warn(e); }
  if (lastPrice) { $("pricePaid").value = lastPrice.price; $("priceHint").textContent = `내 최근 결제 ${ui.fmtWon(lastPrice.price)} (${ui.isSameDay(lastPrice.at) ? "오늘" : ui.fmtDateShort(lastPrice.at)}) 를 채워 두었습니다. 다르면 고쳐 주세요.`; }
  else if (product.base_price != null) { $("pricePaid").placeholder = `예: ${product.base_price} (${product.price_note || "기준가"})`; }

  // ---------- 요약 ----------
  const limit = user.dailyLimit || CFG.DAILY_LIMIT_MG || 400;
  function renderSummary() {
    const q = Math.max(0, Number($("quantity").value) || 0);
    const when = new Date($("consumedAt").value || Date.now());
    const c = (Number(product.caffeine_mg) || 0) * q, s = product.sugar_g == null ? null : Number(product.sugar_g) * q, k = product.kcal == null ? null : Number(product.kcal) * q;
    const price = $("pricePaid").value === "" ? null : Number($("pricePaid").value) * q;
    const isToday = ui.isSameDay(when);
    const base = store.totals(todayIntakes).caffeine;
    const total = base + (isToday ? c : 0), pct = Math.round((total / limit) * 100);
    const over = total >= limit;
    $("summary").className = "summary" + (over ? " summary--warn" : "");
    $("summary").innerHTML = `이번 기록 <strong>카페인 ${ui.fmtMg(c)}</strong> · 당류 ${ui.fmtG(s)} · ${ui.fmtKcal(k)}${price != null ? ` · ${ui.fmtWon(price)}` : ""}`
      + (isToday ? ` → 오늘 누적 <strong class="${over ? "over" : ""}">${ui.fmtInt(total)} mg</strong> (목표의 ${pct}%)` : ` · ${when.getMonth() + 1}월 ${when.getDate()}일 기록`);
  }
  ["quantity", "consumedAt", "pricePaid"].forEach((id) => $(id).addEventListener("input", renderSummary));
  renderSummary();

  // ---------- 저장 ----------
  $("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("error"); err.classList.add("hidden");
    const q = Number($("quantity").value);
    if (!(q > 0 && q <= 20)) { err.textContent = "마신 횟수는 0보다 크고 20 이하여야 합니다."; err.classList.remove("hidden"); return; }
    const when = $("consumedAt").value ? new Date($("consumedAt").value) : null;
    if (!when || isNaN(when.getTime())) { err.textContent = "마신 날짜와 시간을 확인해 주세요."; err.classList.remove("hidden"); return; }
    if (when.getTime() > Date.now() + 10 * 60e3) { err.textContent = "미래 시각은 기록할 수 없습니다."; err.classList.remove("hidden"); return; }
    const price = $("pricePaid").value === "" ? null : Number($("pricePaid").value);
    if (price != null && !(price >= 0 && price < 1e7)) { err.textContent = "결제액을 확인해 주세요."; err.classList.remove("hidden"); return; }
    $("saveBtn").disabled = true; $("saveBtn").textContent = "저장 중…";
    try {
      const intake = await store.addIntake({ product, quantity: q, consumedAt: when, pricePaid: price });
      if (pp.inFrame()) pp.send({ type: "record:saved", intake });
      else { alert("기록했습니다."); location.href = "index.html"; }
    } catch (ex) {
      err.textContent = "저장 실패: " + ex.message; err.classList.remove("hidden");
      $("saveBtn").disabled = false; $("saveBtn").textContent = "기록 저장";
    }
  });
  $("quantity").focus();
})();
