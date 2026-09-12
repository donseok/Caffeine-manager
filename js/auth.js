// ============================================================================
// 인증 어댑터 — 로컬 모드(localStorage) ↔ Supabase 모드
//   window.CM.auth : { mode, ready, getUser, signUp, signIn, signOut, updateProfile, requireUser, onChange }
// ============================================================================
(function () {
  const CM = (window.CM = window.CM || {});
  const CFG = window.APP_CONFIG || {};
  const ADMIN_EMAILS = (CFG.ADMIN_EMAILS || []).map((e) => String(e).toLowerCase());

  const useSupabase = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);
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
  CM.lsSet = function (key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn("localStorage 저장 실패", e); }
  };
  function normalizeEmail(email) { return String(email || "").trim().toLowerCase(); }
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
        daily_limit_mg: Number(dailyLimit) || CFG.DAILY_LIMIT_MG || 400,
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
      if (patch.dailyLimit != null) u.daily_limit_mg = Math.max(50, Math.min(1500, Number(patch.dailyLimit) || 400));
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
          daily_limit_mg: Number(authUser.user_metadata?.daily_limit_mg) || CFG.DAILY_LIMIT_MG || 400,
        }).select("*").maybeSingle();
        data = ins.data;
        if (ins.error) console.warn("profiles 생성 실패", ins.error);
      }
      if (!data) return toUser({ id: authUser.id, email: authUser.email });
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
        options: { data: { display_name: (displayName || "").trim() || email.split("@")[0], daily_limit_mg: Number(dailyLimit) || 400 } },
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
      if (patch.dailyLimit != null) row.daily_limit_mg = Math.max(50, Math.min(1500, Number(patch.dailyLimit) || 400));
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
      if (!currentUser) {
        const next = encodeURIComponent(location.pathname.split("/").pop() || "index.html");
        location.replace("login.html?next=" + next);
        return new Promise(() => {}); // 페이지 이동 대기
      }
      if (opts.admin && currentUser.role !== "admin") {
        location.replace("index.html?denied=1");
        return new Promise(() => {});
      }
      return currentUser;
    },
    translate,
  };
  auth.ready = (async () => { try { currentUser = await impl.restore(); } catch (e) { console.error("세션 복원 실패", e); } return currentUser; })();

  if (useSupabase) {
    CM.sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") { currentUser = null; emit(); }
    });
  }
  CM.auth = auth;
})();
