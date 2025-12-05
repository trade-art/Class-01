# MT5 Platform API Gateway

Multi-tenant API Gateway configuration for routing traffic based on tenant deployment mode.

## Architecture

```
                    ┌─────────────┐
                    │   Clients   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Gateway   │ (Nginx)
                    │  (Port 80)  │
                    └──────┬──────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
     ┌──────▼──────┐ ┌─────▼─────┐ ┌──────▼──────┐
     │ tenant-api  │ │  WebSocket │ │   Static    │
     │  (/api/*)   │ │   (/ws)    │ │   Files     │
     └──────┬──────┘ └─────┬─────┘ └─────────────┘
            │              │
            ▼              ▼
     ┌─────────────────────────────────┐
     │      Middleware Routing          │
     ├─────────────┬───────────────────┤
     │   SHARED    │    DEDICATED      │
     ├─────────────┼───────────────────┤
     │ middleware- │ middleware-acme   │
     │ shared-1/2  │ middleware-enter  │
     └─────────────┴───────────────────┘
```

## Deployment Modes

### SHARED Mode (Default)
- Small/medium tenants share middleware instances
- Load balanced across `middleware-shared-1` and `middleware-shared-2`
- Cost-effective for low-traffic tenants

### DEDICATED Mode
- Large tenants have dedicated middleware instances
- Full resource isolation
- Custom scaling per tenant
- Higher cost, better performance

## Configuration

### 1. Update Tenant Routing Map

Edit `nginx.conf` to add new dedicated tenants:

```nginx
map $http_x_tenant_code $middleware_upstream {
    default         "middleware_shared";
    "acme"          "middleware_acme";      # Dedicated
    "enterprise"    "middleware_enterprise"; # Dedicated
    "new_tenant"    "middleware_new_tenant"; # Add new dedicated tenant
}
```

### 2. Add Upstream for Dedicated Tenant

```nginx
upstream middleware_new_tenant {
    server middleware-new-tenant:8080 weight=1 max_fails=3 fail_timeout=30s;
    keepalive 8;
}
```

### 3. Add Service in docker-compose.gateway.yml

```yaml
middleware-new-tenant:
  image: mt5-middleware:latest
  container_name: mt5-middleware-new-tenant
  environment:
    - MIDDLEWARE_MODE=dedicated
    - TENANT_CODE=new_tenant
  expose:
    - "8080"
  networks:
    - mt5-network
```

## Usage

### Start Gateway

```bash
cd docker/nginx
docker-compose -f docker-compose.gateway.yml up -d
```

### Check Health

```bash
# Gateway health
curl http://localhost/nginx-health

# Backend readiness
curl http://localhost/ready
```

### View Logs

```bash
docker logs -f mt5-gateway
```

### Reload Configuration

```bash
docker exec mt5-gateway nginx -s reload
```

## Headers

The gateway passes the following tenant headers:

| Header | Description |
|--------|-------------|
| `X-Tenant-Id` | Tenant UUID |
| `X-Tenant-Code` | Tenant code (e.g., "acme") |
| `X-Server-Id` | MT server ID within tenant |
| `X-Deployment-Mode` | "SHARED" or "DEDICATED" |

## Rate Limiting

- Global: 100 requests/second per IP
- Per tenant: 1000 requests/second
- Burst allowance: 50-200 requests

## SSL/TLS

To enable HTTPS:

1. Place certificates in `./ssl/` directory:
   - `cert.pem` - SSL certificate
   - `key.pem` - Private key

2. Uncomment the HTTPS server block in `nginx.conf`

3. Restart gateway:
   ```bash
   docker-compose -f docker-compose.gateway.yml restart gateway
   ```
