-- 자동 생성 파일 — data/products.seed.json 을 고친 뒤 `python3 tools/gen-seed.py` 로 다시 만드세요.
-- schema.sql 을 먼저 실행한 뒤 이 파일을 실행하세요. 여러 번 실행해도 안전합니다(upsert).
-- 재실행하면 영양정보·가격·상태(status)·출처는 시드 값으로 되돌아가지만,
-- 관리자가 눌러 둔 확인일(verified_at, price_checked_at) 은 그대로 둡니다.
insert into public.products
  (id, slug, brand, brand_key, name, category, serving_label, serving_ml, caffeine_mg, sugar_g, kcal, base_price, price_note, price_checked_at, source, verified_at, tags, status)
values
  ('08e371b8-8bda-529a-ad37-55af2ff17315', 'sb-americano-hot', '스타벅스', 'starbucks', '카페 아메리카노', 'coffee', 'Tall 355 mL', 355, 150, 0, 10, 4700, '매장 기준가', null, '공식 영양정보', null, array['아메리카노','핫','에스프레소']::text[], 'approved'),
  ('05e4c29a-ac81-5e7a-b667-47427c61f4aa', 'sb-americano-ice', '스타벅스', 'starbucks', '아이스 카페 아메리카노', 'coffee', 'Tall 355 mL', 355, 150, 0, 10, 4700, '매장 기준가', null, '공식 영양정보', null, array['아메리카노','아이스','에스프레소']::text[], 'approved'),
  ('ba014590-01af-5bd4-bd4b-fe999c259bf9', 'sb-latte-hot', '스타벅스', 'starbucks', '카페 라떼', 'coffee', 'Tall 355 mL', 355, 75, 13, 180, 5200, '매장 기준가', null, '공식 영양정보', null, array['라떼','핫','에스프레소']::text[], 'approved'),
  ('da83a9f0-4788-56f2-8b0c-1aa84c31fc8c', 'sb-latte-ice', '스타벅스', 'starbucks', '아이스 카페 라떼', 'coffee', 'Tall 355 mL', 355, 75, 8, 110, 5200, '매장 기준가', null, '공식 영양정보', null, array['라떼','아이스','에스프레소']::text[], 'approved'),
  ('d82612d4-ea39-5a70-aa1c-82c34637e6bd', 'sb-cappuccino', '스타벅스', 'starbucks', '카푸치노', 'coffee', 'Tall 355 mL', 355, 75, 8, 110, 5200, '매장 기준가', null, '공식 영양정보', null, array['카푸치노','핫','에스프레소']::text[], 'approved'),
  ('06852efc-b96d-5d87-8a20-571fec98d394', 'sb-caramel-macchiato-hot', '스타벅스', 'starbucks', '카라멜 마키아또', 'coffee', 'Tall 355 mL', 355, 75, 22, 200, 6100, '매장 기준가', null, '공식 영양정보', null, array['마키아또','카라멜','핫','라떼']::text[], 'approved'),
  ('a97392ca-4759-5e58-832f-f7e4101fad96', 'sb-caramel-macchiato-ice', '스타벅스', 'starbucks', '아이스 카라멜 마키아또', 'coffee', 'Tall 355 mL', 355, 75, 22, 190, 6100, '매장 기준가', null, '공식 영양정보', null, array['마키아또','카라멜','아이스','라떼']::text[], 'approved'),
  ('995ebfdc-ad78-5a59-b439-94657b01da72', 'sb-cafe-mocha', '스타벅스', 'starbucks', '카페 모카', 'coffee', 'Tall 355 mL', 355, 95, 25, 290, 5700, '매장 기준가', null, '공식 영양정보', null, array['모카','핫','초콜릿']::text[], 'approved'),
  ('0b71ebf9-f44c-5c1f-a59b-d18fcbe49f70', 'sb-white-choco-mocha', '스타벅스', 'starbucks', '화이트 초콜릿 모카', 'coffee', 'Tall 355 mL', 355, 75, 35, 340, 5900, '매장 기준가', null, '공식 영양정보', null, array['모카','화이트','초콜릿']::text[], 'approved'),
  ('0a2c46f5-982c-5f72-a035-b7e833470480', 'sb-dolce-latte', '스타벅스', 'starbucks', '스타벅스 돌체 라떼', 'coffee', 'Tall 355 mL', 355, 150, 29, 265, 6100, '매장 기준가', null, '공식 영양정보', null, array['돌체','라떼','에스프레소']::text[], 'approved'),
  ('08488633-9952-51d5-a955-b2c2a4d545a8', 'sb-espresso-solo', '스타벅스', 'starbucks', '에스프레소', 'coffee', 'Solo 30 mL', 30, 75, 0, 5, 4300, '매장 기준가', null, '공식 영양정보', null, array['에스프레소','샷']::text[], 'approved'),
  ('9050ab2e-0b76-5c08-8c75-38494ba361e1', 'sb-cold-brew', '스타벅스', 'starbucks', '콜드 브루', 'coffee', 'Tall 355 mL', 355, 155, 0, 5, 4900, '매장 기준가', null, '공식 영양정보', null, array['콜드 브루','콜드브루','아이스']::text[], 'approved'),
  ('e6d6379f-a1fa-528f-9bb9-8e8a317ae456', 'sb-dolce-cold-brew', '스타벅스', 'starbucks', '돌체 콜드 브루', 'coffee', 'Tall 355 mL', 355, 155, 29, 265, 6000, '매장 기준가', null, '공식 영양정보', null, array['콜드 브루','콜드브루','돌체','아이스']::text[], 'approved'),
  ('90d2f0c4-8898-5a62-9b04-f373d8faf2a3', 'sb-vanilla-cream-cold-brew', '스타벅스', 'starbucks', '바닐라 크림 콜드 브루', 'coffee', 'Tall 355 mL', 355, 155, 10, 125, 5800, '매장 기준가', null, '공식 영양정보', null, array['콜드 브루','콜드브루','바닐라','아이스']::text[], 'approved'),
  ('739bd770-11a2-5b06-8cb2-2492219ec8b3', 'sb-brewed-coffee', '스타벅스', 'starbucks', '오늘의 커피', 'coffee', 'Tall 355 mL', 355, 260, 0, 5, 4500, '매장 기준가', null, '공식 영양정보', null, array['브루드','드립','핫']::text[], 'approved'),
  ('39df979a-790e-5a96-b8c3-c097f75c0b6f', 'sb-decaf-americano', '스타벅스', 'starbucks', '디카페인 카페 아메리카노', 'coffee', 'Tall 355 mL', 355, 10, 0, 10, 5000, '매장 기준가', null, '공식 영양정보', null, array['디카페인','아메리카노']::text[], 'approved'),
  ('743b7292-059e-5f0c-9c14-b6c3d4e1b9e6', 'sb-java-chip-frap', '스타벅스', 'starbucks', '자바 칩 프라푸치노', 'blended', 'Tall 355 mL', 355, 100, 39, 340, 6300, '매장 기준가', null, '공식 영양정보', null, array['프라푸치노','자바칩','초콜릿']::text[], 'approved'),
  ('ddb8a9a1-827c-5fbc-9da4-44b88cded559', 'sb-green-tea-cream-frap', '스타벅스', 'starbucks', '그린 티 크림 프라푸치노', 'blended', 'Tall 355 mL', 355, 60, 28, 230, 6300, '매장 기준가', null, '공식 영양정보', null, array['프라푸치노','그린티','말차']::text[], 'approved'),
  ('e7a29e05-5553-5e1d-8106-7de22181bdf2', 'sb-caramel-frap', '스타벅스', 'starbucks', '카라멜 프라푸치노', 'blended', 'Tall 355 mL', 355, 60, 40, 260, 6100, '매장 기준가', null, '공식 영양정보', null, array['프라푸치노','카라멜']::text[], 'approved'),
  ('ed68f3e7-8360-51c8-bbdc-e695cfaedb9b', 'sb-grapefruit-honey-black-tea', '스타벅스', 'starbucks', '자몽 허니 블랙 티', 'tea', 'Tall 355 mL', 355, 40, 26, 130, 5700, '매장 기준가', null, '공식 영양정보', null, array['티','블랙티','자몽']::text[], 'approved'),
  ('5d4034e6-02d9-5d52-b513-ed1b5fe0b0df', 'sb-youthberry-tea', '스타벅스', 'starbucks', '유스베리 티', 'tea', 'Tall 355 mL', 355, 20, 0, 0, 5100, '매장 기준가', null, '공식 영양정보', null, array['티','허브','유스베리']::text[], 'approved'),
  ('34330723-2760-5c11-bc94-36542a9f3133', 'sb-chai-tea-latte-hot', '스타벅스', 'starbucks', '차이 티 라떼', 'tea', 'Tall 355 mL', 355, 70, 31, 200, 5700, '매장 기준가', null, '공식 영양정보', null, array['티','차이','라떼','핫']::text[], 'approved'),
  ('fd0fd248-2408-50f8-a064-dd120b0335f5', 'sb-chai-tea-latte-ice', '스타벅스', 'starbucks', '아이스 차이 티 라떼', 'tea', 'Tall 355 mL', 355, 70, 31, 190, 5700, '매장 기준가', null, '공식 영양정보', null, array['티','차이','라떼','아이스']::text[], 'approved'),
  ('42f8a578-14a1-57c7-81ca-b9b4bd31683d', 'sb-strawberry-acai-refresher', '스타벅스', 'starbucks', '딸기 아사이 레모네이드 스타벅스 리프레셔', 'refresher', 'Tall 355 mL', 355, 40, 24, 105, 6000, '매장 기준가', null, '공식 영양정보', null, array['리프레셔','딸기','레모네이드']::text[], 'approved'),
  ('0209e3bb-56da-58c0-b592-a6998e6036a0', 'sb-cool-lime-fizzio', '스타벅스', 'starbucks', '쿨 라임 피지오', 'refresher', 'Tall 355 mL', 355, 110, 25, 105, 5600, '매장 기준가', null, '공식 영양정보', null, array['피지오','라임','탄산']::text[], 'approved'),
  ('68130676-0925-5c35-a325-cc9701ae013d', 'sb-signature-chocolate-hot', '스타벅스', 'starbucks', '시그니처 초콜릿', 'other', 'Tall 355 mL', 355, 15, 52, 500, 6100, '매장 기준가', null, '공식 영양정보', null, array['초콜릿','핫','코코아']::text[], 'approved'),
  ('6815af97-1c56-501a-afd4-b111ac348f58', 'sb-signature-chocolate-ice', '스타벅스', 'starbucks', '아이스 시그니처 초콜릿', 'other', 'Tall 355 mL', 355, 15, 32, 325, 6100, '매장 기준가', null, '공식 영양정보', null, array['초콜릿','아이스','코코아']::text[], 'approved'),
  ('344fa824-831f-58b5-b009-86165287d242', 'monster-energy', '몬스터', 'monster', '몬스터 에너지', 'energy', '1캔 355 mL', 355, 100, 40, 155, 2300, '편의점 기준가', null, '제품 표시사항', null, array['몬스터','에너지','캔']::text[], 'approved'),
  ('3250c41c-81b3-5307-930e-4868db4f422d', 'monster-ultra', '몬스터', 'monster', '몬스터 에너지 울트라', 'energy', '1캔 355 mL', 355, 100, 0, 10, 2300, '편의점 기준가', null, '제품 표시사항', null, array['몬스터','에너지','울트라','제로']::text[], 'approved'),
  ('87674cff-97f7-53cd-a456-cb10aa8b2f82', 'hot-six', '롯데칠성', 'lotte', '핫식스', 'energy', '1캔 250 mL', 250, 60, 25, 100, 1500, '편의점 기준가', null, '제품 표시사항', null, array['핫식스','에너지','캔']::text[], 'approved'),
  ('26749e1c-70bf-579b-845e-2dd633129fa5', 'red-bull', '레드불', 'redbull', '레드불 에너지 드링크', 'energy', '1캔 250 mL', 250, 62.5, 27, 110, 2500, '편의점 기준가', null, '제품 표시사항', null, array['레드불','에너지','캔']::text[], 'approved'),
  ('f1087ac6-53cc-553d-967b-2e83c8a18ef9', 'bacchus-d', '동아제약', 'bacchus', '박카스D', 'other', '1병 100 mL', 100, 30, 15, 65, null, '기록 시 결제액을 입력하세요', null, '제품 표시사항', null, array['박카스','자양강장','약국']::text[], 'approved'),
  ('c520e421-2e28-5e9d-970f-7a69d9f3ea4c', 'bacchus-f', '동아제약', 'bacchus', '박카스F', 'other', '1병 120 mL', 120, 30, 13, 70, null, '기록 시 결제액을 입력하세요', null, '제품 표시사항', null, array['박카스','자양강장','편의점']::text[], 'approved'),
  ('a9faa0e8-3883-59c9-83ae-07884804ed31', 'coca-cola', '코카콜라', 'cocacola', '코카콜라', 'other', '1캔 355 mL', 355, 34, 39, 150, null, '기록 시 결제액을 입력하세요', null, '제품 표시사항', null, array['콜라','탄산','캔']::text[], 'approved'),
  ('bcfc5e0b-767f-5484-8261-149f8fb28ea0', 'coca-cola-zero', '코카콜라', 'cocacola', '코카콜라 제로', 'other', '1캔 355 mL', 355, 34, 0, 0, null, '기록 시 결제액을 입력하세요', null, '제품 표시사항', null, array['콜라','제로','탄산','캔']::text[], 'approved')
on conflict (id) do update set
  slug = excluded.slug, brand = excluded.brand, brand_key = excluded.brand_key, name = excluded.name,
  category = excluded.category, serving_label = excluded.serving_label, serving_ml = excluded.serving_ml,
  caffeine_mg = excluded.caffeine_mg, sugar_g = excluded.sugar_g, kcal = excluded.kcal,
  base_price = excluded.base_price, price_note = excluded.price_note, tags = excluded.tags,
  status = excluded.status, source = excluded.source,
  updated_at = now();
