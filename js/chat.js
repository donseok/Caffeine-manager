// ============================================================================
// 챗봇 "카피" — 화면 오른쪽 패널. Google Gemini API(사용자 본인의 키) 로 답한다.
//   - API 키는 이 브라우저(localStorage) 에만 저장한다. 저장소·서버로 보내지 않는다.
//   - 모델: 키를 저장하면 models 목록을 조회해 3.8 Flash-Lite → 3.5 Flash-Lite → 3.8 Flash 순으로 자동 선택. 설정에서 바꿀 수 있다.
//   - 답할 때 오늘 섭취 요약·잔존 카페인·최근 7일·질문에 맞는 카탈로그 상품을 시스템 프롬프트로 넘긴다.
// ============================================================================
(function () {
  const CM = window.CM, ui = CM && CM.ui, store = CM && CM.store, CFG = window.APP_CONFIG || {};
  if (!CM || !ui || !store) return;
  if (ui.popupPage && ui.popupPage.inFrame()) return; // 팝업(iframe) 안에서는 띄우지 않는다

  const NAME = CFG.CHAT_NAME || "카피";
  const API = "https://generativelanguage.googleapis.com/v1beta";
  const PREFERRED = [CFG.GEMINI_MODEL || "gemini-3.8-flash-lite"].concat(CFG.GEMINI_FALLBACK_MODELS || ["gemini-3.5-flash-lite", "gemini-3.8-flash"]);
  const LS_KEY = "cm:gemini:key", LS_MODEL = "cm:gemini:model", LS_OPEN = "cm:chat:open";
  const $ = (sel, root) => (root || document).querySelector(sel);

  const MASCOT = `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <path d="M25 7c-3 4 3 6 0 10" stroke="#9FE1C6" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M37 5c-3 4 3 6 0 10" stroke="#9FE1C6" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M47 31h3a7 7 0 0 1 0 14h-3" fill="none" stroke="#1F6F5B" stroke-width="5" stroke-linecap="round"/>
    <path d="M14 24h36v17a15 15 0 0 1-15 15h-6a15 15 0 0 1-15-15z" fill="#1F6F5B"/>
    <rect x="12" y="20" width="40" height="8" rx="4" fill="#27806A"/>
    <circle cx="25.5" cy="39" r="3" fill="#fff"/><circle cx="38.5" cy="39" r="3" fill="#fff"/>
    <circle cx="26.3" cy="39.5" r="1.5" fill="#14181F"/><circle cx="39.3" cy="39.5" r="1.5" fill="#14181F"/>
    <path d="M28 46q4 3.5 8 0" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <circle cx="20.5" cy="44" r="2.2" fill="#FFB3A7" opacity=".95"/><circle cx="43.5" cy="44" r="2.2" fill="#FFB3A7" opacity=".95"/>
    <ellipse cx="32" cy="58" rx="16" ry="3" fill="#CBD1DA"/>
  </svg>`;
  const SUGGESTIONS = ["오늘 카페인 얼마나 마셨어?", "지금 아메리카노 한 잔 더 마셔도 될까?", "카페인 적은 음료 추천해 줘", "잠 잘 자려면 몇 시까지 마셔야 해?"];

  const state = { open: false, busy: false, view: "chat", messages: [], key: "", model: "", models: [], user: null };

  function lsGet(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function histKey() { return "cm:chat:" + (state.user ? state.user.id : "anon"); }
  function esc(s) { return ui.esc(s); }
  /** 아주 단순한 마크다운: **굵게**, 줄바꿈, "- " 목록 */
  function md(s) {
    const lines = esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").split("\n");
    let out = "", inList = false;
    for (const ln of lines) {
      const m = ln.match(/^\s*[-•]\s+(.*)$/);
      if (m) { if (!inList) { out += "<ul>"; inList = true; } out += `<li>${m[1]}</li>`; continue; }
      if (inList) { out += "</ul>"; inList = false; }
      if (ln.trim()) out += `<p>${ln}</p>`;
    }
    if (inList) out += "</ul>";
    return out || "<p></p>";
  }

  // ---------- DOM ----------
  function build() {
    const launcher = document.createElement("button");
    launcher.type = "button"; launcher.className = "chat-launcher"; launcher.id = "chatLauncher"; launcher.setAttribute("aria-label", `${NAME}에게 물어보기`);
    launcher.innerHTML = `<span class="chat-launcher__mascot">${MASCOT}</span><span class="chat-launcher__label">${esc(NAME)}에게 물어보기</span>`;
    const panel = document.createElement("aside");
    panel.className = "chat hidden"; panel.id = "chatPanel"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", `${NAME} 챗봇`);
    panel.innerHTML = `
      <header class="chat__head">
        <span class="chat__avatar">${MASCOT}</span>
        <div class="chat__title"><strong>${esc(NAME)}</strong><small id="chatSub">카페인 매니저 도우미</small></div>
        <button type="button" class="chat__icon" id="chatSettingsBtn" aria-label="챗봇 설정" title="설정">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1-1.4 1.4-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V20h-2v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L9 17.4l.1-.1A1.7 1.7 0 0 0 9.4 15a1.7 1.7 0 0 0-1.5-1H7.8v-2h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L9 9l1.4-1.4.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V6.3h2v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 9l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1v2H21a1.7 1.7 0 0 0-1.6 1Z"></path></svg>
        </button>
        <button type="button" class="chat__icon" id="chatCloseBtn" aria-label="닫기" title="닫기">×</button>
      </header>
      <div class="chat__body" id="chatBody">
        <div class="chat__messages" id="chatMessages" aria-live="polite"></div>
        <div class="chat__suggest" id="chatSuggest"></div>
      </div>
      <form class="chat__form" id="chatForm">
        <textarea id="chatInput" rows="1" placeholder="${esc(NAME)}에게 물어보세요" aria-label="메시지 입력"></textarea>
        <button type="submit" class="chat__send" id="chatSend" aria-label="보내기"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"></path><path d="M22 2 15 22l-4-9-9-4z"></path></svg></button>
      </form>
      <section class="chat__settings hidden" id="chatSettings">
        <h3>챗봇 설정</h3>
        <label class="chat__field"><span>Gemini API 키</span><input type="password" id="chatKey" autocomplete="off" placeholder="AIza…"><small>이 브라우저에만 저장됩니다. 저장소나 서버로 보내지 않습니다. <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">키 발급 →</a></small></label>
        <label class="chat__field"><span>모델</span><select id="chatModel"></select><small id="chatModelHint">키를 저장하면 사용 가능한 모델을 불러와 3.8 Flash-Lite 를 우선 선택합니다.</small></label>
        <div class="chat__settings-actions">
          <button type="button" class="btn-ghost" id="chatClearBtn">대화 지우기</button>
          <button type="button" class="btn-ghost" id="chatSettingsCancel">닫기</button>
          <button type="button" class="btn-green" id="chatSaveBtn">저장</button>
        </div>
        <p class="chat__err hidden" id="chatSettingsErr"></p>
      </section>`;
    document.body.appendChild(launcher); document.body.appendChild(panel);
    launcher.addEventListener("click", () => toggle(true));
    $("#chatCloseBtn").addEventListener("click", () => toggle(false));
    $("#chatSettingsBtn").addEventListener("click", () => showSettings(true));
    $("#chatSettingsCancel").addEventListener("click", () => showSettings(false));
    $("#chatSaveBtn").addEventListener("click", saveSettings);
    $("#chatClearBtn").addEventListener("click", () => { if (!confirm("대화 내용을 지울까요?")) return; state.messages = []; lsSet(histKey(), []); renderMessages(); showSettings(false); });
    $("#chatForm").addEventListener("submit", (e) => { e.preventDefault(); send($("#chatInput").value); });
    $("#chatInput").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send($("#chatInput").value); } });
    $("#chatInput").addEventListener("input", autosize);
    $("#chatSuggest").addEventListener("click", (e) => { const b = e.target.closest("[data-q]"); if (b) send(b.dataset.q); });
    $("#chatKey").addEventListener("change", () => loadModels($("#chatKey").value.trim()));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.open && !document.querySelector(".popup-host")) toggle(false); });
  }
  function autosize() { const t = $("#chatInput"); t.style.height = "auto"; t.style.height = Math.min(120, t.scrollHeight) + "px"; }
  function toggle(open) {
    state.open = open; $("#chatPanel").classList.toggle("hidden", !open); $("#chatLauncher").classList.toggle("is-hidden", open);
    document.body.classList.toggle("chat-open", open); lsSet(LS_OPEN, open);
    if (open) { if (!state.key) showSettings(true, "먼저 Gemini API 키를 넣어 주세요."); else { showSettings(false); setTimeout(() => $("#chatInput").focus(), 50); } }
  }
  function showSettings(on, hint) {
    state.view = on ? "settings" : "chat";
    $("#chatSettings").classList.toggle("hidden", !on); $("#chatBody").classList.toggle("hidden", on); $("#chatForm").classList.toggle("hidden", on);
    const err = $("#chatSettingsErr"); err.classList.toggle("hidden", !hint); err.textContent = hint || "";
    if (on) { $("#chatKey").value = state.key; renderModelSelect(); if (state.key && !state.models.length) loadModels(state.key); }
  }
  function renderModelSelect() {
    const sel = $("#chatModel"); const opts = state.models.length ? state.models : PREFERRED.map((id) => ({ id, label: id + (state.models.length ? "" : " (미확인)") }));
    sel.innerHTML = opts.map((m) => `<option value="${esc(m.id)}"${m.id === state.model ? " selected" : ""}>${esc(m.label || m.id)}</option>`).join("");
    if (!sel.value && opts[0]) sel.value = opts[0].id;
  }
  function renderMessages() {
    const box = $("#chatMessages");
    const greet = `<div class="chat__msg chat__msg--model"><div class="chat__bubble">${md(`안녕하세요, ${state.user ? state.user.displayName + "님! " : ""}저는 카페인 매니저의 ${NAME}예요 ☕\n오늘 얼마나 마셨는지, 지금 한 잔 더 괜찮은지, 어떤 음료가 카페인이 적은지 물어보세요.`)}</div></div>`;
    box.innerHTML = greet + state.messages.map((m) => `<div class="chat__msg chat__msg--${m.role}"><div class="chat__bubble">${m.role === "model" ? md(m.text) : `<p>${esc(m.text)}</p>`}</div>${m.meta ? `<small class="chat__meta">${esc(m.meta)}</small>` : ""}</div>`).join("");
    $("#chatSuggest").innerHTML = state.messages.length ? "" : SUGGESTIONS.map((q) => `<button type="button" class="chat__chip" data-q="${esc(q)}">${esc(q)}</button>`).join("");
    box.scrollTop = box.scrollHeight;
  }

  // ---------- 설정 · 모델 ----------
  async function loadModels(key) {
    if (!key) return;
    const hint = $("#chatModelHint"); hint.textContent = "모델 목록을 불러오는 중…";
    try {
      const r = await fetch(`${API}/models?pageSize=200&key=${encodeURIComponent(key)}`);
      if (!r.ok) throw new Error(await errText(r));
      const j = await r.json();
      const list = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent") && !/tts|live|transcribe|translate|image|embedding|audio|native-audio/i.test(m.name)).map((m) => ({ id: m.name.replace(/^models\//, ""), label: (m.displayName || m.name.replace(/^models\//, "")) + "  ·  " + m.name.replace(/^models\//, "") }));
      state.models = list;
      const pick = pickModel(list.map((m) => m.id));
      if (pick) state.model = pick;
      renderModelSelect();
      hint.textContent = pick ? `${list.length}개 모델 중 '${pick}' 를 선택했습니다. 바꿀 수 있어요.` : "사용 가능한 모델을 찾지 못했습니다.";
    } catch (e) { hint.textContent = "모델 목록을 불러오지 못했습니다: " + e.message; }
  }
  /** 선호 순서: 설정값 → flash-lite 중 가장 높은 버전 → flash 중 가장 높은 버전 */
  function pickModel(ids) {
    for (const p of PREFERRED) if (ids.includes(p)) return p;
    const ver = (id) => parseFloat((id.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || "0");
    const lite = ids.filter((id) => /flash-lite/.test(id) && !/preview|exp|-\d{3,}/.test(id)).sort((a, b) => ver(b) - ver(a));
    if (lite[0]) return lite[0];
    const flash = ids.filter((id) => /flash/.test(id) && !/preview|exp|-\d{3,}/.test(id)).sort((a, b) => ver(b) - ver(a));
    return flash[0] || ids[0] || null;
  }
  async function saveSettings() {
    const key = $("#chatKey").value.trim(), model = $("#chatModel").value;
    if (!key) { showSettings(true, "API 키를 입력해 주세요."); return; }
    state.key = key; state.model = model || state.model || PREFERRED[0];
    lsSet(LS_KEY, key); lsSet(LS_MODEL, state.model);
    $("#chatSub").textContent = state.model;
    showSettings(false); setTimeout(() => $("#chatInput").focus(), 50);
  }
  async function errText(r) {
    try { const j = await r.json(); return (j.error && j.error.message) || `HTTP ${r.status}`; } catch (e) { return `HTTP ${r.status}`; }
  }

  // ---------- 컨텍스트 ----------
  function norm(s) { return String(s || "").toLowerCase().replace(/\s+/g, ""); }
  function matchProducts(products, q) {
    const tokens = q.split(/[\s,.?!·]+/).map(norm).filter((t) => t.length >= 2);
    if (!tokens.length) return [];
    return products.map((p) => {
      const hay = [p.name, p.brand].map(norm).concat((p.tags || []).map(norm));
      let s = 0; tokens.forEach((t) => { if (norm(p.name).includes(t)) s += 3; else if (norm(p.brand).includes(t)) s += 2; else if (hay.some((h) => h.includes(t))) s += 1; });
      return { p, s };
    }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.p.caffeine_mg - b.p.caffeine_mg).slice(0, 6).map((x) => x.p);
  }
  async function buildContext(question) {
    const u = state.user, limit = (u && u.dailyLimit) || CFG.DAILY_LIMIT_MG || 400;
    let intakes = [], products = [];
    try { intakes = await store.listIntakes({ from: store.dayRange(6).from }); } catch (e) {}
    try { products = (await store.listProducts()).filter((p) => p.status === "approved"); } catch (e) {}
    const today = intakes.filter((x) => Date.parse(x.consumed_at) >= Date.parse(store.dayRange(0).from));
    const t = store.totals(today), w = store.totals(intakes);
    const residual = store.residual(intakes), midnight = store.residual(intakes, store.dayRange(-1).from);
    const now = new Date();
    const lines = [];
    lines.push(`현재 시각: ${ui.fmtDateKo(now)} ${ui.fmtTime(now.toISOString())}`);
    lines.push(`사용자: ${u ? u.displayName : "손님"} · 하루 카페인 목표 ${limit} mg`);
    lines.push(`오늘 섭취: ${t.count}회 · 카페인 ${Math.round(t.caffeine)} mg (목표의 ${Math.round(t.caffeine / limit * 100)}%, 남은 여유 ${Math.max(0, Math.round(limit - t.caffeine))} mg) · 당류 ${Math.round(t.sugar)} g · ${Math.round(t.kcal)} kcal · 지출 ${Math.round(t.spend)}원`);
    if (today.length) lines.push("오늘 기록: " + today.slice().sort((a, b) => Date.parse(a.consumed_at) - Date.parse(b.consumed_at)).map((x) => `${ui.fmtTime(x.consumed_at)} ${x.product_name}${Number(x.quantity) !== 1 ? ` ×${x.quantity}` : ""} (${Math.round((Number(x.caffeine_mg) || 0) * (Number(x.quantity) || 1))} mg)`).join(", "));
    lines.push(`체내 잔존 카페인 추정: 지금 약 ${Math.round(residual)} mg · 오늘 자정 약 ${Math.round(midnight)} mg (반감기 ${CFG.HALF_LIFE_HOURS || 5}시간 가정)`);
    lines.push(`최근 7일: ${w.count}회 · 카페인 합계 ${Math.round(w.caffeine)} mg · 하루 평균 ${Math.round(w.caffeine / 7)} mg · 지출 ${Math.round(w.spend)}원`);
    const matched = matchProducts(products, question);
    if (matched.length) lines.push("질문과 관련된 카탈로그 상품(1회 제공량 기준): " + matched.map((p) => `${p.brand} ${p.name} · ${p.serving_label} · 카페인 ${p.caffeine_mg} mg${p.sugar_g != null ? ` · 당류 ${p.sugar_g} g` : ""}${p.kcal != null ? ` · ${p.kcal} kcal` : ""}`).join(" / "));
    lines.push(`카탈로그 규모: ${products.length}종 (스타벅스·국내 카페 체인·편의점 음료·에너지음료)`);
    return lines.join("\n");
  }
  function systemPrompt(ctx) {
    return `당신은 '카페인 매니저' 앱의 마스코트 챗봇 '${NAME}'입니다. 귀여운 커피컵 캐릭터이고, 밝고 친절하지만 말은 간결하게 합니다. 한국어로 답합니다. 이모지는 한 답변에 최대 1개.
역할: 사용자의 카페인 섭취를 도와주는 친구. 아래 [앱 데이터]에 있는 숫자만 근거로 말하고, 데이터에 없는 수치는 지어내지 않습니다(모르면 모른다고 하고 앱에서 검색해 보라고 안내). 하루 목표는 사용자 설정값을 기준으로 하되, 성인 하루 400 mg·임산부 300 mg 이하라는 식약처 권고를 참고로 언급할 수 있습니다.
"지금 더 마셔도 되는지" 류의 질문에는: 남은 여유(mg), 잔존 카페인, 현재 시각(저녁이면 수면 영향)을 근거로 판단을 말해 주고, 카탈로그 상품이 있으면 구체적인 mg 로 비교해 줍니다.
답변은 3~6문장 또는 짧은 목록. 마크다운은 **굵게** 와 "- " 목록만 사용. 의료 진단·처방은 하지 않으며, 증상이 걱정되면 전문가 상담을 권합니다.
[앱 데이터]
${ctx}`;
  }

  // ---------- 전송 ----------
  async function send(text) {
    text = String(text || "").trim();
    if (!text || state.busy) return;
    if (!state.key) { showSettings(true, "먼저 Gemini API 키를 넣어 주세요."); return; }
    state.messages.push({ role: "user", text }); persist(); renderMessages();
    $("#chatInput").value = ""; autosize();
    state.busy = true; $("#chatSend").disabled = true;
    const box = $("#chatMessages");
    const el = document.createElement("div"); el.className = "chat__msg chat__msg--model is-typing"; el.innerHTML = `<div class="chat__bubble"><span class="chat__dots"><i></i><i></i><i></i></span></div>`; box.appendChild(el); box.scrollTop = box.scrollHeight;
    let answer = "", usedModel = state.model || PREFERRED[0];
    try {
      const ctx = await buildContext(text);
      const contents = state.messages.slice(-12).map((m) => ({ role: m.role === "model" ? "model" : "user", parts: [{ text: m.text }] }));
      const body = { systemInstruction: { parts: [{ text: systemPrompt(ctx) }] }, contents, generationConfig: { temperature: 0.6, maxOutputTokens: 700 } };
      const candidates = [usedModel].concat(PREFERRED.filter((m) => m !== usedModel));
      let lastErr = null;
      for (const model of candidates) {
        try {
          answer = await stream(model, body, (partial) => { el.classList.remove("is-typing"); el.querySelector(".chat__bubble").innerHTML = md(partial); box.scrollTop = box.scrollHeight; });
          usedModel = model; lastErr = null; break;
        } catch (e) {
          lastErr = e;
          if (!/not found|not supported|does not exist|404/i.test(e.message)) break; // 모델 문제일 때만 다음 후보
        }
      }
      if (lastErr) throw lastErr;
      if (usedModel !== state.model) { state.model = usedModel; lsSet(LS_MODEL, usedModel); }
      el.remove();
      state.messages.push({ role: "model", text: answer || "(빈 응답)", meta: usedModel }); persist(); renderMessages();
    } catch (e) {
      el.remove();
      const msg = /API key not valid|API_KEY_INVALID|PERMISSION_DENIED|403/i.test(e.message) ? "API 키가 올바르지 않거나 권한이 없어요. 설정에서 키를 확인해 주세요."
        : /429|quota|RESOURCE_EXHAUSTED/i.test(e.message) ? "요청이 많아 잠시 쉬어야 해요. 조금 뒤에 다시 물어봐 주세요."
        : /Failed to fetch|NetworkError/i.test(e.message) ? "네트워크에 연결할 수 없어요. 인터넷 연결을 확인해 주세요."
        : "답을 가져오지 못했어요: " + e.message;
      state.messages.push({ role: "model", text: msg, meta: "오류" }); persist(); renderMessages();
      if (/API 키/.test(msg)) showSettings(true, msg);
    } finally { state.busy = false; $("#chatSend").disabled = false; $("#chatSub").textContent = state.model || "카페인 매니저 도우미"; }
  }
  /** streamGenerateContent(SSE) — 부분 텍스트를 onPartial 로 흘려 주고 전체 텍스트를 돌려준다 */
  async function stream(model, body, onPartial) {
    const r = await fetch(`${API}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(state.key)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await errText(r));
    const reader = r.body.getReader(), dec = new TextDecoder(); let buf = "", text = "";
    const take = (chunk) => {
      for (const line of chunk.split("\n")) {
        const s = line.trim(); if (!s.startsWith("data:")) continue;
        const payload = s.slice(5).trim(); if (!payload || payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload);
          const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
          parts.forEach((p) => { if (p.text) text += p.text; });
          const block = (j.promptFeedback && j.promptFeedback.blockReason) || (((j.candidates || [])[0] || {}).finishReason === "SAFETY" ? "SAFETY" : null);
          if (block && !text) text = "이 질문에는 답하기 어려워요. 다른 방식으로 물어봐 주세요.";
        } catch (e) { /* 조각난 JSON 은 다음 chunk 와 합쳐진다 */ }
      }
      if (text) onPartial(text);
    };
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const idx = buf.lastIndexOf("\n\n"); if (idx < 0) continue;
      take(buf.slice(0, idx)); buf = buf.slice(idx + 2);
    }
    if (buf.trim()) take(buf);
    return text.trim();
  }
  function persist() { lsSet(histKey(), state.messages.slice(-30)); }

  // ---------- 시작 ----------
  async function init() {
    state.key = lsGet(LS_KEY, "") || CFG.GEMINI_API_KEY || "";
    state.model = lsGet(LS_MODEL, "") || PREFERRED[0];
    try { await CM.auth.ready; } catch (e) {}
    state.user = CM.auth.getUser();
    if (!state.user) return; // 로그인 화면 등에서는 띄우지 않는다
    build();
    state.messages = lsGet(histKey(), []);
    renderMessages();
    $("#chatSub").textContent = state.key ? state.model : "카페인 매니저 도우미";
    CM.auth.onChange && CM.auth.onChange((u) => { state.user = u; if (u) { state.messages = lsGet(histKey(), []); renderMessages(); } });
    if (lsGet(LS_OPEN, false) && window.innerWidth >= 900) toggle(true);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  CM.chat = { send, toggle, get state() { return state; } };
})();
