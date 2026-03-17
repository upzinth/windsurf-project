# Deployment Guide - 9Tools Document Management System

## Overview

This guide covers the deployment of the 9Tools Document Management System on Ubuntu 22.04.5 LTS with DirectAdmin.

## System Requirements

### Hardware Requirements
- **CPU**: Minimum 2 cores, Recommended 4+ cores
- **RAM**: Minimum 4GB, Recommended 8GB+
- **Storage**: Minimum 50GB SSD, Recommended 100GB+ SSD
- **Network**: Stable internet connection with SSL certificate

### Software Requirements
- Ubuntu 22.04.5 LTS
- DirectAdmin Control Panel
- Docker & Docker Compose
- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Nginx (as reverse proxy)
- Let's Encrypt for SSL

## Domain Configuration

### DNS Setup
Ensure your domain `9tools.upz.in.th` points to your server IP:
```
A Record: 9tools.upz.in.th -> YOUR_SERVER_IP
```

### SSL Certificate
Install SSL certificate through DirectAdmin or Let's Encrypt:
```bash
sudo certbot --nginx -d 9tools.upz.in.th
```

## Installation Steps

### 1. Server Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y curl wget git unzip software-properties-common

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Reboot to apply group changes
sudo reboot
```

### 2. Application Setup

```bash
# Create application directory
sudo mkdir -p /opt/9tools
cd /opt/9tools

# Clone repository
git clone https://github.com/your-org/9tools-document-management.git .

# Copy environment file
cp .env.example .env

# Edit environment configuration
nano .env
```

### 3. Environment Configuration

Edit `.env` file with your specific settings:

```bash
# Database Configuration
DB_PASSWORD=your_secure_db_password_here
DB_HOST=postgres
DB_PORT=5432
DB_NAME=9tools_db
DB_USER=9tools_user

# Redis Configuration
REDIS_PASSWORD=your_secure_redis_password_here
REDIS_HOST=redis
REDIS_PORT=6379

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_here_at_least_32_characters

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password_here

# Application Configuration
APP_NAME=9Tools Document Management
APP_URL=https://9tools.upz.in.th
API_URL=https://9tools.upz.in.th/api

# Security
ENCRYPTION_KEY=your_32_character_encryption_key
BCRYPT_ROUNDS=12
SESSION_SECRET=your_session_secret_here

# Upload Configuration
MAX_FILE_SIZE=100MB
CHUNK_SIZE=5MB

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100
```

### 4. Docker Deployment

```bash
# Build and start containers
docker-compose up -d

# Check container status
docker-compose ps

# View logs
docker-compose logs -f
```

### 5. Database Initialization

```bash
# Run database migrations
docker-compose exec backend npm run db:migrate

