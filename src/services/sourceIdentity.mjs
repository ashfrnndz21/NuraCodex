const SHA256_HEX = /^[a-f0-9]{64}$/i;

export function sourceSha256Matches(expected, actual) {
  return typeof expected === 'string'
    && typeof actual === 'string'
    && SHA256_HEX.test(expected)
    && SHA256_HEX.test(actual)
    && expected.toLowerCase() === actual.toLowerCase();
}
