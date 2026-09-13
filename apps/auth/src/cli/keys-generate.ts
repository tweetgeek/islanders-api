import { generateSigningKeyEntry } from '../keys/generate-signing-key.js';

const entry = await generateSigningKeyEntry();
console.log(
  [
    'Nowy wpis do JWT_SIGNING_KEYS (klucz prywatny — traktuj jak sekret).',
    'Rotacja: dodaj go jako "active", poprzedni aktywny oznacz "retiring",',
    'a usuń go najwcześniej po JWT_ACCESS_TTL + 5 minut cache JWKS.',
    '',
    JSON.stringify(entry),
  ].join('\n'),
);
