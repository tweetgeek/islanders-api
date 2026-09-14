const MASK_31 = 0x7fffffffn;

/**
 * 31-bitowy hasz komórki, dosłownie z `WorldGrid.hash_cell` klienta (ADR 0001, załącznik pkt 1).
 * Każdy krok liczony na BigInt: iloczyn pośredni sięga 2,7e18, poza Number.MAX_SAFE_INTEGER,
 * a operatory bitowe na number działają tylko na 32 bitach. Konwersja do number dopiero na końcu,
 * gdzie wynik ma gwarantowane 31 bitów.
 */
export function hashCell(seed: number, x: number, y: number): number {
  let h = BigInt(seed) & MASK_31;
  h = (h * 31n + BigInt(x) + 1000003n) & MASK_31;
  h = (h * 31n + BigInt(y) + 1000033n) & MASK_31;
  h = ((h ^ (h >> 13n)) * 1274126177n) & MASK_31;
  return Number(h);
}

/** `WorldGrid.hash01`: (h % 10007) / 10007, w [0, 1). Wejście nieujemne, więc number wystarcza. */
export function hash01(h: number): number {
  return (h % 10007) / 10007.0;
}
