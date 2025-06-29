# 🚀 Deployment Guide

This guide covers various deployment options for the Scrum Poker application.

## 📋 Prerequisites

- Node.js 18+
- Git
- Optional: Redis instance
- Optional: Domain name with SSL certificate

## 🌐 Platform-Specific Deployments

### Render.com (Recommended)

Render provides automatic deployments with built-in SSL and CDN.

**Steps:**

1. Fork this repository to your GitHub account
2. Connect your GitHub account to Render
3. Create a new Web Service
4. Configure the following:

```yaml
# render.yaml (already included)
services:
  - type: web
    name: scrum-poker
    env: node
    buildCommand: npm run build
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: MAX_SESSIONS
        value: 100
      - key: SESSION_TIMEOUT
        value: 86400000
```

**Environment Variables:**

- `REDIS_URL`: Add Redis add-on for session persistence
- `CORS_ORIGIN`: Your domain (e.g., `https://yourapp.onrender.com`)

### Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

**Environment Variables:**

```bash
railway variables set NODE_ENV=production
railway variables set MAX_SESSIONS=100
railway variables set REDIS_URL=${{Railway.REDIS_URL}}
```

### Heroku

```bash
# Install Heroku CLI
npm install -g heroku

# Create app
heroku create your-scrum-poker-app

# Add Redis addon
heroku addons:create heroku-redis:mini

# Deploy
git push heroku main
```

**Procfile:**

```
web: npm start
```

### DigitalOcean App Platform

```yaml
# .do/app.yaml
name: scrum-poker
services:
  - name: web
    source_dir: /
    github:
      repo: your-username/scrum-poker
      branch: main
    run_command: npm start
    build_command: npm run build
    environment_slug: node-js
    instance_count: 1
    instance_size_slug: basic-xxs
    envs:
      - key: NODE_ENV
        value: production
databases:
  - name: redis
    engine: REDIS
    version: '6'
```

### AWS Elastic Beanstalk

```bash
# Install EB CLI
pip install awsebcli

# Initialize and deploy
eb init scrum-poker
eb create production
eb deploy
```

**Configuration:**

- Platform: Node.js 18 running on 64bit Amazon Linux 2
- Environment Variables: Set via EB console
- Redis: Use ElastiCache for session storage

### Google Cloud Run

```bash
# Build container
gcloud builds submit --tag gcr.io/PROJECT-ID/scrum-poker

# Deploy
gcloud run deploy --image gcr.io/PROJECT-ID/scrum-poker --platform managed
```

**Dockerfile optimization for Cloud Run:**

```dockerfile
# Multi-stage build for smaller image
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
RUN npm run build
EXPOSE 8080
CMD ["npm", "start"]
```

## 🐳 Docker Deployment

### Docker Compose (Recommended for self-hosting)

```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: .
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
      - MAX_SESSIONS=100
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data

  nginx:
    image: nginx:alpine
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - app
    restart: unless-stopped

volumes:
  redis_data:
```

### Single Container

```bash
# Build and run
docker build -t scrum-poker .
docker run -p 3000:3000 -e NODE_ENV=production scrum-poker
```

## ⚙️ Configuration

### Environment Variables

| Variable                | Description             | Default           | Required |
| ----------------------- | ----------------------- | ----------------- | -------- |
| `NODE_ENV`              | Environment             | development       | No       |
| `PORT`                  | Server port             | 3000              | No       |
| `REDIS_URL`             | Redis connection        | -                 | No       |
| `MAX_SESSIONS`          | Max concurrent sessions | 50                | No       |
| `SESSION_TIMEOUT`       | Session expiry (ms)     | 86400000          | No       |
| `CORS_ORIGIN`           | CORS origins            | \*                | No       |
| `TRUST_PROXY`           | Trust proxy headers     | false             | No       |
| `JIRA_STORYPOINT_FIELD` | Jira field ID           | customfield_10016 | No       |

### Nginx Configuration

