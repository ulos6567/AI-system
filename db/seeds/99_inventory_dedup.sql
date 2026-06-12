-- 99_inventory_dedup — 재고 중복행 정리 (마지막에 실행)
--   inventory 의 UNIQUE KEY 가 (store_id, product_master_id, expires_at) 라
--   expires_at 이 NULL 이거나 시드가 다른 날짜에 재실행되면 같은 상품이 여러 행으로 쌓인다.
--   → 캠퍼스 '권장 재고 조정' 표에 동일 상품이 중복 노출되는 원인.
--   (store_id, product_master_id) 당 가장 이른 id 행 하나만 남기고 나머지를 제거한다. 멱등.
DELETE dup
  FROM inventory dup
  JOIN inventory keep
    ON keep.store_id = dup.store_id
   AND keep.product_master_id = dup.product_master_id
   AND keep.id < dup.id;
