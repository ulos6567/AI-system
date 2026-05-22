/**
 * T046 — SSE 컴포저블 (EventSource 자동 재연결, 지수 백오프)
 *
 *   사용 예:
 *     const { connected, lastEvent } = useEventStream(`/api/stores/${id}/events/stream`,
 *       { onEvent: msg => ... , onNotification: msg => ... });
 *
 *   브라우저 EventSource 는 끊김 시 자동 재연결이 기본이지만 백오프 제어가 없으므로
 *   onerror 발생 시 명시적으로 close → setTimeout(reconnect) 로 갱신한다.
 */
import { ref, onMounted, onBeforeUnmount } from 'vue';

interface UseEventStreamOpts {
  onEvent?: (data: unknown) => void;
  onNotification?: (data: unknown) => void;
  onMessage?: (type: string, data: unknown) => void;
  withCredentials?: boolean;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
}

export function useEventStream(url: string, opts: UseEventStreamOpts = {}) {
  const connected = ref(false);
  const reconnects = ref(0);
  const lastError = ref<string | null>(null);
  const lastEventAt = ref<string | null>(null);

  let es: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let backoff = opts.initialBackoffMs ?? 1000;
  const maxBackoff = opts.maxBackoffMs ?? 30_000;

  function attach(): void {
    if (stopped) return;
    try {
      es = new EventSource(url, { withCredentials: opts.withCredentials ?? true });
    } catch (err: any) {
      lastError.value = err?.message ?? 'eventsource_init_failed';
      schedule();
      return;
    }

    es.onopen = () => {
      connected.value = true;
      backoff = opts.initialBackoffMs ?? 1000;
      lastError.value = null;
    };
    es.onerror = () => {
      connected.value = false;
      lastError.value = 'connection_lost';
      es?.close();
      es = null;
      schedule();
    };

    es.addEventListener('event', (e: MessageEvent) => {
      lastEventAt.value = new Date().toISOString();
      try {
        const data = JSON.parse(e.data);
        opts.onEvent?.(data);
        opts.onMessage?.('event', data);
      } catch { /* ignore parse errors */ }
    });
    es.addEventListener('notification', (e: MessageEvent) => {
      lastEventAt.value = new Date().toISOString();
      try {
        const data = JSON.parse(e.data);
        opts.onNotification?.(data);
        opts.onMessage?.('notification', data);
      } catch { /* ignore */ }
    });
  }

  function schedule(): void {
    reconnects.value += 1;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      backoff = Math.min(maxBackoff, backoff * 2);
      attach();
    }, backoff);
  }

  function close(): void {
    stopped = true;
    if (timer) clearTimeout(timer);
    es?.close();
    es = null;
    connected.value = false;
  }

  onMounted(attach);
  onBeforeUnmount(close);

  return { connected, reconnects, lastError, lastEventAt, close };
}