```nginx
events {
    worker_connections 1024;
}

http {
    upstream scrum_poker {
        server app:3000;
    }

    server {
        listen 80;
        server_name your-domain.com;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl;
        server_name your-domain.com;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;

        location / {
            proxy_pass http://scrum_poker;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }
    }
}
```

## 🔒 Security Considerations

### Production Checklist

- [ ] Enable HTTPS/SSL
- [ ] Set `NODE_ENV=production`
- [ ] Configure `CORS_ORIGIN` to your domain
- [ ] Use environment variables for secrets
- [ ] Enable `TRUST_PROXY` if behind a proxy
- [ ] Set up monitoring and logging
- [ ] Configure automated backups (Redis)
- [ ] Implement rate limiting at the proxy level
- [ ] Regular security updates

### SSL/TLS Setup

**Let's Encrypt with Certbot:**

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Generate certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo crontab -e
0 12 * * * /usr/bin/certbot renew --quiet
```

### Firewall Configuration

```bash
# Ubuntu/Debian with ufw
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

## 📊 Monitoring

### Health Checks

The application provides health check endpoints:

```bash
# Basic health check
curl https://your-domain.com/api/health

# Server statistics
curl https://your-domain.com/api/stats
```

### Log Management

```bash
# PM2 for process management
npm install -g pm2
pm2 start npm --name "scrum-poker" -- start
pm2 save
pm2 startup

# View logs
pm2 logs scrum-poker
```

### Monitoring Tools

**Recommended monitoring solutions:**

- **Uptime**: UptimeRobot, StatusCake
- **Performance**: New Relic, DataDog
- **Errors**: Sentry, Rollbar
- **Logs**: LogRocket, Papertrail

## 🔄 Backup and Recovery

### Redis Backup

```bash
# Manual backup
redis-cli --rdb /backup/dump.rdb

# Automated backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
redis-cli --rdb /backup/dump_$DATE.rdb
find /backup -name "dump_*.rdb" -mtime +7 -delete
```

### Application Backup

```bash
# Backup deployment
tar -czf scrum-poker-backup-$(date +%Y%m%d).tar.gz \
    --exclude=node_modules \
    --exclude=.git \
    /path/to/scrum-poker
```

## 🚨 Troubleshooting

### Common Issues

**Build Failures:**

- Ensure Node.js 18+ is installed
- Clear npm cache: `npm cache clean --force`
- Delete node_modules and reinstall

**Connection Issues:**

- Check WebSocket support on your platform
- Verify CORS configuration
- Ensure proxy passes WebSocket upgrade headers

**Performance Issues:**

- Monitor Redis memory usage
- Check MAX_SESSIONS limit
- Review server logs for errors
- Ensure adequate CPU/RAM allocation

**Session Loss:**

- Verify Redis connectivity
- Check SESSION_TIMEOUT configuration
- Monitor Redis persistence settings

### Debug Mode

```bash
# Enable debug logging
DEBUG=* npm start

# Specific debug namespace
DEBUG=socket.io:* npm start
```

## 📈 Scaling

### Horizontal Scaling

For high-traffic deployments:

1. **Load Balancer**: Use sticky sessions for WebSocket connections
2. **Redis Cluster**: Scale session storage
3. **Multiple Instances**: Deploy across multiple servers
4. **CDN**: Serve static assets from CDN

### Vertical Scaling

**Recommended specifications:**

| Users   | CPU     | RAM   | Redis | Storage |
| ------- | ------- | ----- | ----- | ------- |
| 1-50    | 1 vCPU  | 512MB | 256MB | 1GB     |
| 50-200  | 2 vCPU  | 1GB   | 512MB | 2GB     |
| 200-500 | 4 vCPU  | 2GB   | 1GB   | 5GB     |
| 500+    | 8+ vCPU | 4GB+  | 2GB+  | 10GB+   |

---

For additional help with deployment, check the [main README](../README.md) or open an issue in the repository.
