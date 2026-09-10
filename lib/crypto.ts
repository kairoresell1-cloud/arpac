import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
function key(secret: string) {
  const bytes = Buffer.from(secret, 'base64');
  if (bytes.length !== 32) throw new Error('APP_ENCRYPTION_KEY deve contenere 32 byte in base64.');
  return bytes;
}
export function encrypt(value: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    data.toString('base64'),
  ].join('.');
}
export function decrypt(value: string, secret: string) {
  const [iv, tag, data] = value.split('.');
  const cipher = createDecipheriv('aes-256-gcm', key(secret), Buffer.from(iv, 'base64'));
  cipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([cipher.update(Buffer.from(data, 'base64')), cipher.final()]).toString(
    'utf8',
  );
}
