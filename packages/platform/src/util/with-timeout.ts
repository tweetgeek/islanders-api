export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`przekroczono limit czasu ${ms} ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Klient Redisa ma `maxRetriesPerRequest: null` (wymóg BullMQ), więc przy zerwanym połączeniu
 * polecenie czeka w nieskończoność zamiast się wywrócić. Każde wywołanie, które ma prawo
 * zawieść szybko, owijamy tym limitem.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    // Przegrana obietnica (oryginalne polecenie Redisa) żyje dalej w tle — bez tego jej
    // spóźnione odrzucenie, gdy w końcu przyjdzie, ujawnia się jako unhandled rejection.
    promise.catch(() => {});
  }
}
