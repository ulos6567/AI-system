/**
 * T027 — 외부 신호 어댑터 (기상청 단기예보, 폴백 mock)
 *   - 실제 KMA API 키 미설정 시 mock 으로 폴백.
 *   - 폴링 결과는 caller(signal-poll job)가 external_signal 테이블로 영속화.
 */
import type { SignalAdapter, ExternalSignal } from '../../ports/signal';
import { logger } from '../../lib/logger';

const KMA_API_KEY = process.env.KMA_API_KEY ?? '';

async function fetchKmaForecast(regionCode: string): Promise<ExternalSignal[]> {
  if (!KMA_API_KEY) {
    return [
      {
        regionCode,
        signalType: 'weather',
        occurredAt: new Date(),
        payload: {
          temp_c: 22 + Math.round(Math.random() * 6 * 10) / 10,
          humidity: 55 + Math.floor(Math.random() * 25),
          rain_mm: Math.random() > 0.8 ? Math.round(Math.random() * 5 * 10) / 10 : 0,
          condition: 'mock_kma',
        },
        source: 'kma-mock',
      },
    ];
  }
  try {
    const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?serviceKey=${KMA_API_KEY}&numOfRows=12&pageNo=1&dataType=JSON&base_date=${ymd()}&base_time=0500&nx=${regionToNx(regionCode)}&ny=${regionToNy(regionCode)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`KMA HTTP ${res.status}`);
    const json: any = await res.json();
    const items: any[] = json?.response?.body?.items?.item ?? [];
    return [
      {
        regionCode,
        signalType: 'weather',
        occurredAt: new Date(),
        payload: { raw: items.slice(0, 12) },
        source: 'kma',
      },
    ];
  } catch (err: any) {
    logger.warn({ err: err.message, regionCode }, 'KMA fetch failed, falling back to mock');
    return fetchKmaForecast(regionCode);
  }
}

function ymd(d = new Date()): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}
function regionToNx(_code: string): number { return 60; }
function regionToNy(_code: string): number { return 127; }

const adapter: SignalAdapter = {
  name: 'weather-kma',
  signalType: 'weather',
  async poll(opts) {
    const region = opts.regionCode ?? '11000';
    return fetchKmaForecast(region);
  },
};

export default adapter;
