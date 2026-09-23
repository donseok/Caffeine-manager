// ============================================================================
// 통계(stats.html) 로직 — 주간 · 월간
//   주는 월요일 시작, 달은 1일 시작. 선택한 기간과 바로 앞 기간을 한 번에 불러와 비교한다.
//   일별 집계(state.days)를 공통으로 만들고, 차트·표·비중·TOP 이 그 위에서 돈다.
// ============================================================================
(async function () {
  const CM = window.CM, ui = CM.ui, store = CM.store, CFG = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const DOW = ["월", "화", "수", "목", "금", "토", "일"];
  const BUCKETS = [ // 시간대 — [시작시, 끝시) · 저녁·밤은 18시부터 다음날 5시까지
    { key: "morning", label: "아침 (5–11시)", from: 5, to: 11 },
    { key: "noon", label: "낮 (11–15시)", from: 11, to: 15 },
    { key: "afternoon", label: "오후 (15–18시)", from: 15, to: 18 },
    { key: "evening", label: "저녁·밤 (18시 이후)", from: 18, to: 29 },
  ];
  const METRICS = {
    caffeine: { name: "카페인", unit: "mg", get: (d) => d.caffeine, goal: true },
    spend: { name: "지출", unit: "원", get: (d) => d.spend, goal: false },
    count: { name: "기록 횟수", unit: "회", get: (d) => d.count, goal: false },
  };
  const state = { user: null, period: ui.qs("period") === "month" ? "month" : "week", offset: 0, metric: "caffeine", cur: [], prev: [], days: [], limit: 400 };

  // ---------- 시작 ----------
  state.user = await CM.auth.requireUser();
  ui.renderTopbarUser($("topbarUser"));
  bind();
  await load();
  render();

  // ---------- 날짜 ----------
  function startOfDay(d) { d = new Date(d); d.setHours(0, 0, 0, 0); return d; }
  function addDays(d, n) { d = new Date(d); d.setDate(d.getDate() + n); return d; }
  function addMonths(d, n) { d = new Date(d); d.setMonth(d.getMonth() + n); return d; }
  function ts(v) { return Date.parse(v); }
  function fmtMD(d) { return `${d.getMonth() + 1}월 ${d.getDate()}일`; }
  function fmtShort(d) { return `${d.getMonth() + 1}/${d.getDate()}`; }
  function isWeek() { return state.period === "week"; } // 함수 선언(호이스팅) — 위쪽 시작 코드에서 먼저 불린다
  /** 선택한 기간의 시작 (offset ≤ 0: 0 이 현재 기간) */
  function periodStart(offset) {
    if (isWeek()) { const t = startOfDay(new Date()); return addDays(t, -((t.getDay() + 6) % 7) + offset * 7); }
    const t = new Date(); return new Date(t.getFullYear(), t.getMonth() + offset, 1);
  }
  function periodNext(start) { return isWeek() ? addDays(start, 7) : addMonths(start, 1); }
  function periodPrev(start) { return isWeek() ? addDays(start, -7) : addMonths(start, -1); }
  function periodName(offset) {
    if (isWeek()) return offset === 0 ? "이번 주" : offset === -1 ? "지난주" : `${-offset}주 전`;
    return offset === 0 ? "이번 달" : offset === -1 ? "지난달" : `${-offset}달 전`;
  }

  // ---------- 데이터 ----------
  async function load() {
    state.limit = state.user.dailyLimit || CFG.DAILY_LIMIT_MG || 400;
    const from = periodStart(state.offset), to = periodNext(from), pfrom = periodPrev(from);
    let list = [];
    try { list = await store.listIntakes({ from: pfrom.toISOString(), to: to.toISOString() }); }
    catch (e) { console.error(e); ui.toast("기록을 불러오지 못했습니다: " + e.message, "error"); }
    const f = from.getTime();
    state.cur = list.filter((x) => ts(x.consumed_at) >= f);
    state.prev = list.filter((x) => ts(x.consumed_at) < f);
    state.days = [];
    for (let d0 = from, i = 0; d0 < to; d0 = addDays(d0, 1), i++) {
      const d1 = addDays(d0, 1);
      const items = state.cur.filter((x) => ts(x.consumed_at) >= d0.getTime() && ts(x.consumed_at) < d1.getTime());
      const t = store.totals(items);
      state.days.push({ i, date: d0, dow: DOW[(d0.getDay() + 6) % 7], items, ...t, isToday: ui.isSameDay(d0), isFuture: d0.getTime() > Date.now(), over: t.caffeine > state.limit });
    }
  }
  /** 기간 중 오늘까지 지난 일수(현재 기간) 또는 전체 일수(지난 기간) — 하루 평균의 분모 */
  function elapsedDays() { return state.offset < 0 ? state.days.length : state.days.filter((d) => !d.isFuture).length; }

  // ---------- 렌더 ----------
  function render() { renderHead(); renderSummary(); renderChart(); renderTable(); renderShares(); renderTop(); }

  function renderHead() {
    const from = periodStart(state.offset), last = addDays(periodNext(from), -1), name = periodName(state.offset);
    document.querySelectorAll("#periodSegment button").forEach((b) => b.classList.toggle("is-active", b.dataset.period === state.period));
    $("weekTitle").textContent = `${name} 카페인`;
    $("weekRange").textContent = isWeek() ? `${fmtMD(from)}(월) ~ ${fmtMD(last)}(일)` : `${from.getFullYear()}년 ${from.getMonth() + 1}월 · ${fmtMD(from)}(${DOW[(from.getDay() + 6) % 7]}) ~ ${fmtMD(last)}(${DOW[(last.getDay() + 6) % 7]})`;
    $("thisWeek").textContent = name;
    $("nextWeek").disabled = state.offset >= 0;
    $("sumLabel").textContent = `${name} 합계`;
    $("topTitle").textContent = `${name} TOP 5`;
    $("chartKicker").textContent = isWeek() ? "요일별" : "일별";
    $("prevWeek").setAttribute("aria-label", isWeek() ? "이전 주" : "이전 달");
    $("nextWeek").setAttribute("aria-label", isWeek() ? "다음 주" : "다음 달");
    try { const u = new URL(location.href); u.searchParams.set("period", state.period); history.replaceState(null, "", u); } catch (e) {}
  }

  function renderSummary() {
    const t = store.totals(state.cur), p = store.totals(state.prev), prevName = isWeek() ? "지난주" : "지난달";
    const avg = t.caffeine / Math.max(1, elapsedDays()), pct = Math.round((avg / state.limit) * 100);
    $("sumCount").textContent = t.count;
    $("sumCaffeine").textContent = ui.fmtInt(t.caffeine);
    $("sumAvg").textContent = `하루 평균 ${ui.fmtInt(avg)} mg · 목표 대비 ${pct}%`;
    const bar = $("sumBar"); bar.className = "bar" + (pct >= 100 ? " bar--danger" : pct >= 75 ? " bar--warning" : ""); bar.firstElementChild.style.width = Math.min(100, pct) + "%";
    $("sumDelta").textContent = p.count === 0 ? (t.count ? `${prevName}에는 기록이 없어 비교할 수 없습니다.` : `이 기간과 ${prevName} 모두 기록이 없습니다.`)
      : t.caffeine === p.caffeine ? `${prevName}(${ui.fmtInt(p.caffeine)} mg)과 같습니다.`
      : `${prevName} ${ui.fmtInt(p.caffeine)} mg보다 ${ui.fmtInt(Math.abs(t.caffeine - p.caffeine))} mg ${t.caffeine > p.caffeine ? "많습니다" : "적습니다"} (${t.caffeine > p.caffeine ? "+" : "−"}${Math.round(Math.abs(t.caffeine - p.caffeine) / p.caffeine * 100)}%).`;
    $("sumSpend").textContent = ui.fmtInt(t.spend);
    $("sumSpendSub").textContent = `${t.paidCount}회 결제 · 내가 입력한 금액만` + (p.spend ? ` · ${prevName} ${ui.fmtInt(p.spend)}원` : "");
    const peak = state.days.reduce((m, d) => (d.caffeine > (m ? m.caffeine : 0) ? d : m), null);
    $("peakDay").textContent = peak ? (isWeek() ? `${peak.dow}요일` : `${peak.date.getDate()}일`) : "—";
    $("peakSub").textContent = peak ? `${fmtMD(peak.date)}(${peak.dow}) · 카페인 ${ui.fmtInt(peak.caffeine)} mg · ${peak.count}회` : "기록이 없습니다";
    const over = state.days.filter((d) => d.over);
    $("overDays").textContent = over.length;
    $("overSub").textContent = over.length
      ? `${isWeek() ? over.map((d) => d.dow).join("·") + "요일" : over.slice(0, 4).map((d) => d.date.getDate() + "일").join("·") + (over.length > 4 ? " 외" : "")} · 하루 목표 ${ui.fmtInt(state.limit)} mg 기준`
      : `하루 목표 ${ui.fmtInt(state.limit)} mg 기준`;
  }

  /** 눈금 상한 — 1·2·5 단위의 깔끔한 수 */
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v))), r = v / p;
    return ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((c) => r <= c) || 10) * p;
  }

  function renderChart() {
    const M = METRICS[state.metric], n = state.days.length;
    $("chartTitle").textContent = `${isWeek() ? "요일별" : "일별"} ${M.name}`;
    document.querySelectorAll("#metricSegment button").forEach((b) => b.classList.toggle("is-active", b.dataset.metric === state.metric));
    const vals = state.days.map(M.get);
    const rawMax = Math.max(...vals, M.goal ? state.limit : 0);
    const top = niceMax(rawMax * 1.08);
    // 컨테이너 너비에 맞춰 그린다 — 640px 고정 viewBox 를 폰 너비로 축소하면 글자가 읽히지 않는다
    const W = Math.max(300, Math.min(640, $("chart").clientWidth || 640)), H = 250, padL = W < 420 ? 40 : 48, padR = W < 420 ? 12 : 16, padT = 22, padB = 34;
    const plotW = W - padL - padR, plotH = H - padT - padB, band = plotW / n, bw = Math.min(24, Math.max(4, Math.round(band * 0.62)));
    const y = (v) => padT + plotH - (v / top) * plotH;
    const ticks = 4; let g = "";
    for (let k = 0; k <= ticks; k++) {
      const v = (top / ticks) * k, yy = y(v);
      g += `<line x1="${padL}" x2="${W - padR}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="${k === 0 ? "#CBD1DA" : "#E4E7EC"}" stroke-width="1"/>`;
      g += `<text x="${padL - 8}" y="${(yy + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#6B7380">${ui.fmtInt(v)}</text>`;
    }
    const maxV = Math.max(...vals);
    // x 축 라벨: 주간은 요일 전부, 월간은 1·5·10·…일과 오늘
    const showLabel = (d) => isWeek() || d.isToday || d.date.getDate() === 1 || d.date.getDate() % 5 === 0;
    const labelText = (d) => isWeek() ? d.dow + (d.isToday ? "·오늘" : "") : (d.isToday ? `${d.date.getDate()}·오늘` : String(d.date.getDate()));
    let bars = "", labels = "";
    state.days.forEach((d, i) => {
      const v = vals[i], cx = padL + band * i + band / 2;
      // 월간에서 오늘 바로 옆 눈금(예: 25일)과 겹치면 눈금 쪽을 뺀다
      const neighborToday = !isWeek() && !d.isToday && state.days.some((o) => o.isToday && Math.abs(o.i - i) === 1);
      if (showLabel(d) && !neighborToday) labels += `<text x="${cx.toFixed(1)}" y="${H - 12}" text-anchor="middle" font-size="12" font-weight="${d.isToday ? 700 : 500}" fill="${d.isToday ? "#14181F" : "#6B7380"}">${labelText(d)}</text>`;
      if (v > 0) {
        const h = Math.max(2, (v / top) * plotH), x0 = cx - bw / 2, y0 = y(v), r = Math.min(4, bw / 2, h), base = padT + plotH;
        const over = state.metric === "caffeine" && d.over;
        // 위쪽만 둥글게, 아래는 기준선에 붙인다
        const path = `M${x0.toFixed(1)} ${base.toFixed(1)} V${(y0 + r).toFixed(1)} Q${x0.toFixed(1)} ${y0.toFixed(1)} ${(x0 + r).toFixed(1)} ${y0.toFixed(1)} H${(x0 + bw - r).toFixed(1)} Q${(x0 + bw).toFixed(1)} ${y0.toFixed(1)} ${(x0 + bw).toFixed(1)} ${(y0 + r).toFixed(1)} V${base.toFixed(1)} Z`;
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
    $("chart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${ui.esc($("chartTitle").textContent)} 막대 차트">${g}${bars}${goal}${labels}</svg>`;
    $("chart").appendChild(tip); tip.classList.add("hidden");
    $("chartLegend").innerHTML = state.metric === "caffeine"
      ? `<span><i style="background:#1F6F5B"></i>목표 이내</span><span><i style="background:#B3261E"></i>목표 초과</span><span><i class="chart__legend-line"></i>하루 목표</span>`
      : `<span><i style="background:#1F6F5B"></i>${M.name} (${M.unit})</span>`;
    $("chartMeta").textContent = vals.some((v) => v > 0)
      ? (isWeek() ? "월요일부터 일요일까지 · 막대에 마우스를 올리면 자세히 보입니다" : `1일부터 ${n}일까지 · 막대에 마우스를 올리면 자세히 보입니다`)
      : (isWeek() ? "이 주에는 기록이 없습니다" : "이 달에는 기록이 없습니다");
  }

  function showTip(i, evt) {
    const d = state.days[i], tip = $("chartTip");
    tip.innerHTML = `<strong>${fmtMD(d.date)} (${d.dow})</strong>${d.count ? `카페인 ${ui.fmtInt(d.caffeine)} mg · ${d.count}회<br>지출 ${ui.fmtInt(d.spend)}원${d.over ? " · <em>목표 초과</em>" : ""}` : (d.isFuture ? "아직 오지 않은 날" : "기록 없음")}`;
    tip.classList.remove("hidden");
    const box = $("chart").getBoundingClientRect();
    const x = evt.clientX - box.left, yPos = evt.clientY - box.top;
    tip.style.left = Math.min(x + 12, box.width - tip.offsetWidth - 4) + "px";
    tip.style.top = Math.max(0, yPos - tip.offsetHeight - 12) + "px";
  }

  /** 주간: 요일별 7행 · 월간: 주차별(월~일, 달 경계로 자름) */
  function renderTable() {
    if (isWeek()) {
      $("tableHead").innerHTML = `<tr><th>요일</th><th class="num">횟수</th><th class="num">카페인</th><th class="num col-sugar">당류</th><th class="num">지출</th><th>상태</th></tr>`;
      $("dayRows").innerHTML = state.days.map((d) => `<tr class="${d.isToday ? "is-today" : ""}${d.isFuture ? " is-muted" : ""}">
        <td><b>${d.dow}</b> <small>${fmtShort(d.date)}</small>${d.isToday ? ' <span class="pill">오늘</span>' : ""}</td>
        <td class="num">${d.count || "—"}</td>
        <td class="num">${d.count ? ui.fmtInt(d.caffeine) + " mg" : "—"}</td>
        <td class="num col-sugar">${d.count ? ui.fmtNum(d.sugar, 0) + " g" : "—"}</td>
        <td class="num">${d.paidCount ? ui.fmtInt(d.spend) + "원" : "—"}</td>
        <td>${d.over ? '<span class="pill pill--danger">목표 초과</span>' : d.count ? '<span class="pill pill--ok">목표 이내</span>' : ""}</td>
      </tr>`).join("");
      return;
    }
    const weeks = []; let cur = null;
    state.days.forEach((d) => {
      if (!cur || d.dow === "월") { cur = { n: weeks.length + 1, days: [] }; weeks.push(cur); }
      cur.days.push(d);
    });
    $("tableHead").innerHTML = `<tr><th>주차</th><th class="num">횟수</th><th class="num">카페인</th><th class="num col-sugar">하루 평균</th><th class="num">지출</th><th>초과일</th></tr>`;
    $("dayRows").innerHTML = weeks.map((w) => {
      const t = store.totals(w.days.flatMap((d) => d.items));
      const over = w.days.filter((d) => d.over).length, hasToday = w.days.some((d) => d.isToday), future = w.days.every((d) => d.isFuture);
      const elapsed = w.days.filter((d) => !d.isFuture).length;
      return `<tr class="${hasToday ? "is-today" : ""}${future ? " is-muted" : ""}">
        <td><b>${w.n}주차</b> <small>${fmtShort(w.days[0].date)}–${fmtShort(w.days[w.days.length - 1].date)}</small>${hasToday ? ' <span class="pill">이번 주</span>' : ""}</td>
        <td class="num">${t.count || "—"}</td>
        <td class="num">${t.count ? ui.fmtInt(t.caffeine) + " mg" : "—"}</td>
        <td class="num col-sugar">${t.count && elapsed ? ui.fmtInt(t.caffeine / elapsed) + " mg" : "—"}</td>
        <td class="num">${t.paidCount ? ui.fmtInt(t.spend) + "원" : "—"}</td>
        <td>${over ? `<span class="pill pill--danger">${over}일 초과</span>` : t.count ? '<span class="pill pill--ok">없음</span>' : ""}</td>
      </tr>`;
    }).join("");
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
    const total = store.totals(state.cur).caffeine;
    // 분류별 — 카페인 많은 순
    const byCat = {};
    state.cur.forEach((x) => { const k = CM.CATEGORIES[x.category] ? x.category : "other"; const q = Number(x.quantity) || 1; byCat[k] = byCat[k] || { key: k, label: ui.catInfo(k).label, value: 0, count: 0 }; byCat[k].value += (Number(x.caffeine_mg) || 0) * q; byCat[k].count += 1; });
    const cats = Object.values(byCat).sort((a, b) => b.value - a.value);
    $("catList").innerHTML = shareRows(cats, total, (r) => ui.catInfo(r.key).color);
    // 시간대별 — 고정 순서, 단일 색
    const buckets = BUCKETS.map((b) => ({ ...b, value: 0, count: 0 }));
    state.cur.forEach((x) => {
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
    state.cur.forEach((x) => {
      const k = `${x.brand || ""}|${x.product_name}`, q = Number(x.quantity) || 1;
      by[k] = by[k] || { brand: x.brand, product_name: x.product_name, category: x.category, count: 0, caffeine: 0, spend: 0, paid: 0 };
      by[k].count += 1; by[k].caffeine += (Number(x.caffeine_mg) || 0) * q;
      if (x.price_paid != null) { by[k].spend += Number(x.price_paid) * q; by[k].paid += 1; }
    });
    const rows = Object.values(by).sort((a, b) => b.count - a.count || b.caffeine - a.caffeine).slice(0, 5);
    $("topEmpty").classList.toggle("hidden", rows.length > 0);
    $("topTable").classList.toggle("hidden", rows.length === 0);
    $("topEmptyTitle").textContent = isWeek() ? "이 주에는 기록이 없습니다" : "이 달에는 기록이 없습니다";
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
    $("periodSegment").addEventListener("click", (e) => { const b = e.target.closest("[data-period]"); if (!b || b.dataset.period === state.period) return; state.period = b.dataset.period; go(0); });
    $("metricSegment").addEventListener("click", (e) => { const b = e.target.closest("[data-metric]"); if (!b) return; state.metric = b.dataset.metric; renderChart(); });
    const chart = $("chart");
    chart.addEventListener("mousemove", (e) => { const r = e.target.closest(".chart__hit"); if (r) showTip(Number(r.dataset.day), e); else $("chartTip").classList.add("hidden"); });
    chart.addEventListener("mouseleave", () => $("chartTip").classList.add("hidden"));
    chart.addEventListener("click", (e) => { const r = e.target.closest(".chart__hit"); if (r) showTip(Number(r.dataset.day), e); }); // 터치
    let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (state.days.length) renderChart(); }, 120); });
    document.addEventListener("cm:profile", async () => { state.user = CM.auth.getUser(); await load(); render(); });
    window.addEventListener("storage", async (e) => {
      if (e.key === "cm:intakes") { await load(); render(); return; }
      if (e.key === "cm:session" || e.key === "cm:users") { const u = await CM.auth.refresh(); if (!u) { location.replace("login.html"); return; } state.user = u; ui.renderTopbarUser($("topbarUser")); await load(); render(); }
    });
  }
})();
