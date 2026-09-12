# 카페인 매니저 — 구현 계획

리디자인 시안 **2a(메인 화면 v2)** 와 **2b(섭취 기록 모달 v2)** 를 기준으로 실제 동작하는 웹 앱을 만든다.
1차 시안(1a·1b)은 폐기한다.

## 확정된 의사결정

| 항목 | 결정 | 이유 |
|---|---|---|
| 프런트엔드 | 순수 HTML/CSS/JS (프레임워크 없음) | 시안이 정적 HTML이고 GitHub Pages에 그대로 올릴 수 있음 |
| 팝업 | `record.html` 별도 파일 → `index.html` 위에 어두운 배경 + iframe 모달 | 2b 시안과 동일한 모습, 모바일·팝업 차단기 영향 없음 |
| 백엔드 | **Supabase** (PostgreSQL + Auth + RLS) | 무료 티어, 정적 호스팅과 호환, SQL로 데이터 관리 |
| 저장 모드 | `js/config.js` 에 Supabase 키가 없으면 **로컬 모드(localStorage)** 로 자동 동작 | 키 없이도 바로 실행·테스트 가능, 키만 넣으면 클라우드 모드 |
| 호스팅 | GitHub 저장소 + GitHub Pages (Actions 배포) | 어디서든 접속 가능한 공개 URL |
| 슈퍼관리자 | `config.js`의 `ADMIN_EMAILS` + DB `admin_emails` 테이블에 등록된 이메일로 가입하면 자동으로 `admin` 역할 | 별도 승격 절차 없이 첫 관리자 확보 |

## 단계별 계획

| 단계 | 내용 | 산출물 | 상태 |
|---|---|---|---|
| 1 | 2a 시안 → `index.html` 변환 (검색·필터·정렬·지표·기록 목록·잔존 카페인) | `index.html`, `css/style.css`, `js/app.js`, `js/seed-products.js` | ✅ |
| 2 | 2b 시안 → 팝업 파일 분리 | `record.html`, `js/record.js`, `js/ui.js`(팝업 호스트) | ✅ |
| 3 | 회원가입 · 로그인 · 설정 | `signup.html`, `login.html`, `settings.html`, `js/auth.js` | ✅ |
| 4 | 슈퍼관리자 | `admin.html`, `js/admin.js` (대시보드 · 상품 관리 · 승인 대기 · 사용자 관리) | ✅ |
| 5 | 데이터베이스 저장 | `supabase/schema.sql`(테이블·RLS·트리거·시드), `js/store.js`(local/supabase 어댑터) | ✅ |
| 6 | GitHub 관리 · 배포 | `.github/workflows/deploy.yml`, `README.md`, `.gitignore`, 첫 커밋 | ✅ |
| 7 | 배포 전 검토 | `docs/REVIEW.md` — 배포 전 수정·확인 항목 | ✅ |

## 파일 구조

```
caffeine-manager/
├── index.html          메인 화면 (2a)
├── record.html         섭취 기록 팝업 (2b)
├── product-form.html   상품 직접 추가 팝업
├── settings.html       설정 팝업 (표시 이름 · 하루 목표)
├── login.html          로그인
├── signup.html         회원가입
├── admin.html          슈퍼관리자
├── css/style.css       공통 스타일 (2a 디자인 토큰)
├── js/config.js        Supabase 키 · 관리자 이메일 · 기본값
├── js/seed-products.js 시드 상품 카탈로그 (data/products.seed.json 에서 생성)
├── js/store.js         데이터 어댑터 (local ↔ supabase)
├── js/auth.js          인증 어댑터 (local ↔ supabase)
├── js/ui.js            공통 UI (팝업 호스트 · 토스트 · 포맷)
├── js/app.js           메인 화면 로직
├── js/record.js        기록 팝업 로직
├── js/admin.js         관리자 로직
├── supabase/schema.sql DB 스키마 · RLS · 트리거 · 시드
├── data/products.seed.json  시드 원본
├── tools/gen-seed.py   시드 → js/sql 생성기
├── .github/workflows/deploy.yml  GitHub Pages 배포
└── docs/PLAN.md, docs/REVIEW.md
```

## 데이터 모델 (Supabase)

- `profiles` — id(auth.users), email, display_name, role(user/admin), daily_limit_mg, is_active
- `products` — 브랜드·이름·분류·1회 제공량·카페인·당류·칼로리·기준가·출처·확인일·status(approved/pending/rejected)·created_by
- `intakes` — user_id, product_id, 스냅샷(이름·브랜드·영양), quantity, price_paid, consumed_at
- `admin_emails` — 가입 시 자동으로 admin 역할을 받을 이메일

모든 테이블에 RLS 적용: 일반 사용자는 본인 데이터만, 관리자는 전체.
