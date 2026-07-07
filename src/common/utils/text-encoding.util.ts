export function normalizeMojibake(text: string): string {
  if (!text) return text;

  const maybeMojibake = /Ã|Â|â€|â€™|â€œ|â€|â€“|â€”/.test(text);
  if (!maybeMojibake) return text;

  try {
    const decoded = Buffer.from(text, 'latin1').toString('utf8');
    return decoded || text;
  } catch {
    return text;
  }
}
