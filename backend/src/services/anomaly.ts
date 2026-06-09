/**
 * 002 (T025) — 이상 징후 서비스 (FR-014~016)
 *
 *   - ingestAnomaly: 수신 이벤트를 anomaly_event 로 저장하고 즉시 점주에게 알림(30초 SLA, SC-005).
 *     알림은 기존 감사·디스패처(push/SSE) 인프라를 재사용한다(audit → dispatch).
 *   - 심각도 ≥ ESCALATE_SEVERITY 인 경우 외부 관제로 전파(escalated=true) — 시뮬레이션 훅(FR-015).
 *   - feedbackAnomaly: 점주 오탐 피드백/대응 결과 기록(FR-016) + 감사.
 */
import { getPool } from '../db/pool';
import { audit } from '../lib/audit';
import type { AnomalySignal, AnomalyType } from '../ports/anomaly';

const ESCALATE_SEVERITY = 4; // collapse(5)/intrusion(4) → 외부 관제 전파

const TYPE_LABEL: Record<AnomalyType, string> = {
  unpaid_exit: '미결제 퇴장',
  disturbance: '소란 발생',
  collapse: '고객 쓰러짐',
  intrusion: '외부 침입',
};

export interface AnomalyRow {
  id: number;
  storeId: number;
  anomalyType: AnomalyType;
  severity: number;
  zoneCode: string | null;
  detectedAt: string;
  notifiedAt: string | null;
  escalated: boolean;
  falsePositive: boolean | null;
  resolution: string | null;
}

/** 이상 이벤트 수신 → 저장 → 즉시 알림(SLA) → 임계 시 관제 전파. 저장된 id 반환. */
export async function ingestAnomaly(signal: AnomalySignal): Promise<number> {
  const pool = getPool();
  const now = new Date();
  const escalate = signal.severity >= ESCALATE_SEVERITY;
  const [res]: any = await pool.query(
    `INSERT INTO anomaly_event
       (store_id, anomaly_type, severity, zone_code, detected_at, snapshot_ref, notified_at, escalated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      signal.storeId,
      signal.anomalyType,
      signal.severity,
      signal.zoneCode ?? null,
      signal.detectedAt,
      signal.snapshotRef ?? null,
      now, // notified_at — 저장과 동시에 알림 발송(SLA 보장)
      escalate ? 1 : 0,
    ],
  );
  const id = res.insertId as number;

  const label = TYPE_LABEL[signal.anomalyType] ?? signal.anomalyType;
  const severity = signal.severity >= 4 ? 'critical' : 'warn';
  // audit → event-dispatcher 가 점포 STORE_OWNER/STAFF 에게 SSE + notification 즉시 전송
  await audit({
    storeId: signal.storeId,
    severity,
    eventType: 'anomaly_notified',
    message: `${label} 감지 (구역 ${signal.zoneCode ?? '-'}, 심각도 ${signal.severity})`,
    metadata: {
      anomalyId: id,
      anomalyType: signal.anomalyType,
      zoneCode: signal.zoneCode ?? null,
      severity: signal.severity,
      escalated: escalate,
    },
  });

  if (escalate) {
    // 외부 관제 전파 시뮬레이션 (FR-015)
    await audit({
      storeId: signal.storeId,
      severity: 'critical',
      eventType: 'anomaly_escalated',
      message: `${label} — 외부 관제센터 전파`,
      metadata: { anomalyId: id, anomalyType: signal.anomalyType },
    });
  }
  return id;
}

export async function listAnomalies(
  storeId: number,
  opts: { limit?: number; falsePositive?: boolean } = {},
): Promise<AnomalyRow[]> {
  const pool = getPool();
  const args: any[] = [storeId];
  let where = 'store_id = ?';
  if (opts.falsePositive !== undefined) {
    where += ' AND false_positive = ?';
    args.push(opts.falsePositive ? 1 : 0);
  }
  const limit = Math.min(500, opts.limit ?? 100);
  const [rows] = await pool.query<any[]>(
    `SELECT id, store_id AS storeId, anomaly_type AS anomalyType, severity,
            zone_code AS zoneCode, detected_at AS detectedAt, notified_at AS notifiedAt,
            escalated, false_positive AS falsePositive, resolution
       FROM anomaly_event
      WHERE ${where}
      ORDER BY detected_at DESC
      LIMIT ${limit}`,
    args,
  );
  return rows.map((r) => ({
    ...r,
    escalated: !!r.escalated,
    falsePositive: r.falsePositive === null ? null : !!r.falsePositive,
  }));
}

/** 점주 피드백: 오탐 여부/대응 결과 기록 (FR-016) + 감사. */
export async function feedbackAnomaly(
  id: number,
  userId: number | null,
  body: { falsePositive?: boolean; resolution?: string },
): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(`SELECT store_id, anomaly_type FROM anomaly_event WHERE id = ?`, [id]);
  if (!rows.length) throw new Error('anomaly_not_found');
  const ev = rows[0];
  await pool.query(
    `UPDATE anomaly_event
        SET false_positive = ?, resolution = ?
      WHERE id = ?`,
    [
      body.falsePositive === undefined ? null : body.falsePositive ? 1 : 0,
      body.resolution ?? null,
      id,
    ],
  );
  await audit({
    storeId: Number(ev.store_id),
    userId,
    eventType: 'anomaly_feedback',
    message: `이상 이벤트 #${id} 피드백 (오탐=${body.falsePositive ? 'Y' : 'N'})`,
    metadata: { anomalyId: id, falsePositive: body.falsePositive ?? null, resolution: body.resolution ?? null },
  });
}

/** 최근 알림 SLA 통계 (탐지→알림 지연) — 데모/검증용. */
export async function anomalySlaStats(storeId: number): Promise<{ count: number; maxDelaySec: number }> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS count,
            COALESCE(MAX(TIMESTAMPDIFF(SECOND, detected_at, notified_at)), 0) AS maxDelaySec
       FROM anomaly_event
      WHERE store_id = ? AND notified_at IS NOT NULL`,
    [storeId],
  );
  return { count: Number(rows[0]?.count ?? 0), maxDelaySec: Number(rows[0]?.maxDelaySec ?? 0) };
}
