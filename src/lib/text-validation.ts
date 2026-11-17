/** ASCII C0 controls and DEL are unsafe in single-line labels and evidence URLs. */
export function hasAsciiControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}
