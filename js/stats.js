// ============================================================================
// 주간 통계(stats.html) 로직 — 요일별 카페인·지출·횟수, 분류·시간대 비중, TOP 5
//   주는 월요일 시작. 선택한 주와 그 전주를 한 번에 불러와 비교한다.
// ============================================================================
(async function () {
  const CM = window.CM, ui = CM.ui, store = CM.store, CFG = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
  const BUCKETS = [ // 시간대 — [시작시, 끝시) · 저녁·밤은 18시부터 다음날 5시까지
    { key: "morning", label: "아침 (5–11시)", from: 5, to: 11 },
    { key: "noon", label: "낮 (11–15시)", from: 11, to: 15 },
    { key: "afternoon", label: "오후 (15–18시)", from: 15, to: 18 },
    { key: "evening", label: "저녁·밤 (18시 이후)", from: 18, to: 29 },
  ];
  const METRICS = {
    caffeine: { title: "요일별 카페인", unit: "mg", fmt: (v) => ui.fmtInt(v) + " mg", get: (d) => d.caffeine, goal: true },
    spend: { title: "요일별 지출", unit: "원", fmt: (v) => ui.fmtInt(v) + "원", get: (d) => d.spend, goal: false },
    count: { title: "요일별 기록 횟수", unit: "회", fmt: (v) => ui.fmtInt(v) + "회", get: (d) => d.count, goal: false },
  };
  const state = { user: null, offset: 0, metric: "caffeine", week: [], prev: [], days: [], limit: 400 };

  // ---------- 시작 ----------
  state.user = await CM.auth.requireUser();
  ui.renderTopbarUser($("topbarUser"));
  bind();
  await load();
  render();

  // ---------- 날짜 ----------
  function startOfDay(d) { d = new Date(d); d.setHours(0, 0, 0, 0); return d; }
  function addDays(d, n) { d = new Date(d); d.setDate(d.getDate() + n); return d; }
  /** offset 주 전(음수)의 월요일 0시 */
  function weekStart(offset) { const t = startOfDay(new Date()); const dow = (t.getDay() + 6) % 7; return addDays(t, -dow + offset * 7); }
  function ts(v) { return Date.parse(v); }
  function fmtMD(d) { return `${d.getMonth() + 1}월 ${d.getDate()}일`; }

  // ---------- 데이터 ----------
  async function load() {
    state.limit = state.user.dailyLimit || CFG.DAILY_LIMIT_MG || 400;
    const from = weekStart(state.offset), to = addDays(from, 7), pfrom = addDays(from, -7);
    let list = [];
    try { list = await store.listIntakes({ from: pfrom.toISOString(), to: to.toISOString() }); }
    catch (e) { console.error(e); ui.toast("기록을 불러오지 못했습니다: " + e.message, "error"); }
    const f = from.getTime();
    state.week = list.filter((x) => ts(x.consumed_at) >= f);
    state.prev = list.filter((x) => ts(x.consumed_at) < f);
    state.days = DAYS.map((label, i) => {
      const d0 = addDays(from, i), d1 = addDays(from, i + 1);
      const items = state.week.filter((x) => ts(x.consumed_at) >= d0.getTime() && ts(x.consumed_at) < d1.getTime());
      const t = store.totals(items);
      return { i, label, date: d0, items, ...t, isToday: ui.isSameDay(d0), isFuture: d0.getTime() > Date.now(), over: t.caffeine > state.limit };
    });
  }

  // ---------- 렌더 ----------
  function render() { renderHead(); renderSummary(); renderChart(); renderDayTable(); renderShares(); renderTop(); }

  function renderHead() {
    const from = weekStart(state.offset), to = addDays(from, 6);
    const name = state.offset === 0 ? "이번 주" : state.offset === -1 ? "지난주" : `${-state.offset}주 전`;
    $("weekTitle").textContent = `${name} 카페인`;
    $("weekRange").textContent = `${fmtMD(from)}(월) ~ ${fmtMD(to)}(일)`;
    $("thisWeek").textContent = name;
    $("nextWeek").disabled = state.offset >= 0;
    $("sumLabel").textContent = `${name} 합계`;
    $("topTitle").textContent = `${name} TOP 5`;
  }

  function renderSummary() {
    const t = store.totals(state.week), p = store.totals(state.prev);
    const elapsed = state.offset < 0 ? 7 : ((new Date().getDay() + 6) % 7) + 1; // 이번 주는 오늘까지 지난 일수로 평균
    const avg = t.caffeine / elapsed, pct = Math.round((avg / state.limit) * 100);
    $("sumCount").textContent = t.count;
    $("sumCaffeine").textContent = ui.fmtInt(t.caffeine);
    $("sumAvg").textContent = `하루 평균 ${ui.fmtInt(avg)} mg · 목표 대비 ${pct}%`;
    const bar = $("sumBar"); bar.className = "bar" + (pct >= 100 ? " bar--danger" : pct >= 75 ? " bar--warning" : ""); bar.firstElementChild.style.width = Math.min(100, pct) + "%";
    $("sumDelta").textContent = p.count === 0 ? (t.count ? "지난주에는 기록이 없어 비교할 수 없습니다." : "이 주와 지난주 모두 기록이 없습니다.")
      : t.caffeine === p.caffeine ? `지난주(${ui.fmtInt(p.caffeine)} mg)와 같습니다.`
      : `지난주 ${ui.fmtInt(p.caffeine)} mg보다 ${ui.fmtInt(Math.abs(t.caffeine - p.caffeine))} mg ${t.caffeine > p.caffeine ? "많습니다" : "적습니다"} (${t.caffeine > p.caffeine ? "+" : "−"}${Math.round(Math.abs(t.caffeine - p.caffeine) / p.caffeine * 100)}%).`;
    $("sumSpend").textContent = ui.fmtInt(t.spend);
    $("sumSpendSub").textContent = `${t.paidCount}회 결제 · 내가 입력한 금액만` + (p.spend ? ` · 지난주 ${ui.fmtInt(p.spend)}원` : "");
    const peak = state.days.reduce((m, d) => (d.caffeine > (m ? m.caffeine : 0) ? d : m), null);
    $("peakDay").textContent = peak ? `${peak.label}요일` : "—";
    $("peakUnit").textContent = "";
    $("peakSub").textContent = peak ? `${fmtMD(peak.date)} · 카페인 ${ui.fmtInt(peak.caffeine)} mg · ${peak.count}회` : "기록이 없습니다";
    const over = state.days.filter((d) => d.over);
    $("overDays").textContent = over.length;
    $("overSub").textContent = over.length ? `${over.map((d) => d.label).join("·")}요일 · 하루 목표 ${ui.fmtInt(state.limit)} mg 기준` : `하루 목표 ${ui.fmtInt(state.limit)} mg 기준`;
  }

  /** 눈금 상한 — 1·2·5 단위의 깔끔한 수 */
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v))), r = v / p;
    return ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((c) => r <= c) || 10) * p;
  }

  function renderChart() {
    const M = METRICS[state.metric];
    $("chartTitle").textContent = M.title;
    document.querySelectorAll("#metricSegment button").forEach((b) => b.classList.toggle("is-active", b.dataset.metric === state.metric));
    const vals = state.days.map(M.get);
    const rawMax = Math.max(...vals, M.goal ? state.limit : 0);
    const top = niceMax(rawMax * 1.08);
    // 컨테이너 너비에 맞춰 그린다 — 640px 고정 viewBox 를 폰 너비로 축소하면 글자가 읽히지 않는다
    const W = Math.max(300, Math.min(640, $("chart").clientWidth || 640)), H = 250, padL = W < 420 ? 40 : 48, padR = W < 420 ? 12 : 16, padT = 22, padB = 34;
    const plotW = W - padL - padR, plotH = H - padT - padB, band = plotW / 7, bw = 24;
    const y = (v) => padT + plotH - (v / top) * plotH;
    const ticks = 4; let g = "";
    for (let k = 0; k <= ticks; k++) {
      const v = (top / ticks) * k, yy = y(v);
      g += `<line x1="${padL}" x2="${W - padR}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="${k === 0 ? "#CBD1DA" : "#E4E7EC"}" stroke-width="1"/>`;
      g += `<text x="${padL - 8}" y="${(yy + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#6B7380">${ui.fmtInt(v)}</text>`;
    }
    const maxV = Math.max(...vals);
    let bars = "", labels = "";
    state.days.forEach((d, i) => {
      const v = vals[i], cx = padL + band * i + band / 2;
      labels += `<text x="${cx.toFixed(1)}" y="${H - 12}" text-anchor="middle" font-size="12" font-weight="${d.isToday ? 700 : 500}" fill="${d.isToday ? "#14181F" : "#6B7380"}">${d.label}${d.isToday ? "·오늘" : ""}</text>`;
      if (v > 0) {
        const h = Math.max(2, (v / top) * plotH), x0 = cx - bw / 2, y0 = y(v), r = Math.min(4, h);
        const over = state.metric === "caffeine" && d.over;
        // 위쪽만 4px 둥글게, 아래는 기준선에 붙인다
        const path = `M${x0} ${(y0 + plotH + padT - y0).toFixed(1)} V${(y0 + r).toFixed(1)} Q${x0} ${y0.toFixed(1)} ${x0 + r} ${y0.toFixed(1)} H${(x0 + bw - r).toFixed(1)} Q${x0 + bw} ${y0.toFixed(1)} ${x0 + bw} ${(y0 + r).toFixed(1)} V${(padT + plotH).toFixed(1)} Z`;
        bars += `<path d="${path}" fill="${over ? "#B3261E" : "#1F6F5B"}"/>`;
        // 값 라벨은 최댓값·오늘만 (나머지는 툴팁과 표)
        if (v === maxV || d.isToday) labels += `<text x="${cx.toFixed(1)}" y="${(y0 - 6).toFixed(1)}" text-anchor="middle" font-size="11.5" font-weight="600" fill="#3D4552">${ui.fmtInt(v)}</text>`;
      }
      bars += `<rect class="chart__hit" data-day="${i}" x="${(padL + band * i).toFixed(1)}" y="${padT}" width="${band.toFixed(1)}" height="${plotH}" fill="transparent"/>`;
    });
    let goal = "";
    if (M.goal) {
      const yy = y(state.limit);
      goal = `<line x1="${padL}" x2="${W - padR}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="#9A5B00" stroke-width="1.5" stroke-dasharray="4 4"/>
        <text x="${W - padR}" y="${(yy - 5).toFixed(1)}" text-anchor="end" font-size="11" fill="#9A5B00">목표 ${ui.fmtInt(state.limit)} mg</text>`;
    }
    const tip = $("chartTip");
    $("chart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${ui.esc(M.title)} 막대 차트">${g}${bars}${goal}${labels}</svg>`;
    $("chart").appendChild(tip); tip.classList.add("hidden");
    $("chartLegend").innerHTML = state.metric === "caffeine"
      ? `<span><i style="background:#1F6F5B"></i>목표 이내</span><span><i style="background:#B3261E"></i>목표 초과</span><span><i class="chart__legend-line"></i>하루 목표</span>`
      : `<span><i style="background:#1F6F5B"></i>${ui.esc(M.title.replace("요일별 ", ""))} (${M.unit})</span>`;
    $("chartMeta").textContent = vals.some((v) => v > 0) ? "월요일부터 일요일까지 · 막대에 마우스를 올리면 자세히 보입니다" : "이 주에는 기록이 없습니다";
  }

  function showTip(i, evt) {
    const d = state.days[i], tip = $("chartTip");
    tip.innerHTML = `<strong>${fmtMD(d.date)} (${d.label})</strong>${d.count ? `카페인 ${ui.fmtInt(d.caffeine)} mg · ${d.count}회<br>지출 ${ui.fmtInt(d.spend)}원${d.over ? " · <em>목표 초과</em>" : ""}` : (d.isFuture ? "아직 오지 않은 날" : "기록 없음")}`;
    tip.classList.remove("hidden");
    const box = $("chart").getBoundingClientRect();
    const x = evt.clientX - box.left, yPos = evt.clientY - box.top;
    tip.style.left = Math.min(x + 12, box.width - tip.offsetWidth - 4) + "px";
    tip.style.top = Math.max(0, yPos - tip.offsetHeight - 12) + "px";
  }

  function renderDayTable() {
    $("dayRows").innerHTML = state.days.map((d) => `<tr class="${d.isToday ? "is-today" : ""}${d.isFuture ? " is-muted" : ""}">
      <td><b>${d.label}</b> <small>${d.date.getMonth() + 1}/${d.date.getDate()}</small>${d.isToday ? ' <span class="pill">오늘</span>' : ""}</td>
      <td class="num">${d.count || "—"}</td>
      <td class="num">${d.count ? ui.fmtInt(d.caffeine) + " mg" : "—"}</td>
      <td class="num col-sugar">${d.count ? ui.fmtNum(d.sugar, 0) + " g" : "—"}</td>
      <td class="num">${d.paidCount ? ui.fmtInt(d.spend) + "원" : "—"}</td>
      <td>${d.over ? '<span class="pill pill--danger">목표 초과</span>' : d.count ? '<span class="pill pill--ok">목표 이내</span>' : ""}</td>
    </tr>`).join("");
  }

  function shareRows(rows, total, colorOf) {
    if (!total) return `<li class="share__empty">기록이 없습니다</li>`;
    return rows.map((r) => {
      const pct = Math.round((r.value / total) * 100);
      return `<li><span class="share__sw" style="background:${colorOf(r)}"></span>
        <div style="min-width:0"><div class="share__row"><span class="share__name">${ui.esc(r.label)}</span><span class="share__val">${ui.fmtInt(r.value)} mg · ${r.count}회</span></div>
        <div class="share__bar"><span style="width:${pct}%;background:${colorOf(r)}"></span></div></div>
        <span class="share__pct">${pct}%</span></li>`;
    }).join("");
  }
  function renderShares() {
    const total = store.totals(state.week).caffeine;
    // 분류별 — 카페인 많은 순
    const byCat = {};
    state.week.forEach((x) => { const k = CM.CATEGORIES[x.category] ? x.category : "other"; const q = Number(x.quantity) || 1; byCat[k] = byCat[k] || { key: k, label: ui.catInfo(k).label, value: 0, count: 0 }; byCat[k].value += (Number(x.caffeine_mg) || 0) * q; byCat[k].count += 1; });
    const cats = Object.values(byCat).sort((a, b) => b.value - a.value);
    $("catList").innerHTML = shareRows(cats, total, (r) => ui.catInfo(r.key).color);
    // 시간대별 — 고정 순서, 단일 색
    const buckets = BUCKETS.map((b) => ({ ...b, value: 0, count: 0 }));
    state.week.forEach((x) => {
      const h = new Date(x.consumed_at).getHours(), hh = h < 5 ? h + 24 : h, q = Number(x.quantity) || 1;
      const b = buckets.find((b) => hh >= b.from && hh < b.to) || buckets[3];
      b.value += (Number(x.caffeine_mg) || 0) * q; b.count += 1;
    });
    $("hourList").innerHTML = shareRows(buckets, total, () => "#1F6F5B");
    const evening = buckets[3], share = total ? Math.round((evening.value / total) * 100) : 0;
    const note = $("hourNote");
    note.classList.toggle("hidden", !total);
    note.classList.toggle("note--warn", share >= 25);
    note.textContent = share >= 25
      ? `저녁 이후 섭취가 ${share}%입니다. 반감기 ${CFG.HALF_LIFE_HOURS || 5}시간을 감안하면 잠들 때까지 카페인이 남을 수 있어요.`
      : `저녁 이후 섭취 비중 ${share}% — 수면에 영향이 적은 편입니다.`;
  }

  function renderTop() {
    const by = {};
    state.week.forEach((x) => {
      const k = `${x.brand || ""}|${x.product_name}`, q = Number(x.quantity) || 1;
      by[k] = by[k] || { brand: x.brand, product_name: x.product_name, category: x.category, count: 0, caffeine: 0, spend: 0, paid: 0 };
      by[k].count += 1; by[k].caffeine += (Number(x.caffeine_mg) || 0) * q;
      if (x.price_paid != null) { by[k].spend += Number(x.price_paid) * q; by[k].paid += 1; }
    });
    const rows = Object.values(by).sort((a, b) => b.count - a.count || b.caffeine - a.caffeine).slice(0, 5);
    $("topEmpty").classList.toggle("hidden", rows.length > 0);
    $("topTable").classList.toggle("hidden", rows.length === 0);
    $("topMeta").textContent = rows.length ? `횟수 기준 · 음료 ${Object.keys(by).length}종 중` : "";
    $("topRows").innerHTML = rows.map((r, i) => {
      const s = ui.brandBadgeSrc(r);
      const thumb = s ? `<img${ui.isBrandPhoto(s) ? ' class="entry__thumb-photo"' : ""} src="${ui.esc(s)}" alt="">` : ui.esc(ui.initial(r.brand ? { brand: r.brand } : { name: r.product_name }));
      return `<tr><td><div class="top__item cat-${ui.esc(r.category || "other")}"><span class="top__rank">${i + 1}</span><span class="entry__thumb">${thumb}</span><div style="min-width:0"><b class="top__name">${ui.esc(r.product_name)}</b><small>${ui.esc(r.brand || "")}</small></div></div></td>
        <td class="num">${r.count}회</td><td class="num">${ui.fmtInt(r.caffeine)} mg</td><td class="num">${r.paid ? ui.fmtInt(r.spend) + "원" : "—"}</td></tr>`;
    }).join("");
  }

  // ---------- 이벤트 ----------
  function bind() {
    const go = async (offset) => { state.offset = Math.min(0, offset); await load(); render(); };
    $("prevWeek").addEventListener("click", () => go(state.offset - 1));
    $("nextWeek").addEventListener("click", () => go(state.offset + 1));
    $("thisWeek").addEventListener("click", () => go(0));
    $("metricSegment").addEventListener("click", (e) => { const b = e.target.closest("[data-metric]"); if (!b) return; state.metric = b.dataset.metric; renderChart(); });
    const chart = $("chart");
    chart.addEventListener("mousemove", (e) => { const r = e.target.closest(".chart__hit"); if (r) showTip(Number(r.dataset.day), e); else $("chartTip").classList.add("hidden"); });
    chart.addEventListener("mouseleave", () => $("chartTip").classList.add("hidden"));
    let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (state.days.length) renderChart(); }, 120); });
    chart.addEventListener("click", (e) => { const r = e.target.closest(".chart__hit"); if (r) showTip(Number(r.dataset.day), e); }); // 터치
    document.addEventListener("cm:profile", async () => { state.user = CM.auth.getUser(); await load(); render(); });
    window.addEventListener("storage", async (e) => {
      if (e.key === "cm:intakes") { await load(); render(); return; }
      if (e.key === "cm:session" || e.key === "cm:users") { const u = await CM.auth.refresh(); if (!u) { location.replace("login.html"); return; } state.user = u; ui.renderTopbarUser($("topbarUser")); await load(); render(); }
    });
  }
})();
