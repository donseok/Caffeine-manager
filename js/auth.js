// ============================================================================
// 인증 어댑터 — 로컬 모드(localStorage) ↔ Supabase 모드
//   window.CM.auth : { mode, ready, getUser, signUp, signIn, signOut, updateProfile, requireUser, onChange }
// ============================================================================
(function () {
  const CM = (window.CM = window.CM || {});
  const CFG = window.APP_CONFIG || {};
  const ADMIN_EMAILS = (CFG.ADMIN_EMAILS || []).map((e) => String(e).toLowerCase());

  const wantSupabase = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  const useSupabase = wantSupabase && !!window.supabase;
  // 키는 설정돼 있는데 supabase-js(CDN) 를 못 받은 경우: 조용히 로컬 모드로 내려가면
  // 그날 기록이 localStorage 에 고아로 남는다. 아예 화면을 막고 다시 시도하게 한다.
  CM.sbUnavailable = wantSupabase && !window.supabase;
  CM.mode = useSupabase ? "supabase" : "local";
  CM.sb = useSupabase ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;

  const listeners = [];
  let currentUser = null;
  function emit() { listeners.forEach((fn) => { try { fn(currentUser); } catch (e) { console.error(e); } }); }

  // ---------- 공통 유틸 ----------
  CM.uuid = function () {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  };
  CM.lsGet = function (key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  };
  CM.STORAGE_ERROR = "이 브라우저에 저장할 수 없습니다. 시크릿(프라이빗) 모드이거나 저장 공간이 가득 찼는지 확인해 주세요.";
  CM.lsSet = function (key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { console.warn("localStorage 저장 실패", e); throw new Error(CM.STORAGE_ERROR); }
  };
  /** 리다이렉트 뒤 로그인 화면에서 한 번만 보여 줄 안내 (탭 단위, 실패해도 무시) */
  CM.setAuthNotice = function (msg) { try { sessionStorage.setItem("cm:notice", String(msg)); } catch (e) {} };
  CM.takeAuthNotice = function () { try { const v = sessionStorage.getItem("cm:notice"); sessionStorage.removeItem("cm:notice"); return v; } catch (e) { return null; } };
  function normalizeEmail(email) { return String(email || "").trim().toLowerCase(); }
  function clampLimit(v) {
    // 빈 문자열·null 은 "입력 안 함" 이므로 기본값. (Number("") === 0 이라 예전에는 50 으로 눌렸다)
    if (v === "" || v == null) return CFG.DAILY_LIMIT_MG || 400;
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(50, Math.min(1500, n)) : (CFG.DAILY_LIMIT_MG || 400);
  }
  function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

  async function sha256(text) {
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    // 보안 컨텍스트가 아닐 때(예: 일부 file:// 환경)의 대체 해시 — 로컬 개발 전용
    let h = 0; for (let i = 0; i < text.length; i++) { h = (h * 31 + text.charCodeAt(i)) | 0; }
    return "weak-" + (h >>> 0).toString(16);
  }

  function toUser(profile) {
    if (!profile) return null;
    return {
      id: profile.id,
      email: profile.email,
      displayName: profile.display_name || (profile.email || "").split("@")[0],
      role: profile.role || "user",
      dailyLimit: Number(profile.daily_limit_mg || CFG.DAILY_LIMIT_MG || 400),
      isActive: profile.is_active !== false,
      createdAt: profile.created_at,
    };
  }

  // ==========================================================================
  // 로컬 모드
  // ==========================================================================
  const LS_USERS = "cm:users", LS_SESSION = "cm:session";
  const local = {
    users() { return CM.lsGet(LS_USERS, []); },
    saveUsers(list) { CM.lsSet(LS_USERS, list); },
    async restore() {
      const s = CM.lsGet(LS_SESSION, null);
      if (!s) return null;
      const u = local.users().find((x) => x.id === s.userId);
      return u ? toUser(u) : null;
    },
    async signUp({ email, password, displayName, dailyLimit }) {
      email = normalizeEmail(email);
      if (!validEmail(email)) throw new Error("이메일 형식을 확인해 주세요.");
      if (!password || password.length < 6) throw new Error("비밀번호는 6자 이상이어야 합니다.");
      const users = local.users();
      if (users.some((u) => u.email === email)) throw new Error("이미 가입된 이메일입니다.");
      const salt = CM.uuid();
      const profile = {
        id: CM.uuid(), email, display_name: (displayName || "").trim() || email.split("@")[0],
        role: ADMIN_EMAILS.includes(email) ? "admin" : "user",
        daily_limit_mg: clampLimit(dailyLimit),
        is_active: true, created_at: new Date().toISOString(),
        salt, password_hash: await sha256(salt + password),
      };
      users.push(profile); local.saveUsers(users);
      CM.lsSet(LS_SESSION, { userId: profile.id });
      return { user: toUser(profile), needsEmailConfirm: false };
    },
    async signIn({ email, password }) {
      email = normalizeEmail(email);
      const u = local.users().find((x) => x.email === email);
      if (!u) throw new Error("가입되지 않은 이메일입니다.");
      if (u.is_active === false) throw new Error("비활성화된 계정입니다. 관리자에게 문의하세요.");
      const hash = await sha256(u.salt + password);
      if (hash !== u.password_hash) throw new Error("비밀번호가 올바르지 않습니다.");
      CM.lsSet(LS_SESSION, { userId: u.id });
      return toUser(u);
    },
    async signOut() { try { localStorage.removeItem(LS_SESSION); } catch (e) {} },
    async updateProfile(userId, patch) {
      const users = local.users();
      const u = users.find((x) => x.id === userId);
      if (!u) throw new Error("사용자를 찾을 수 없습니다.");
      if (patch.displayName != null) u.display_name = String(patch.displayName).trim() || u.display_name;
      if (patch.dailyLimit != null) u.daily_limit_mg = clampLimit(patch.dailyLimit);
      local.saveUsers(users);
      return toUser(u);
    },
  };

  // ==========================================================================
  // Supabase 모드
  // ==========================================================================
  const remote = {
    async loadProfile(authUser) {
      if (!authUser) return null;
      let { data, error } = await CM.sb.from("profiles").select("*").eq("id", authUser.id).maybeSingle();
      if (error) { console.warn("profiles 조회 실패", error); }
      if (!data) {
        // 트리거가 아직 없거나 실패한 경우 클라이언트에서 프로필 생성 (RLS: 본인 행 insert 허용)
        const email = normalizeEmail(authUser.email);
        const ins = await CM.sb.from("profiles").insert({
          id: authUser.id, email,
          display_name: authUser.user_metadata?.display_name || email.split("@")[0],
          daily_limit_mg: clampLimit(authUser.user_metadata?.daily_limit_mg),
        }).select("*").maybeSingle();
        data = ins.data;
        if (ins.error) console.warn("profiles 생성 실패", ins.error);
      }
      if (!data) {
        // 예전에는 여기서 가짜 프로필을 만들어 돌려줬다. 그러면 로그인된 것처럼 보이다가
        // 기록·수정이 전부 날 오류로 실패한다. 차라리 로그아웃하고 이유를 알린다.
        CM.setAuthNotice("계정 정보를 불러오지 못했습니다. 관리자에게 문의해 주세요. (프로필 생성 실패)");
        try { await CM.sb.auth.signOut(); } catch (e) {}
        return null;
      }
      return toUser(data);
    },
    async restore() {
      const { data } = await CM.sb.auth.getSession();
      return remote.loadProfile(data?.session?.user || null);
    },
    async signUp({ email, password, displayName, dailyLimit }) {
      email = normalizeEmail(email);
      if (!validEmail(email)) throw new Error("이메일 형식을 확인해 주세요.");
      if (!password || password.length < 6) throw new Error("비밀번호는 6자 이상이어야 합니다.");
      const { data, error } = await CM.sb.auth.signUp({
        email, password,
        options: { data: { display_name: (displayName || "").trim() || email.split("@")[0], daily_limit_mg: clampLimit(dailyLimit) } },
      });
      if (error) throw new Error(translate(error.message));
      // 이메일 확인이 켜져 있으면 session 이 null 로 옵니다.
      if (!data.session) return { user: null, needsEmailConfirm: true };
      const user = await remote.loadProfile(data.user);
      return { user, needsEmailConfirm: false };
    },
    async signIn({ email, password }) {
      email = normalizeEmail(email);
      const { data, error } = await CM.sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(translate(error.message));
      const user = await remote.loadProfile(data.user);
      if (user && user.isActive === false) { await CM.sb.auth.signOut(); throw new Error("비활성화된 계정입니다. 관리자에게 문의하세요."); }
      return user;
    },
    async signOut() { await CM.sb.auth.signOut(); },
    async updateProfile(userId, patch) {
      const row = {};
      if (patch.displayName != null) row.display_name = String(patch.displayName).trim();
      if (patch.dailyLimit != null) row.daily_limit_mg = clampLimit(patch.dailyLimit);
      const { data, error } = await CM.sb.from("profiles").update(row).eq("id", userId).select("*").single();
      if (error) throw new Error(translate(error.message));
      return toUser(data);
    },
  };

  function translate(msg) {
    const m = String(msg || "");
    if (/Invalid login credentials/i.test(m)) return "이메일 또는 비밀번호가 올바르지 않습니다.";
    if (/Email not confirmed/i.test(m)) return "이메일 확인이 끝나지 않았습니다. 받은 메일의 링크를 눌러 주세요.";
    if (/User already registered|already been registered/i.test(m)) return "이미 가입된 이메일입니다.";
    if (/Password should be at least/i.test(m)) return "비밀번호는 6자 이상이어야 합니다.";
    if (/rate limit/i.test(m)) return "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.";
    if (/Failed to fetch|NetworkError/i.test(m)) return "서버에 연결할 수 없습니다. 네트워크와 Supabase 설정을 확인해 주세요.";
    if (/row-level security/i.test(m)) return "권한이 없거나 계정이 비활성화되어 저장하지 못했습니다. 다시 로그인해 주세요.";
    if (/foreign key constraint/i.test(m)) return "참조하던 상품이 삭제되었습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.";
    if (/check constraint/i.test(m)) return "입력값이 허용 범위를 벗어났습니다. 숫자를 확인해 주세요.";
    if (/out of range/i.test(m)) return "숫자가 너무 큽니다. 값을 확인해 주세요.";
    if (/duplicate key value/i.test(m)) return "이미 같은 값이 등록되어 있습니다.";
    if (/PGRST116|multiple \(or no\) rows returned/i.test(m)) return "대상을 찾을 수 없거나 수정 권한이 없습니다. 목록을 새로고침해 주세요.";
    return m;
  }

  const impl = useSupabase ? remote : local;

  // ==========================================================================
  // 공개 API
  // ==========================================================================
  const auth = {
    mode: CM.mode,
    ready: null,
    getUser() { return currentUser; },
    isAdmin() { return !!(currentUser && currentUser.role === "admin"); },
    onChange(fn) { listeners.push(fn); },
    async signUp(args) { const r = await impl.signUp(args); if (r.user) { currentUser = r.user; emit(); } return r; },
    async signIn(args) { currentUser = await impl.signIn(args); emit(); return currentUser; },
    async signOut() { await impl.signOut(); currentUser = null; emit(); },
    async updateProfile(patch) {
      if (!currentUser) throw new Error("로그인이 필요합니다.");
      currentUser = await impl.updateProfile(currentUser.id, patch); emit(); return currentUser;
    },
    async refresh() { currentUser = await impl.restore(); emit(); return currentUser; },
    /** 로그인 필요 페이지에서 호출. 없으면 login.html 로 보냄. admin:true 면 관리자만 통과. */
    async requireUser(opts) {
      opts = opts || {};
      await auth.ready;
      // record.html 처럼 ?product=... 에 상태가 있는 페이지도 로그인 후 제자리로 돌아오도록 search 포함
      const here = (location.pathname.split("/").pop() || "index.html") + location.search;
      const inFrame = (function () { try { return window.parent && window.parent !== window; } catch (e) { return false; } })();
      const goLogin = (qs) => {
        // 팝업(iframe) 안이면 좁은 프레임에 로그인 화면을 그리지 말고 부모에게 맡긴다.
        if (inFrame) {
          try { window.parent.postMessage({ __cm: "popup", type: "auth-required", next: here, reason: qs }, location.origin || "*"); } catch (e) {}
        } else {
          location.replace("login.html?next=" + encodeURIComponent(here) + (qs ? "&" + qs : ""));
        }
        return new Promise(() => {}); // 이동 대기
      };
      if (!currentUser) return goLogin("");
      if (currentUser.isActive === false) { await auth.signOut(); return goLogin("disabled=1"); }
      if (opts.admin && currentUser.role !== "admin") {
        if (inFrame) return goLogin("");
        location.replace("index.html?denied=1");
        return new Promise(() => {});
      }
      return currentUser;
    },
    translate,
  };
  if (CM.sbUnavailable) {
    // supabase-js 를 못 받았으므로 아무 것도 진행시키지 않는다(auth.ready 가 끝나지 않음).
    auth.ready = new Promise(() => {});
    const showBlocker = () => {
      if (document.getElementById("cmSbBlocker")) return;
      const el = document.createElement("div");
      el.id = "cmSbBlocker";
      el.setAttribute("style", "position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:24px;background:#FFFDF8;font:14px/1.6 Pretendard,system-ui,sans-serif;color:#1B1F24");
      el.innerHTML = '<div style="max-width:420px;text-align:center"><h1 style="font-size:18px;margin:0 0 10px">연결 스크립트를 불러오지 못했습니다</h1>'
        + '<p style="margin:0 0 18px;color:#6B7380">네트워크나 광고 차단 확장 때문에 Supabase 라이브러리(cdn.jsdelivr.net)를 받지 못했습니다. 이 상태로 기록하면 서버에 저장되지 않으므로 화면을 잠시 막았습니다.</p>'
        + '<button type="button" id="cmSbRetry" style="height:42px;padding:0 20px;border:0;border-radius:10px;background:#1F6F5B;color:#fff;font-size:14px;cursor:pointer">다시 시도</button></div>';
      document.body.appendChild(el);
      document.getElementById("cmSbRetry").addEventListener("click", () => location.reload());
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", showBlocker); else showBlocker();
  } else {
    auth.ready = (async () => { try { currentUser = await impl.restore(); } catch (e) { console.error("세션 복원 실패", e); } return currentUser; })();
  }

  if (useSupabase) {
    CM.sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") { currentUser = null; emit(); }
    });
  }
  CM.auth = auth;
})();
