// ============================================================================
// 카페인 매니저 설정
// ----------------------------------------------------------------------------
// SUPABASE_URL / SUPABASE_ANON_KEY 를 비워 두면 "로컬 모드"(이 브라우저의 localStorage)로
// 동작합니다. Supabase 프로젝트를 만든 뒤 두 값을 채우면 "클라우드 모드"로 바뀝니다.
//   - Supabase 대시보드 → Project Settings → API 에서 확인
//   - anon key 는 공개용 키입니다(행 단위 보안 RLS 가 데이터를 보호). 서비스 롤 키는 절대 넣지 마세요.
// ============================================================================
window.APP_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",

  // 이 이메일로 가입하면 자동으로 슈퍼관리자(admin) 역할을 받습니다.
  // (클라우드 모드에서는 supabase/schema.sql 의 admin_emails 테이블도 함께 맞춰 주세요.)
  ADMIN_EMAILS: ["donseok75@gmail.com"],

  // 기본값
  DAILY_LIMIT_MG: 400,      // 성인 하루 카페인 권고 최대치(식약처 기준 400 mg)
  HALF_LIFE_HOURS: 5,       // 잔존 카페인 추정에 쓰는 반감기
  PAGE_SIZE: 8,             // 검색 결과 한 번에 보여줄 개수
  APP_NAME: "카페인 매니저",

  // 챗봇(카피) — Google Gemini
  //   API 키는 여기에 넣지 마세요(공개 저장소). 챗봇 패널의 ⚙ 설정에서 입력하면 이 브라우저에만 저장됩니다.
  //   로컬 실험용으로만 GEMINI_API_KEY 를 채우고 커밋하지 않는 방법도 있습니다.
  CHAT_NAME: "카피",
  GEMINI_API_KEY: "",
  GEMINI_MODEL: "gemini-3.8-flash-lite",                       // 1순위 — 키의 모델 목록에 있으면 자동 선택
  GEMINI_FALLBACK_MODELS: ["gemini-3.5-flash-lite", "gemini-3.8-flash"], // 없을 때 순서대로
};
