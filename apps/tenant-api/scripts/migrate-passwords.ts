/**
 * 密码格式迁移脚本
 * 将旧格式 (ivHex:authTagHex:encrypted) 迁移到新格式 (Base64(nonce || ciphertext || tag))
 *
 * 使用方法: npx ts-node scripts/migrate-passwords.ts
 */

import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 旧密钥派生方式
const OLD_ENCRYPTION_KEY = process.env.MT_SERVER_ENCRYPTION_KEY || 'mt5platform2024encryptionkey1234';
const ALGORITHM = 'aes-256-gcm';

/**
 * 派生新格式的加密密钥
 * 重要: 必须使用与 C++ 中间件相同的 64 字符十六进制密钥
 */
function deriveNewEncryptionKey(): Buffer {
  // 强制使用中间件的十六进制密钥
  const hexKey = '438eca4f30898e7e7e565da15339702b1fc2e253e3ce1ac3aadd30f7173126d0';
  return Buffer.from(hexKey, 'hex');
}

/**
 * 旧格式解密
 */
function decryptOldFormat(encryptedPassword: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedPassword.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  // 旧格式使用 scrypt 派生密钥
  const key = crypto.scryptSync(OLD_ENCRYPTION_KEY, 'salt', 32);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * 新格式加密: Base64(nonce(12) || ciphertext || tag(16))
 */
function encryptNewFormat(password: string): string {
  const nonce = crypto.randomBytes(12);
  const key = deriveNewEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, nonce);

  const encrypted = Buffer.concat([
    cipher.update(password, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // 格式: Base64(nonce || ciphertext || tag)
  const combined = Buffer.concat([nonce, encrypted, authTag]);
  return combined.toString('base64');
}

/**
 * 解密当前格式 (SHA256 派生密钥 + Base64)
 */
function decryptCurrentFormat(encryptedPassword: string): string {
  const NONCE_SIZE = 12;
  const TAG_SIZE = 16;

  const data = Buffer.from(encryptedPassword, 'base64');

  if (data.length < NONCE_SIZE + TAG_SIZE) {
    throw new Error(`密文太短: ${data.length} 字节`);
  }

  const nonce = data.subarray(0, NONCE_SIZE);
  const authTag = data.subarray(data.length - TAG_SIZE);
  const ciphertext = data.subarray(NONCE_SIZE, data.length - TAG_SIZE);

  // 使用 SHA256 派生密钥（与之前的加密方式一致）
  const key = crypto.createHash('sha256').update(OLD_ENCRYPTION_KEY).digest();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, nonce);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * 检测密码格式
 */
function isOldFormat(encryptedPassword: string): boolean {
  return encryptedPassword.includes(':');
}

/**
 * 检测是否需要重新加密（使用 SHA256 派生密钥而非十六进制密钥）
 */
function needsReEncryption(encryptedPassword: string): boolean {
  // 新格式不包含冒号，但可能使用了错误的密钥
  return !encryptedPassword.includes(':');
}

async function main() {
  console.log('=== 密码格式迁移脚本 (修复版) ===\n');
  console.log('目标: 将所有密码迁移到使用十六进制密钥的新格式\n');

  // 获取所有 Manager
  const managers = await prisma.mtManager.findMany({
    select: {
      id: true,
      managerLogin: true,
      managerPasswordEncrypted: true,
    },
  });

  console.log(`找到 ${managers.length} 个 Manager 账号\n`);

  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const manager of managers) {
    const pwd = manager.managerPasswordEncrypted;

    try {
      let plainPassword: string;

      if (isOldFormat(pwd)) {
        // 旧格式: ivHex:authTagHex:encrypted (使用 scrypt 派生密钥)
        console.log(`[格式] Manager ${manager.managerLogin}: 检测到旧格式 (冒号分隔)`);
        plainPassword = decryptOldFormat(pwd);
      } else if (needsReEncryption(pwd)) {
        // 当前格式: Base64 但使用 SHA256 派生密钥
        console.log(`[格式] Manager ${manager.managerLogin}: 检测到当前格式 (需要重新加密)`);
        plainPassword = decryptCurrentFormat(pwd);
      } else {
        console.log(`[跳过] Manager ${manager.managerLogin}: 已是正确格式`);
        skippedCount++;
        continue;
      }

      console.log(`[解密] Manager ${manager.managerLogin}: 成功解密密码`);

      // 使用正确的十六进制密钥重新加密
      const newEncrypted = encryptNewFormat(plainPassword);
      console.log(`[加密] Manager ${manager.managerLogin}: 使用十六进制密钥重新加密`);

      // 更新数据库
      await prisma.mtManager.update({
        where: { id: manager.id },
        data: { managerPasswordEncrypted: newEncrypted },
      });

      console.log(`[更新] Manager ${manager.managerLogin}: 数据库已更新\n`);
      migratedCount++;

    } catch (error) {
      console.error(`[错误] Manager ${manager.managerLogin}: ${error}\n`);
      errorCount++;
    }
  }

  console.log('\n=== 迁移完成 ===');
  console.log(`迁移成功: ${migratedCount}`);
  console.log(`跳过: ${skippedCount}`);
  console.log(`错误: ${errorCount}`);
}

main()
  .catch((error) => {
    console.error('迁移失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
