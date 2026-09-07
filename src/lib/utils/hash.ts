import crypto from 'crypto';

export function computeFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function computeRowHash(row: Record<string, unknown>): string {
  const normalized = JSON.stringify(row, Object.keys(row).sort());
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
