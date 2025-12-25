const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// 中间件实际配置
const jwtSecret = 'mt5_middleware_dev_secret_key_2025_please_change_in_production';
const encryptionKeyHex = '438eca4f30898e7e7e565da15339702b1fc2e253e3ce1ac3aadd30f7173126d0';
const encryptionKey = Buffer.from(encryptionKeyHex, 'hex');
const issuer = 'tenant-api';

// 加密函数 - 使用 C++ 中间件期望的格式: nonce || ciphertext || tag
function encryptPassword(password) {
  const iv = crypto.randomBytes(12);  // 12 bytes nonce
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(password, 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();  // 16 bytes tag
  
  // C++ 格式: nonce(12) + ciphertext + tag(16)
  const combined = Buffer.concat([iv, encrypted, authTag]);
  return combined.toString('base64');
}

// Token 生成
const payload = {
  tenantId: 'tenant-test-001',
  instanceId: 'inst_tenant-test-001_demo-mt5-server',
  serverId: 'demo-mt5-server',
  managerLogin: 10007,
  encryptedPassword: encryptPassword('-2TqZnTl'),
  scopes: ['*']
};

const token = jwt.sign(payload, jwtSecret, {
  algorithm: 'HS256',
  expiresIn: 3600,
  issuer: issuer,
  header: { alg: 'HS256', typ: 'JWT' }
});

console.log(token);
