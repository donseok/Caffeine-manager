// ============================================================================
// 공통 UI 유틸 — 포맷 · 토스트 · 팝업 호스트(iframe 모달) · 팝업 페이지 도우미 · 헤더
// ============================================================================
(function () {
  const CM = (window.CM = window.CM || {});
  const CFG = window.APP_CONFIG || {};

  const ui = {};

  // ---------- 포맷 ----------
  ui.esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  ui.fmtNum = (n, digits) => { const v = Number(n) || 0; return v.toLocaleString("ko-KR", { maximumFractionDigits: digits == null ? 1 : digits }); };
  ui.fmtInt = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
  ui.fmtWon = (n) => (n == null || n === "" ? "가격 미입력" : ui.fmtInt(n) + "원");
  ui.fmtMg = (n) => ui.fmtNum(n, 1) + " mg";
  ui.fmtG = (n) => (n == null ? "—" : ui.fmtNum(n, 1) + " g");
  ui.fmtKcal = (n) => (n == null ? "—" : ui.fmtInt(n) + " kcal");
  ui.pad2 = (n) => String(n).padStart(2, "0");
  ui.fmtTime = (iso) => { const d = new Date(iso); return ui.pad2(d.getHours()) + ":" + ui.pad2(d.getMinutes()); };
  ui.fmtDateShort = (iso) => { const d = new Date(iso); return ui.pad2(d.getMonth() + 1) + "-" + ui.pad2(d.getDate()); };
  ui.fmtDateKo = (d) => { d = d ? new Date(d) : new Date(); const days = ["일", "월", "화", "수", "목", "금", "토"]; return `${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`; };
  ui.fmtDateTimeKo = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${ui.fmtTime(iso)}`; };
  /** date 입력/저장용 "YYYY-MM-DD" (로컬 시간 기준) */
  ui.toLocalDate = (d) => { d = d ? new Date(d) : new Date(); return `${d.getFullYear()}-${ui.pad2(d.getMonth() + 1)}-${ui.pad2(d.getDate())}`; };
  /** datetime-local 입력용 "YYYY-MM-DDTHH:MM" (로컬 시간) */
  ui.toLocalInput = (d) => { d = d ? new Date(d) : new Date(); return `${d.getFullYear()}-${ui.pad2(d.getMonth() + 1)}-${ui.pad2(d.getDate())}T${ui.pad2(d.getHours())}:${ui.pad2(d.getMinutes())}`; };
  ui.isSameDay = (a, b) => { a = new Date(a); b = b ? new Date(b) : new Date(); return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); };
  ui.initial = (p) => { const s = String(p.brand || p.name || "?").trim(); const ch = s[0] || "?"; return /[A-Za-z]/.test(ch) ? ch.toUpperCase() : ch; };
  // 브랜드 배지 — assets/brands/ 의 직접 그린 오리지널 아이콘(실제 상표 로고 아님).
  // 상품에는 brand_key 가 있지만, 섭취 기록에는 brand(표시명)만 저장되므로 이름으로도 찾는다.
  const BRAND_BADGES = { starbucks: 1, redbull: 1, monster: 1, cocacola: 1, bacchus: 1, lotte: 1 };
  const BRAND_KEY_BY_NAME = { "스타벅스": "starbucks", "레드불": "redbull", "몬스터": "monster", "코카콜라": "cocacola", "동아제약": "bacchus", "박카스": "bacchus", "롯데칠성": "lotte" };
  ui.brandBadgeSrc = (p) => {
    if (!p) return null;
    const key = BRAND_BADGES[p.brand_key] ? p.brand_key : BRAND_KEY_BY_NAME[String(p.brand || "").trim()];
    return key ? "assets/brands/" + key + ".svg" : null;
  };
  ui.catInfo = (key) => CM.CATEGORIES[key] || CM.CATEGORIES.other;
  ui.qs = (k) => new URLSearchParams(location.search).get(k);

  // ---------- 토스트 ----------
  ui.toast = (msg, kind) => {
    let wrap = document.querySelector(".toast-wrap");
    if (!wrap) { wrap = document.createElement("div"); wrap.className = "toast-wrap"; document.body.appendChild(wrap); }
    const el = document.createElement("div"); el.className = "toast" + (kind ? " toast--" + kind : ""); el.textContent = msg; wrap.appendChild(el);
    setTimeout(() => { el.style.transition = "opacity .3s"; el.style.opacity = "0"; setTimeout(() => el.remove(), 320); }, 2600);
  };

  // ---------- 팝업 호스트 (부모 페이지) ----------
  // ui.openPopup('record.html?product=...', { onMessage(msg) }) → { close() }
  let currentPopup = null;
  // file:// 로 열면 origin 이 "null" 이라 고정할 수 없다. http(s) 로 서비스할 때만 고정한다.
  const POPUP_ORIGIN = (location.origin && location.origin !== "null") ? location.origin : "*";
  ui.openPopup = (url, opts) => {
    opts = opts || {};
    ui.closePopup();
    const host = document.createElement("div"); host.className = "popup-host"; host.setAttribute("role", "dialog"); host.setAttribute("aria-modal", "true");
    const frame = document.createElement("iframe"); frame.src = url; frame.title = opts.title || "팝업";
    if (opts.width) frame.style.width = opts.width + "px";
    if (opts.height) frame.style.height = opts.height + "px";
    host.appendChild(frame); document.body.appendChild(host); document.body.classList.add("popup-open");
    const onMsg = (e) => {
      // 같은 출처의 이 팝업 iframe 이 보낸 메시지만 받는다.
      if (POPUP_ORIGIN !== "*" && e.origin !== POPUP_ORIGIN) return;
      if (frame && e.source !== frame.contentWindow) return;
      const d = e.data; if (!d || d.__cm !== "popup") return;
      if (d.type === "resize" && frame) { const h = Math.max(200, Math.min(Number(d.height) || 0, window.innerHeight - 48)); frame.style.height = h + "px"; return; }
      if (d.type === "auth-required") {
        // 팝업 안에서 세션이 끊긴 경우: 좁은 iframe 에 로그인 화면을 그리지 않고 부모를 통째로 옮긴다.
        ui.closePopup();
        const here = (location.pathname.split("/").pop() || "index.html") + location.search;
        location.replace("login.html?next=" + encodeURIComponent(here) + (d.reason ? "&" + d.reason : ""));
        return;
      }
      if (d.type === "close") { ui.closePopup(); }
      if (opts.onMessage) opts.onMessage(d);
    };
    const onKey = (e) => { if (e.key === "Escape") ui.closePopup(); };
    const onBackdrop = (e) => { if (e.target === host && opts.closeOnBackdrop !== false) ui.closePopup(); };
    window.addEventListener("message", onMsg); document.addEventListener("keydown", onKey); host.addEventListener("mousedown", onBackdrop);
    currentPopup = { host, frame, close() { window.removeEventListener("message", onMsg); document.removeEventListener("keydown", onKey); host.remove(); document.body.classList.remove("popup-open"); currentPopup = null; } };
    return currentPopup;
  };
  ui.closePopup = () => { if (currentPopup) currentPopup.close(); };

  // ---------- 팝업 페이지 도우미 (record.html 등 iframe 안에서 실행) ----------
  ui.popupPage = {
    inFrame() { try { return window.parent && window.parent !== window; } catch (e) { return false; } },
    send(msg) { if (ui.popupPage.inFrame()) window.parent.postMessage({ __cm: "popup", ...msg }, POPUP_ORIGIN); },
    close(reason) {
      if (ui.popupPage.inFrame()) ui.popupPage.send({ type: "close", reason: reason || "cancel" });
      else if (window.opener) window.close();
      else location.href = "index.html";
    },
    /** 문서 높이를 부모에게 알려 iframe 크기를 맞춤 */
    autosize() {
      const report = () => ui.popupPage.send({ type: "resize", height: document.documentElement.scrollHeight });
      report();
      if (window.ResizeObserver) new ResizeObserver(report).observe(document.body);
      window.addEventListener("load", report);
    },
    bindClose() {
      document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => ui.popupPage.close("cancel")));
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") ui.popupPage.close("cancel"); });
    },
  };

  // ---------- 헤더 사용자 영역 ----------
  ui.renderTopbarUser = (container) => {
    const u = CM.auth.getUser(); if (!container) return;
    const cloud = CM.mode === "supabase";
    const parts = [];
    parts.push(`<span class="chip chip--storage${cloud ? "" : " chip--warn"}" title="${cloud ? "Supabase 에 저장됩니다" : "Supabase 설정 전 — 이 브라우저에만 저장됩니다"}"><span class="chip__dot"></span>${cloud ? "클라우드 저장" : "이 기기에 저장"}</span>`);
    if (u) {
      if (u.role === "admin") parts.push(`<a class="chip chip--admin" href="admin.html"><span class="chip__dot"></span>관리자</a>`);
      parts.push(`<a class="chip chip--user" href="#" data-open-settings title="설정"><span class="chip__dot"></span>${ui.esc(u.displayName)}</a>`);
    }
    parts.push(`<button type="button" class="icon-btn" aria-label="설정" data-open-settings><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"></path><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.42 1.42-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V20h-2v-.09a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-1.42-1.42.06-.06A1.7 1.7 0 0 0 9.42 15a1.7 1.7 0 0 0-1.56-1.03H7.8v-2h.09a1.7 1.7 0 0 0 1.56-1.03 1.7 1.7 0 0 0-.34-1.88L9.05 9l1.42-1.42.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.03-1.56V6.3h2v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06L19.83 9l-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.03h.09v2H21A1.7 1.7 0 0 0 19.4 15Z"></path></svg></button>`);
    container.innerHTML = parts.join("");
    container.querySelectorAll("[data-open-settings]").forEach((el) => el.addEventListener("click", (e) => {
      e.preventDefault();
      ui.openPopup("settings.html", { title: "설정", height: 520, onMessage: (m) => { if (m.type === "profile:updated") { CM.auth.refresh().then(() => { ui.renderTopbarUser(container); document.dispatchEvent(new CustomEvent("cm:profile", { detail: m })); }); } if (m.type === "signed-out") { location.replace("login.html"); } } });
    }));
  };

  CM.ui = ui;
})();
