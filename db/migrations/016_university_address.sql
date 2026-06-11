-- 016 — 대학 주소(address) 컬럼 추가
-- 대학 카드/캘린더에 소재지 주소를 표시하기 위해 university 에 address 컬럼을 둔다.
-- region(시·도, 필터·집계용)과 별개로, 시·군·구 단위 이상의 주소 문자열을 보관한다.
ALTER TABLE university ADD COLUMN IF NOT EXISTS address VARCHAR(255) NULL AFTER region;
