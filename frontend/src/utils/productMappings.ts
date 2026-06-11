// 상품 코드 관리(매핑)의 단일 출처 — '상품 코드 관리'와 '발주 관리'가 동일한
// '등록된 점포 지정 상품' 집합을 공유하도록 로딩·모킹·집계 로직을 한곳에 둔다.
// (한쪽만 바꾸면 두 화면의 상품 구성이 어긋나므로 변환 규칙을 단일 출처로 둔다.)
import { api } from '@/api/client';

export interface MappingRow {
  id: number;
  localCode: string;
  localName: string;
  productMasterId: number | null;
  productName: string | null;
  category: string | null;
  barcode: string | null;
  confidence: number;
  status: 'auto' | 'confirmed' | 'rejected' | 'pending';
  updatedAt: string;
}

// 캔버스 '파편화된 등록 방식' 시연용 — 점주가 제각각 등록한 날것의 데이터 예시.
// 확정 완료에만 쏠린 mock 분포를 AI 자동 매핑/검토 대기로 분산시켜 '인간의 최종 판단'을 드러낸다.
// 점주가 등록한 날것의 localName(좌측) → AI가 제안하는 '표준 마스터 상품명'(우측).
// 표준 마스터 상품명/마스터 ID 는 반드시 실제 product_master 에 존재하는 값이어야 한다.
const fragmentedExamples: Array<{
  localName: string;
  productName: string | null;
  productMasterId: number | null; // 표준 상품명과 정합되는 실제 마스터 ID
  category: string | null;
  confidence: number;
  status: 'auto' | 'pending' | 'rejected';
  clearMaster?: boolean; // 제외된 비매핑(쓰레기) 행은 마스터 연결을 끊는다
}> = [
  // AI 자동 매핑 (auto) — AI가 높은 신뢰도로 자동 연결, 점주 확정 대기
  { localName: '코카제로캔', productName: '제로콜라 500ml', productMasterId: 3, category: 'beverage', confidence: 0.97, status: 'auto' },
  { localName: '포카칩', productName: '포카칩 오리지널', productMasterId: 9, category: 'snack', confidence: 0.96, status: 'auto' },
  { localName: '비타민워터', productName: '비타민워터 500ml', productMasterId: 22, category: 'beverage', confidence: 0.95, status: 'auto' },
  // 검토 대기 (pending) — 신뢰도가 낮아 점주의 최종 판단이 필요
  { localName: '신라면컵', productName: '컵라면 신라면', productMasterId: 16, category: 'instant', confidence: 0.63, status: 'pending' },
  // 제외됨 (rejected) — 상품이 아니거나 매핑 불가하여 점주가 제외 처리
  { localName: '비닐봉투(대)', productName: null, productMasterId: null, category: null, confidence: 0.08, status: 'rejected', clearMaster: true },
];

// 확정 완료 행 일부를 파편화 예시로 치환 → counts(검토 대기/AI 자동 매핑/확정 완료/제외됨)가 자연 분산
export function applyMockDistribution(rows: MappingRow[]): MappingRow[] {
  const out = rows.map((r) => ({ ...r }));
  let ei = 0;
  for (const row of out) {
    if (ei >= fragmentedExamples.length) break;
    if (row.status === 'confirmed' && row.productMasterId != null) {
      const ex = fragmentedExamples[ei++];
      row.localName = ex.localName;
      row.productName = ex.productName;
      row.category = ex.category;
      row.confidence = ex.confidence;
      row.status = ex.status;
      // 표준 상품명과 마스터 ID 가 어긋나지 않도록 함께 갱신(분류 변경 드롭다운 정합)
      row.productMasterId = ex.clearMaster ? null : ex.productMasterId;
    }
  }
  return out;
}

// 매핑 전체를 로드(모킹 분포 적용 후) — 두 화면이 동일한 데이터를 본다.
export async function loadProductMappings(storeId: number): Promise<MappingRow[]> {
  const r = await api<{ mappings: MappingRow[] }>(`/stores/${storeId}/product-mappings`);
  return applyMockDistribution(r.mappings);
}

// 등록된 '점포 지정 상품' = 확정 완료(confirmed)되어 표준 마스터에 연결된 매핑.
// (AI 자동 매핑·검토 대기·제외됨은 아직 점주가 확정하지 않았으므로 발주 대상에서 제외)
export function registeredMasterIds(rows: MappingRow[]): Set<number> {
  const ids = new Set<number>();
  for (const m of rows) {
    if (m.status === 'confirmed' && m.productMasterId != null) ids.add(m.productMasterId);
  }
  return ids;
}
