import * as crypto from 'crypto';

const key = Buffer.from('!@#$%^&*()_+{}[]');
const iv = Buffer.alloc(16, 0);
export function calculateNewVersionTopicId(mac: string): string {
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(mac, 'utf8'), cipher.final()]);
  return encrypted.toString('hex');
}

export function decryptNewVersionTopicId(encrypted: string): string {
  const cipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([cipher.update(Buffer.from(encrypted, 'hex')), cipher.final()]).toString(
    'utf8',
  );
}
