import * as crypto from 'crypto';

export function calculateNewVersionTopicId(mac: string): string {
  const cipher = crypto.createCipheriv(
    'aes-128-cbc',
    Buffer.from('!@#$%^&*()_+{}[]'),
    Buffer.alloc(16, 0),
  );
  const encrypted = Buffer.concat([cipher.update(mac, 'utf8'), cipher.final()]);
  return encrypted.toString('hex');
}
