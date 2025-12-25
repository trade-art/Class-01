# MT5 Platform SSL Certificates

This directory contains SSL certificates for the MT5 Platform API Gateway.

## Directory Structure

```
ssl/
├── README.md           # This file
├── fullchain.pem       # Full certificate chain
├── privkey.pem         # Private key
├── cert.pem            # Certificate (symlink to fullchain.pem)
├── key.pem             # Key (symlink to privkey.pem)
├── dhparam.pem         # DH parameters (optional, for enhanced security)
└── cert.conf           # Certificate configuration (self-signed only)
```

## Quick Start

### Development (Self-Signed Certificate)

Generate a self-signed certificate for local development:

```bash
# From project root
./scripts/generate-ssl-cert.sh self-signed

# With custom domain
./scripts/generate-ssl-cert.sh self-signed --domain mt5.local
```

**Note:** Self-signed certificates will show security warnings in browsers. You can:
1. Accept the security warning when prompted
2. Import the certificate into your system's trusted store

### Production (Let's Encrypt)

Generate a free Let's Encrypt certificate:

```bash
# Ensure your domain points to this server
# Ensure port 80 is accessible

./scripts/generate-ssl-cert.sh letsencrypt \
    --domain mt5.example.com \
    --email admin@example.com
```

**Prerequisites:**
- Domain must point to this server (A record)
- Port 80 must be accessible from the internet
- certbot must be installed

## Certificate Renewal

### Let's Encrypt Auto-Renewal

Set up automatic renewal with a cron job:

```bash
# Add to crontab (crontab -e)
0 0 1 * * /path/to/mt5-platform/scripts/generate-ssl-cert.sh renew >> /var/log/ssl-renewal.log 2>&1
```

Or use systemd timer:

```bash
# /etc/systemd/system/mt5-ssl-renewal.timer
[Unit]
Description=MT5 SSL Certificate Renewal Timer

[Timer]
OnCalendar=monthly
Persistent=true

[Install]
WantedBy=timers.target
```

### Manual Renewal

```bash
./scripts/generate-ssl-cert.sh renew
```

## Verification

Check current certificate status:

```bash
./scripts/generate-ssl-cert.sh verify
```

This will show:
- Certificate subject and issuer
- Validity dates
- Days until expiration

## Security Best Practices

### DH Parameters

For enhanced security, generate DH parameters:

```bash
./scripts/generate-ssl-cert.sh dhparam
```

This creates a 4096-bit DH parameter file for stronger key exchange.

### File Permissions

Ensure proper permissions:

```bash
chmod 600 privkey.pem dhparam.pem
chmod 644 fullchain.pem cert.pem
```

### Nginx Configuration

The SSL configuration in `ssl.conf` includes:
- TLS 1.2 and 1.3 only
- Strong cipher suites (Mozilla Modern)
- HSTS with 2-year duration
- OCSP Stapling
- Security headers

## Troubleshooting

### Certificate Not Found

```bash
# Regenerate certificate
./scripts/generate-ssl-cert.sh self-signed
```

### Let's Encrypt Rate Limits

If you hit rate limits during testing:

```bash
# Use staging environment
./scripts/generate-ssl-cert.sh letsencrypt \
    --domain mt5.example.com \
    --email admin@example.com \
    --staging
```

### Nginx Not Reloading

```bash
# Manually reload nginx
docker exec mt5-gateway nginx -s reload

# Or restart the container
docker restart mt5-gateway
```

### Check Certificate Chain

```bash
openssl verify -CAfile fullchain.pem fullchain.pem
openssl s_client -connect localhost:443 -servername localhost
```

## Certificate Files Reference

| File | Description | Permission |
|------|-------------|------------|
| `fullchain.pem` | Full certificate chain (cert + intermediates) | 644 |
| `privkey.pem` | Private key (keep secure!) | 600 |
| `cert.pem` | Server certificate (symlink) | 644 |
| `key.pem` | Private key (symlink) | 600 |
| `dhparam.pem` | Diffie-Hellman parameters | 600 |

## Notes

- **Never commit private keys to version control!**
- The `.gitignore` excludes `*.pem` files in this directory
- Backup certificates securely before server migration
- Let's Encrypt certificates expire after 90 days

## Support

For issues with SSL configuration:
1. Check nginx error logs: `docker logs mt5-gateway`
2. Verify certificate: `./scripts/generate-ssl-cert.sh verify`
3. Test SSL: `openssl s_client -connect localhost:443`
