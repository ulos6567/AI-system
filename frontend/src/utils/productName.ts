// 점포 지정 상품명 표기 규칙 — '상품 코드 관리'와 '발주 관리'가 동일한 명칭을 노출하도록 공유한다.
// (한쪽만 바꾸면 두 화면의 상품명이 어긋나므로 변환 규칙을 단일 출처로 둔다.)

// 특정 상품(마스터 ID)에 대한 점포의 현장 등록 명칭 — base 이름을 덮어쓴다.
export const localNameOverride: Record<number, string> = {
  24: '햄치즈샌드(현장등록)', // 샌드위치 햄치즈
  1: '삼다수500', //          삼다수 500ml
  2: '코카500 PET', //        코카콜라 500ml
  3: '코카제로500', //        제로콜라 500ml
};

// 점포 지정 상품명 표기 정제: 등록 명칭을 짧고 일관된 표기로 치환
// (표준 마스터 상품명은 canonical 값 그대로 유지)
export const localNameRenames: Record<string, string> = {
  '코카500 PET': '코카콜라500미리',
  '아메리카노 컵': '아메리카노',
  '바나나우유 240ml': '바나나우유',
  '딸기우유 240ml': '딸기우유',
  '포카칩 오리지널': '포카칩',
  '삼각김밥 참치': '참치 삼각김밥',
  '삼각김밥 전주비빔': '전주비빔 삼각김밥',
  '컵라면 신라면': '신라면 컵',
  '컵라면 진라면': '진라면 컵',
  '아이스크림 메로나': '메로나 아이스',
  '아이스크림 비비빅': '비비빅 아이스',
  '에너지바 단백질': '단백질 에너지바',
  '비타민워터 500ml': '비타민워터',
  '녹차 티백 20입': '녹차 티백',
  '핫바 매콤': '매콤 핫바',
  '닭가슴살 100g': '닭가슴살',
};

// 점포 지정 상품명: 마스터 ID 우선 override, 그 외엔 base 이름에 renames 적용
export function storeLocalName(productMasterId: number | null | undefined, baseName: string): string {
  const base =
    productMasterId != null && localNameOverride[productMasterId]
      ? localNameOverride[productMasterId]
      : baseName;
  return localNameRenames[base] ?? base;
}