# Seed initial data (optional)
docker-compose exec backend npm run db:seed
```

### 6. Nginx Configuration

Create Nginx configuration:

```bash
sudo nano /etc/nginx/sites-available/9tools.upz.in.th
```

```nginx
server {
    listen 80;
    server_name 9tools.upz.in.th;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name 9tools.upz.in.th;

    ssl_certificate /etc/letsencrypt/live/9tools.upz.in.th/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/9tools.upz.in.th/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Frontend
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Increase timeout for file uploads
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # File uploads (increase limits)
    client_max_body_size 100M;
    
    # Static files
    location /uploads/ {
        alias /opt/9tools/uploads/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/9tools.upz.in.th /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Monitoring and Maintenance

### 1. System Monitoring

Install monitoring tools:
```bash
# Install htop for system monitoring
sudo apt install htop

# Monitor Docker containers
docker stats

# Check disk usage
df -h

# Check memory usage
free -h
```

### 2. Log Management

Configure log rotation:
```bash
sudo nano /etc/logrotate.d/9tools
```

```
/opt/9tools/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 root root
    postrotate
        docker-compose restart backend
    endscript
}
```

### 3. Backup Strategy

Create backup script:
```bash
sudo nano /opt/9tools/backup.sh
```

```bash
#!/bin/bash

BACKUP_DIR="/opt/backups/9tools"
DATE=$(date +%Y%m%d_%H%M%S)
DB_BACKUP_FILE="$BACKUP_DIR/db_backup_$DATE.sql"
FILES_BACKUP_FILE="$BACKUP_DIR/files_backup_$DATE.tar.gz"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
docker-compose exec -T postgres pg_dump -U 9tools_user 9tools_db > $DB_BACKUP_FILE

# Backup uploaded files
tar -czf $FILES_BACKUP_FILE uploads/

# Remove old backups (keep last 7 days)
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

Make it executable and add to cron:
```bash
sudo chmod +x /opt/9tools/backup.sh
sudo crontab -e
```

Add line for daily backup at 2 AM:
```
0 2 * * * /opt/9tools/backup.sh >> /var/log/9tools-backup.log 2>&1
```

### 4. Health Checks

Create health check script:
```bash
sudo nano /opt/9tools/health-check.sh
```

```bash
#!/bin/bash

# Check if services are running
if ! docker-compose ps | grep -q "Up"; then
    echo "Some services are down. Restarting..."
    docker-compose restart
fi

# Check disk space
DISK_USAGE=$(df /opt/9tools | tail -1 | awk '{print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 80 ]; then
    echo "Warning: Disk usage is above 80%"
fi

# Check memory usage
MEM_USAGE=$(free | grep Mem | awk '{printf("%.0f", $3/$2 * 100.0)}')
if [ $MEM_USAGE -gt 80 ]; then
    echo "Warning: Memory usage is above 80%"
fi
```

## Security Hardening

### 1. Firewall Configuration

```bash
# Configure UFW firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 2. Fail2Ban Setup

```bash
sudo apt install fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

Create custom jail for the application:
```bash
sudo nano /etc/fail2ban/jail.local
```

```ini
[9tools-auth]
enabled = true
filter = 9tools-auth
logpath = /opt/9tools/logs/error.log
maxretry = 5
findtime = 600
bantime = 3600
```

### 3. SSL Hardening

Test SSL configuration:
```bash
sudo apt install ssl-cert-check
ssl-cert-check -c 9tools.upz.in.th:443
```

## Performance Optimization

### 1. Database Optimization

Tune PostgreSQL configuration:
```bash
sudo nano /opt/9tools/docker-compose.yml
```

Add to postgres service:
```yaml
environment:
  POSTGRES_SHARED_PRELOAD_LIBRARIES: pg_stat_statements
  POSTGRES_MAX_CONNECTIONS: 200
  POSTGRES_SHARED_BUFFERS: 256MB
  POSTGRES_EFFECTIVE_CACHE_SIZE: 1GB
  POSTGRES_WORK_MEM: 4MB
  POSTGRES_MAINTENANCE_WORK_MEM: 64MB
```

### 2. Redis Optimization

Configure Redis for memory efficiency:
```bash
sudo nano /opt/9tools/redis.conf
```

```
maxmemory 512mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

### 3. Application Optimization

Enable compression and caching in Nginx:
```nginx
# Add to server block
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

# Browser caching
location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

## Troubleshooting

### Common Issues

1. **Container won't start**
   ```bash
   docker-compose logs backend
   docker-compose logs frontend
   ```

2. **Database connection failed**
   ```bash
   docker-compose exec postgres psql -U 9tools_user -d 9tools_db
   ```

3. **High memory usage**
   ```bash
   docker stats --no-stream
   ```

4. **Slow response times**
   ```bash
   # Check Nginx logs
   sudo tail -f /var/log/nginx/access.log
   
   # Check application logs
   docker-compose logs -f backend
   ```

### Recovery Procedures

1. **Database Recovery**
   ```bash
   # Restore from backup
   docker-compose exec -T postgres psql -U 9tools_user -d 9tools_db < backup.sql
   ```

2. **File Recovery**
   ```bash
   # Restore files from backup
   tar -xzf files_backup.tar.gz
   ```

## Scaling Considerations

### Horizontal Scaling

For high availability, consider:

1. **Load Balancing**: Use multiple backend instances behind a load balancer
2. **Database Replication**: Set up PostgreSQL read replicas
3. **Redis Cluster**: Configure Redis in cluster mode
4. **CDN**: Use CDN for static assets

### Vertical Scaling

Monitor resource usage and upgrade as needed:
- Increase RAM for better caching
- Add CPU cores for better performance
- Upgrade storage for more capacity

---

For support, contact: dev@9tools.upz.in.th
