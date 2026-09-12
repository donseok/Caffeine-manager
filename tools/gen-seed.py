#!/usr/bin/env python3
"""data/products.seed.json → js/seed-products.js + supabase/seed.sql 생성기.

사용법:  python3 tools/gen-seed.py
- 상품 id 는 slug 로부터 만든 고정 UUID(v5) 라서 여러 번 실행해도 같은 id 가 나온다.
- 로컬 모드와 Supabase 모드가 같은 상품 id 를 공유한다.
"""
import json, uuid, os, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NS = uuid.UUID("6f3a2b1e-9c4d-4e8f-8a11-caffeine00001".replace("caffeine00001", "0000ca44e1ea"))

with open(os.path.join(ROOT, "data", "products.seed.json"), encoding="utf-8") as f:
    items = json.load(f)

def pid(slug):
    return str(uuid.uuid5(NS, slug))

def sql_str(v):
    if v is None:
        return "null"
    return "'" + str(v).replace("'", "''") + "'"

def sql_num(v):
    return "null" if v is None else str(v)

rows = []
for it in items:
    row = {
        "id": pid(it["slug"]),
        "slug": it["slug"],
        "brand": it["brand"],
        "brand_key": it["brand_key"],
        "name": it["name"],
        "category": it["category"],
        "serving_label": it["serving_label"],
        "serving_ml": it.get("serving_ml"),
        "caffeine_mg": it["caffeine_mg"],
        "sugar_g": it.get("sugar_g"),
        "kcal": it.get("kcal"),
        "base_price": it.get("base_price"),
        "price_note": it.get("price_note"),
        "price_checked_at": it.get("price_checked_at"),
        "source": it.get("source"),
        "verified_at": it.get("verified_at"),
        "tags": it.get("tags", []),
        "status": "approved",
    }
    rows.append(row)

# ---- JS ----
js_path = os.path.join(ROOT, "js", "seed-products.js")
with open(js_path, "w", encoding="utf-8") as f:
    f.write("// 자동 생성 파일 — data/products.seed.json 을 고친 뒤 `python3 tools/gen-seed.py` 로 다시 만드세요.\n")
    f.write("// 생성일: %s\n" % datetime.date.today().isoformat())
    f.write("window.CM = window.CM || {};\n")
    f.write("window.CM.SEED_PRODUCTS = ")
    f.write(json.dumps(rows, ensure_ascii=False, indent=1))
    f.write(";\n")

# ---- SQL ----
sql_path = os.path.join(ROOT, "supabase", "seed.sql")
with open(sql_path, "w", encoding="utf-8") as f:
    f.write("-- 자동 생성 파일 — data/products.seed.json 을 고친 뒤 `python3 tools/gen-seed.py` 로 다시 만드세요.\n")
    f.write("-- schema.sql 을 먼저 실행한 뒤 이 파일을 실행하세요. 여러 번 실행해도 안전합니다(upsert).\n")
    f.write("insert into public.products\n  (id, slug, brand, brand_key, name, category, serving_label, serving_ml, caffeine_mg, sugar_g, kcal, base_price, price_note, price_checked_at, source, verified_at, tags, status)\nvalues\n")
    vals = []
    for r in rows:
        tags = "array[" + ",".join(sql_str(t) for t in r["tags"]) + "]::text[]" if r["tags"] else "'{}'::text[]"
        vals.append("  (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)" % (
            sql_str(r["id"]), sql_str(r["slug"]), sql_str(r["brand"]), sql_str(r["brand_key"]), sql_str(r["name"]),
            sql_str(r["category"]), sql_str(r["serving_label"]), sql_num(r["serving_ml"]), sql_num(r["caffeine_mg"]),
            sql_num(r["sugar_g"]), sql_num(r["kcal"]), sql_num(r["base_price"]), sql_str(r["price_note"]),
            sql_str(r["price_checked_at"]), sql_str(r["source"]), sql_str(r["verified_at"]), tags, sql_str(r["status"])))
    f.write(",\n".join(vals))
    f.write("\non conflict (id) do update set\n")
    f.write("  slug = excluded.slug, brand = excluded.brand, brand_key = excluded.brand_key, name = excluded.name,\n")
    f.write("  category = excluded.category, serving_label = excluded.serving_label, serving_ml = excluded.serving_ml,\n")
    f.write("  caffeine_mg = excluded.caffeine_mg, sugar_g = excluded.sugar_g, kcal = excluded.kcal,\n")
    f.write("  base_price = excluded.base_price, price_note = excluded.price_note, tags = excluded.tags,\n")
    f.write("  updated_at = now();\n")

print("generated:", js_path, "(%d products)" % len(rows))
print("generated:", sql_path)
