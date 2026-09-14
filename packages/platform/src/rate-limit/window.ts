export function windowIndex(nowMs: number, windowMs: number): number {
  return Math.floor(nowMs / windowMs);
}

/** Indeks okna w kluczu sprawia, że nowe okno to nowy klucz — bez polegania na TTL. */
export function windowKey(
  prefix: string,
  bucket: string,
  subject: string,
  nowMs: number,
  windowMs: number,
): string {
  return `${prefix}:${bucket}:${subject}:${windowIndex(nowMs, windowMs)}`;
}

export function retryAfterSeconds(nowMs: number, windowMs: number): number {
  const end = (windowIndex(nowMs, windowMs) + 1) * windowMs;
  return Math.max(1, Math.ceil((end - nowMs) / 1000));
}
