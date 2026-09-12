# 카페인 매니저 (Caffeine Manager)

음료를 검색하고 1회 제공량 기준 **카페인·당류·칼로리**를 확인한 뒤 바로 기록하는 웹 앱입니다.
리디자인 시안 **2a(메인) · 2b(기록 모달)** 를 기준으로 만들었고, 회원가입 · 슈퍼관리자 · 클라우드 저장(Supabase) · GitHub Pages 배포까지 포함합니다.

```
index.html        메인 화면 — 검색 · 필터 · 정렬 · 오늘의 지표 · 섭취 내역 · 잔존 카페인
record.html       섭취 기록 팝업 (index 위에 모달로 열림)
product-form.html 상품 직접 추가 팝업
settings.html     설정 팝업 (표시 이름 · 하루 목표 · 로그아웃)
login.html        로그인          signup.html  회원가입
admin.html        슈퍼관리자 (대시보드 · 상품 관리 · 승인 대기 · 사용자)
css/style.css     공통 스타일
js/config.js      ★ Supabase 키 · 관리자 이메일 설정
js/*.js           auth(인증) · store(데이터) · ui(공통) · app · record · admin
supabase/         schema.sql(테이블·RLS·트리거) · seed.sql(시드 상품 35종)
data/ · tools/    시드 원본 JSON 과 생성기
docs/             PLAN.md(계획) · REVIEW.md(배포 전 검토)
```

---

## 1. 바로 실행해 보기 (로컬 모드)

`js/config.js` 의 Supabase 키가 비어 있으면 **로컬 모드**로 동작합니다. 계정과 기록이 *이 브라우저의 localStorage* 에만 저장되며, 서버 없이 모든 기능을 써볼 수 있습니다.

```bash
# 아무 정적 서버로 열면 됩니다 (팝업이 iframe 이라 file:// 보다 http:// 를 권장)
python3 -m http.server 8080
# 또는  npx serve .
```

브라우저에서 `http://localhost:8080` → 회원가입 → 사용. `js/config.js` 의 `ADMIN_EMAILS` 에 있는 이메일로 가입하면 관리자 메뉴가 생깁니다.

## 2. 클라우드 모드 (Supabase) 설정

1. <https://supabase.com> 에서 새 프로젝트 생성 (무료 티어, 리전은 Northeast Asia(Seoul/Tokyo) 권장)
2. **SQL Editor → New query** 에 `supabase/schema.sql` 전체를 붙여넣고 **Run**
3. 같은 방법으로 `supabase/seed.sql` 실행 (시드 상품 35종 입력)
4. **Project Settings → API** 에서 `Project URL` 과 `anon public` 키를 복사해 `js/config.js` 에 입력
   ```js
   SUPABASE_URL: "https://xxxx.supabase.co",
   SUPABASE_ANON_KEY: "eyJhbGciOi...",
   ```
   > anon 키는 공개용입니다(행 단위 보안 RLS 가 데이터를 보호). **service_role 키는 절대 넣지 마세요.**
5. **Authentication → Providers → Email**
   - 테스트 단계에서는 *Confirm email* 을 끄면 가입 즉시 로그인됩니다. 켜 두면 확인 메일 링크를 눌러야 합니다.
6. **Authentication → URL Configuration**
   - Site URL: 배포 주소 (예: `https://<아이디>.github.io/caffeine-manager/`)
   - Redirect URLs: 같은 주소 + `http://localhost:8080` (로컬 테스트용)
7. 슈퍼관리자: `schema.sql` 의 `admin_emails` 테이블에 있는 이메일(기본 `donseok75@gmail.com`)로 가입하면 자동으로 `admin` 역할이 됩니다. 다른 관리자를 추가하려면 관리자 화면 → 사용자 → "관리자 지정", 또는 SQL 로 `admin_emails` 에 이메일을 넣으세요.

### 데이터 구조

| 테이블 | 내용 |
|---|---|
| `profiles` | 사용자(이메일 · 표시 이름 · 역할 user/admin · 하루 목표 · 활성 여부). 가입 시 트리거로 자동 생성 |
| `products` | 상품 카탈로그. 사용자가 직접 추가하면 `pending`, 관리자가 승인하면 `approved` |
| `intakes` | 섭취 기록. 상품 정보를 스냅샷으로 저장해 상품이 바뀌어도 과거 기록이 변하지 않음 |
| `admin_emails` | 가입 시 자동으로 admin 이 되는 이메일 목록 |

모든 테이블은 RLS 로 보호됩니다: 일반 사용자는 본인 데이터 + 승인된 상품만, 관리자는 전체.

## 3. GitHub 에 올리고 배포하기 (GitHub Pages)

```bash
# 1) GitHub 에서 새 저장소 생성 (예: caffeine-manager, Public)
# 2) 이 폴더에서
git remote add origin https://github.com/<아이디>/caffeine-manager.git
git branch -M main
git push -u origin main
```

3. 저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 선택
4. `.github/workflows/deploy.yml` 이 main 브랜치에 push 될 때마다 자동 배포합니다. 1~2분 뒤
   `https://<아이디>.github.io/caffeine-manager/` 에서 접속할 수 있습니다.
5. 이후 수정은 `git add -A && git commit -m "..." && git push` 만 하면 자동 반영됩니다.

> 저장소를 Private 으로 두고 Pages 를 쓰려면 GitHub Pro 이상이 필요합니다. 코드에는 비밀 값이 없으므로(anon 키는 공개용) Public 이어도 안전합니다.

## 4. 시드 상품 수정

`data/products.seed.json` 을 고친 뒤:

```bash
python3 tools/gen-seed.py     # → js/seed-products.js, supabase/seed.sql 재생성
```

클라우드 모드에서는 `supabase/seed.sql` 을 SQL Editor 에서 다시 실행하면 같은 id 로 upsert 됩니다.
시드 수치는 각 브랜드 공식 영양정보·제품 표시사항을 기준으로 입력했지만 **재확인 전**이므로 화면에 "확인 필요" 배지가 붙습니다. 관리자 화면에서 값을 확인하고 "확인✓" 를 누르면 확인일이 기록되고 배지가 사라집니다.

## 5. 주요 동작

- **검색**: 상품명 · 브랜드 · 태그 · 분류를 토큰 단위로 매칭, 관련도순 정렬. 빠른 검색 칩 제공
- **기록**: 상품 카드의 "기록" → 팝업에서 횟수 · 시각 · 실제 결제액 입력 → 오늘 누적 미리보기
- **가격**: 내가 입력한 결제액이 있으면 "내 최근 결제" 로 표시, 없으면 기준가 + 확인일
- **오늘의 지표**: 카페인(목표 대비 %) · 당류 · 칼로리 · 실제 지출 · 잔존 카페인(반감기 5시간 추정)
- **직접 추가**: 카탈로그에 없는 상품을 입력 → 내게만 보이는 `pending` 상품 → 관리자 승인 후 공개
- **관리자**: 대시보드 · 상품 CRUD/확인일 · 승인/반려 · 사용자 역할/활성화

## 라이선스 · 주의

카페인 수치는 개인별 민감도와 제조 편차가 있으며, 이 서비스는 의료 진단을 대신하지 않습니다.
글꼴: [Pretendard](https://github.com/orioncactus/pretendard) (SIL OFL).
