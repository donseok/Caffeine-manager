// ============================================================================
// 데이터 어댑터 — 로컬 모드(localStorage) ↔ Supabase 모드
//   window.CM.store : 상품 · 섭취 기록 · 관리자용 조회
//   모든 함수는 Promise 를 돌려줍니다. 컬럼 이름은 두 모드 모두 snake_case(DB 와 동일).
// ============================================================================
(function () {
  const CM = (window.CM = window.CM || {});
  const CFG = window.APP_CONFIG || {};
  const SEED = CM.SEED_PRODUCTS || [];

  CM.CATEGORIES = {
    coffee: { label: "커피", color: "#B25E00", tint: "#FFF1DE" },
    tea: { label: "티", color: "#1F6F5B", tint: "#E3F3EC" },
    blended: { label: "블렌디드", color: "#B0306A", tint: "#FBE7F0" },
    refresher: { label: "리프레셔", color: "#C8462F", tint: "#FDE9E4" },
    energy: { label: "에너지음료", color: "#6A3FC7", tint: "#EEE8FB" },
    other: { label: "기타", color: "#2D5BD1", tint: "#E8EEFC" },
  };

  function user() { return CM.auth && CM.auth.getUser(); }
  function isAdmin() { return CM.auth && CM.auth.isAdmin(); }
  function nowIso() { return new Date().toISOString(); }
  function num(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }

  /** 입력 폼 → 상품 행 정규화 (두 모드 공통) */
  function normalizeProduct(p) {
    const cat = CM.CATEGORIES[p.category] ? p.category : "other";
    const brand = String(p.brand || "").trim();
    return {
      brand,
      brand_key: (p.brand_key || brand.replace(/\s+/g, "-").toLowerCase() || "brand"),
      name: String(p.name || "").trim(),
      category: cat,
      serving_label: String(p.serving_label || "").trim() || (p.serving_ml ? `${p.serving_ml} mL` : "1회 제공량"),
      serving_ml: p.serving_ml == null || p.serving_ml === "" ? null : num(p.serving_ml, null),
      caffeine_mg: num(p.caffeine_mg, 0),
      sugar_g: p.sugar_g == null || p.sugar_g === "" ? null : num(p.sugar_g, null),
      kcal: p.kcal == null || p.kcal === "" ? null : num(p.kcal, null),
      base_price: p.base_price == null || p.base_price === "" ? null : Math.round(num(p.base_price, 0)),
      price_note: String(p.price_note || "").trim() || null,
      price_checked_at: p.price_checked_at || null,
      source: String(p.source || "").trim() || "직접 입력",
      verified_at: p.verified_at || null,
      tags: Array.isArray(p.tags) ? p.tags : String(p.tags || "").split(/[,\s]+/).filter(Boolean),
      image_url: p.image_url || null,
    };
  }

  function makeIntakeRow(args) {
    const p = args.product;
    return {
      user_id: user() ? user().id : null,
      product_id: p.id || null,
      product_name: p.name,
      brand: p.brand,
      category: p.category,
      serving_label: p.serving_label,
      serving_ml: p.serving_ml == null ? null : Number(p.serving_ml),
      caffeine_mg: Number(p.caffeine_mg) || 0,
      sugar_g: p.sugar_g == null ? null : Number(p.sugar_g),
      kcal: p.kcal == null ? null : Number(p.kcal),
      quantity: Math.max(0.1, Math.min(20, num(args.quantity, 1))),
      price_paid: args.pricePaid == null || args.pricePaid === "" ? null : Math.round(num(args.pricePaid, 0)),
      consumed_at: args.consumedAt ? new Date(args.consumedAt).toISOString() : nowIso(),
    };
  }

  // ==========================================================================
  // 로컬 모드
  // ==========================================================================
  const LS_PRODUCTS = "cm:products", LS_INTAKES = "cm:intakes";
  const local = {
    products() {
      let list = CM.lsGet(LS_PRODUCTS, null);
      if (!list) { list = SEED.map((p) => ({ ...p, created_at: nowIso(), updated_at: nowIso(), created_by: null })); CM.lsSet(LS_PRODUCTS, list); }
      return list;
    },
    saveProducts(list) { CM.lsSet(LS_PRODUCTS, list); },
    intakes() { return CM.lsGet(LS_INTAKES, []); },
    saveIntakes(list) { CM.lsSet(LS_INTAKES, list); },

    async listProducts(opts) {
      opts = opts || {};
      const me = user();
      let list = local.products();
      if (opts.all && isAdmin()) return list.slice();
      if (opts.status) return list.filter((p) => p.status === opts.status);
      return list.filter((p) => p.status === "approved" || (me && p.created_by === me.id && p.status === "pending"));
    },
    async getProduct(id) { return local.products().find((p) => p.id === id) || null; },
    async createProduct(data) {
      const row = { id: CM.uuid(), slug: null, ...normalizeProduct(data), status: isAdmin() ? "approved" : "pending", created_by: user() ? user().id : null, created_at: nowIso(), updated_at: nowIso() };
      if (!row.name) throw new Error("상품명을 입력해 주세요.");
      const list = local.products(); list.unshift(row); local.saveProducts(list); return row;
    },
    async updateProduct(id, patch) {
      const list = local.products(); const i = list.findIndex((p) => p.id === id);
      if (i < 0) throw new Error("상품을 찾을 수 없습니다.");
      const me = user();
      if (!isAdmin() && !(me && list[i].created_by === me.id && list[i].status === "pending")) throw new Error("수정 권한이 없습니다.");
      const allowed = { ...patch }; delete allowed.id; delete allowed.created_by; delete allowed.created_at;
      if (!isAdmin()) delete allowed.status;
      list[i] = { ...list[i], ...allowed, updated_at: nowIso() }; local.saveProducts(list); return list[i];
    },
    async deleteProduct(id) {
      if (!isAdmin()) throw new Error("삭제 권한이 없습니다.");
      local.saveProducts(local.products().filter((p) => p.id !== id));
    },
    async reseed() {
      if (!isAdmin()) throw new Error("권한이 없습니다.");
      const list = local.products(); const have = new Set(list.map((p) => p.id)); let added = 0;
      SEED.forEach((p) => { if (!have.has(p.id)) { list.push({ ...p, created_at: nowIso(), updated_at: nowIso(), created_by: null }); added++; } });
      local.saveProducts(list); return added;
    },

    async listIntakes(opts) {
      opts = opts || {};
      const me = user(); if (!me && !opts.userId) return [];
      let list = local.intakes();
      if (opts.userId === "all" && isAdmin()) { /* 전체 */ }
      else { const uid = (opts.userId && isAdmin()) ? opts.userId : me.id; list = list.filter((x) => x.user_id === uid); }
      if (opts.from) list = list.filter((x) => x.consumed_at >= opts.from);
      if (opts.to) list = list.filter((x) => x.consumed_at < opts.to);
      list.sort((a, b) => (a.consumed_at < b.consumed_at ? 1 : -1));
      if (opts.limit) list = list.slice(0, opts.limit);
      return list;
    },
    async addIntake(args) {
      if (!user()) throw new Error("로그인이 필요합니다.");
      const row = { id: CM.uuid(), ...makeIntakeRow(args), created_at: nowIso() };
      const list = local.intakes(); list.push(row); local.saveIntakes(list); return row;
    },
    async deleteIntake(id) {
      const me = user(); if (!me) throw new Error("로그인이 필요합니다.");
      local.saveIntakes(local.intakes().filter((x) => !(x.id === id && (x.user_id === me.id || isAdmin()))));
    },

    async listUsers() {
      if (!isAdmin()) throw new Error("권한이 없습니다.");
      const intakes = local.intakes();
      return CM.lsGet("cm:users", []).map((u) => {
        const mine = intakes.filter((x) => x.user_id === u.id);
        return { id: u.id, email: u.email, display_name: u.display_name, role: u.role, daily_limit_mg: u.daily_limit_mg, is_active: u.is_active !== false, created_at: u.created_at,
          intake_count: mine.length, last_intake_at: mine.reduce((m, x) => (x.consumed_at > m ? x.consumed_at : m), "") || null };
      });
    },
    async updateUser(id, patch) {
      if (!isAdmin()) throw new Error("권한이 없습니다.");
      const users = CM.lsGet("cm:users", []); const u = users.find((x) => x.id === id);
      if (!u) throw new Error("사용자를 찾을 수 없습니다.");
      if (patch.role) u.role = patch.role === "admin" ? "admin" : "user";
      if (patch.is_active != null) u.is_active = !!patch.is_active;
      if (patch.display_name != null) u.display_name = patch.display_name;
      CM.lsSet("cm:users", users); return u;
    },
    async adminStats() {
      if (!isAdmin()) throw new Error("권한이 없습니다.");
      const products = local.products(); const intakes = local.intakes();
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      return { users: CM.lsGet("cm:users", []).length, products: products.filter((p) => p.status === "approved").length,
        pending: products.filter((p) => p.status === "pending").length, intakes: intakes.length, intakes7d: intakes.filter((x) => x.consumed_at >= since).length };
    },
  };

  // ==========================================================================
  // Supabase 모드
  // ==========================================================================
  function fail(error) { throw new Error(CM.auth.translate(error.message || String(error))); }
  const remote = {
    async listProducts(opts) {
      opts = opts || {};
      let q = CM.sb.from("products").select("*").order("brand").order("name");
      if (opts.status) q = q.eq("status", opts.status);
      // RLS 가 approved + 본인 pending(+관리자 전체) 로 이미 제한합니다.
      const { data, error } = await q; if (error) fail(error); return data || [];
    },
    async getProduct(id) { const { data, error } = await CM.sb.from("products").select("*").eq("id", id).maybeSingle(); if (error) fail(error); return data; },
    async createProduct(data) {
      const row = { ...normalizeProduct(data), status: isAdmin() ? "approved" : "pending", created_by: user() ? user().id : null };
      if (!row.name) throw new Error("상품명을 입력해 주세요.");
      const { data: out, error } = await CM.sb.from("products").insert(row).select("*").single(); if (error) fail(error); return out;
    },
    async updateProduct(id, patch) {
      const allowed = { ...patch }; delete allowed.id; delete allowed.created_by; delete allowed.created_at; delete allowed.updated_at;
      if (!isAdmin()) delete allowed.status;
      const { data, error } = await CM.sb.from("products").update(allowed).eq("id", id).select("*").single(); if (error) fail(error); return data;
    },
    async deleteProduct(id) { const { error } = await CM.sb.from("products").delete().eq("id", id); if (error) fail(error); },
    async reseed() { throw new Error("클라우드 모드에서는 supabase/seed.sql 을 SQL Editor 에서 실행하세요."); },

    async listIntakes(opts) {
      opts = opts || {};
      const me = user(); if (!me) return [];
      let q = CM.sb.from("intakes").select("*").order("consumed_at", { ascending: false });
      if (opts.userId === "all" && isAdmin()) { /* 관리자: 전체 */ }
      else q = q.eq("user_id", (opts.userId && isAdmin()) ? opts.userId : me.id);
      if (opts.from) q = q.gte("consumed_at", opts.from);
      if (opts.to) q = q.lt("consumed_at", opts.to);
      if (opts.limit) q = q.limit(opts.limit);
      const { data, error } = await q; if (error) fail(error); return data || [];
    },
    async addIntake(args) {
      if (!user()) throw new Error("로그인이 필요합니다.");
      const { data, error } = await CM.sb.from("intakes").insert(makeIntakeRow(args)).select("*").single(); if (error) fail(error); return data;
    },
    async deleteIntake(id) { const { error } = await CM.sb.from("intakes").delete().eq("id", id); if (error) fail(error); },

    async listUsers() {
      const [{ data: profiles, error: e1 }, { data: stats, error: e2 }] = await Promise.all([
        CM.sb.from("profiles").select("*").order("created_at"),
        CM.sb.from("user_stats").select("*"),
      ]);
      if (e1) fail(e1); if (e2) console.warn("user_stats 조회 실패", e2);
      const map = {}; (stats || []).forEach((s) => { map[s.user_id] = s; });
      return (profiles || []).map((p) => ({ ...p, intake_count: Number(map[p.id]?.intake_count || 0), last_intake_at: map[p.id]?.last_intake_at || null }));
    },
    async updateUser(id, patch) {
      const row = {};
      if (patch.role) row.role = patch.role === "admin" ? "admin" : "user";
      if (patch.is_active != null) row.is_active = !!patch.is_active;
      if (patch.display_name != null) row.display_name = patch.display_name;
      const { data, error } = await CM.sb.from("profiles").update(row).eq("id", id).select("*").single(); if (error) fail(error); return data;
    },
    async adminStats() {
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const count = async (table, mod) => { let q = CM.sb.from(table).select("*", { count: "exact", head: true }); if (mod) q = mod(q); const { count: c, error } = await q; if (error) fail(error); return c || 0; };
      const [users, products, pending, intakes, intakes7d] = await Promise.all([
        count("profiles"), count("products", (q) => q.eq("status", "approved")), count("products", (q) => q.eq("status", "pending")),
        count("intakes"), count("intakes", (q) => q.gte("consumed_at", since)),
      ]);
      return { users, products, pending, intakes, intakes7d };
    },
  };

  const impl = CM.mode === "supabase" ? remote : local;

  // ==========================================================================
  // 공통 계산 유틸
  // ==========================================================================
  const util = {
    /** 오늘 00:00 (로컬 시간) ISO */
    startOfDay(d) { const x = d ? new Date(d) : new Date(); x.setHours(0, 0, 0, 0); return x; },
    dayRange(offsetDays) {
      const from = util.startOfDay(); from.setDate(from.getDate() - (offsetDays || 0));
      const to = new Date(from); to.setDate(to.getDate() + 1);
      return { from: from.toISOString(), to: to.toISOString() };
    },
    totals(intakes) {
      return intakes.reduce((t, x) => {
        const q = Number(x.quantity) || 1;
        t.count += 1; t.caffeine += (Number(x.caffeine_mg) || 0) * q; t.sugar += (Number(x.sugar_g) || 0) * q; t.kcal += (Number(x.kcal) || 0) * q;
        if (x.price_paid != null) { t.spend += Number(x.price_paid) * q; t.paidCount += 1; }
        return t;
      }, { count: 0, caffeine: 0, sugar: 0, kcal: 0, spend: 0, paidCount: 0 });
    },
    /** 반감기 기준 잔존 카페인(mg) — at 시점 기준, 과거 기록만 반영 */
    residual(intakes, at) {
      const t = at ? new Date(at).getTime() : Date.now();
      const hl = (CFG.HALF_LIFE_HOURS || 5) * 3600e3;
      return intakes.reduce((sum, x) => {
        const c = new Date(x.consumed_at).getTime(); if (c > t) return sum;
        return sum + (Number(x.caffeine_mg) || 0) * (Number(x.quantity) || 1) * Math.pow(0.5, (t - c) / hl);
      }, 0);
    },
    /** 사용자별 상품 최근 결제가 { product_id: { price, at } } */
    latestPrices(intakes) {
      const m = {};
      intakes.forEach((x) => { if (x.product_id && x.price_paid != null && (!m[x.product_id] || x.consumed_at > m[x.product_id].at)) m[x.product_id] = { price: Number(x.price_paid), at: x.consumed_at }; });
      return m;
    },
  };

  CM.store = Object.assign({ mode: CM.mode, normalizeProduct }, impl, util);
})();
