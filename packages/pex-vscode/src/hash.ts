import * as crypto from 'crypto';

// Shared between the markdown-it plugin (which hashes markdown-it's
// `token.content` — typically has a trailing newline) and the commit-side
// fence lookup (which joins document lines without one). Normalizing trailing
// newlines here keeps both sides producing identical digests for the same
// logical PlantUML body.
export function hashSource(s: string): string {
  const normalized = s.replace(/\n+$/, '');
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}
