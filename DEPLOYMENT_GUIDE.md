# 9Tools Document Management System - Deployment Guide
## Ubuntu 22.04.5 LTS with DirectAdmin

## 📋 Table of Contents
1. [Prerequisites](#prerequisites)
2. [System Preparation](#system-preparation)
3. [DirectAdmin Setup](#directadmin-setup)
4. [Database Setup](#database-setup)
5. [Redis Setup](#redis-setup)
6. [Application Deployment](#application-deployment)
7. [Nginx Configuration](#nginx-configuration)
8. [SSL Certificate Setup](#ssl-certificate-setup)
9. [Environment Configuration](#environment-configuration)
10. [Service Management](#service-management)
11. [Testing & Verification](#testing--verification)
12. [Troubleshooting](#troubleshooting)

## 🔧 Prerequisites

### System Requirements
- Ubuntu 22.04.5 LTS
- DirectAdmin Control Panel
- Minimum 2GB RAM, 4GB recommended
- Minimum 20GB disk space, 50GB recommended
- Docker & Docker Compose installed
- Domain name pointing to server IP

### Software Requirements
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y curl wget git unzip htop

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
sudo ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
```

## 🖥 DirectAdmin Setup

### 1. Install DirectAdmin
```bash
# Download DirectAdmin installation script
wget https://www.directadmin.com/install.sh

# Make script executable
chmod +x install.sh

# Run installation (replace with your details)
sudo ./install.sh your-domain.com admin-user password
```

### 2. Configure DirectAdmin for Custom Applications
```bash
# Access DirectAdmin
https://your-domain.com:2222

# Navigate to: CustomBuild -> Custom HTTPD Configurations
# Create custom configuration for Node.js application
```

### 3. Create Custom HTTPD Configuration
Create a new configuration file: `/usr/local/directadmin/data/users/admin/httpd.conf`

```apache
<VirtualHost *:80>
    ServerName your-domain.com
    ServerAlias www.your-domain.com
    
    # Proxy to Node.js application
    ProxyPreserveHost On
    ProxyRequests Off
    
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/
    
    # WebSocket support
    ProxyPass /ws/ ws://localhost:3000/ws/
    ProxyPassReverse /ws/ ws://localhost:3000/ws/
    
    # Headers
    ProxyPassReverseCookieDomain /
    ProxyPassReverseCookiePath /
    
    # Security headers
    Header always set X-Frame-Options DENY
    Header always set X-Content-Type-Options nosniff
    Header always set X-XSS-Protection "1; mode=block"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
    
    # Logging
    ErrorLog /var/log/directadmin/9tools_error.log
    CustomLog /var/log/directadmin/9tools_access.log combined
</VirtualHost>
```

## 🗄️ Database Setup (PostgreSQL)

### 1. Install PostgreSQL via DirectAdmin
```bash
# In DirectAdmin: CustomBuild -> Install Software
# Select PostgreSQL version 14 or higher
```

### 2. Create Database and User
```bash
# Access PostgreSQL
sudo -u postgres psql

# Create database
CREATE DATABASE 9tools_db;

# Create user
CREATE USER 9tools_user WITH PASSWORD 'your_secure_password';

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE 9tools_db TO 9tools_user;

# Exit PostgreSQL
\q
```

### 3. Configure PostgreSQL
Edit `/var/lib/pgsql/data/postgresql.conf`:
```ini
# Connection settings
listen_addresses = 'localhost'
port = 5432
max_connections = 100

# Memory settings
shared_buffers = 256MB
effective_cache_size = 1GB

# Logging
log_statement = 'all'
log_duration = on
log_min_duration_statement = 1000
```

## 📦 Redis Setup

### 1. Install Redis via DirectAdmin
```bash
# In DirectAdmin: CustomBuild -> Install Software
# Select Redis
```

### 2. Configure Redis
Edit `/etc/redis/redis.conf`:
```ini
bind 127.0.0.1
port 6379
requirepass your_redis_password
maxmemory 512mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

### 3. Start Redis Service
```bash
sudo systemctl enable redis
sudo systemctl start redis
```

## 🚀 Application Deployment

### 1. Create Application Directory
```bash
# Create application directory
sudo mkdir -p /home/9tools
sudo chown -R $USER:$USER /home/9tools
cd /home/9tools

# Clone the application
git clone https://github.com/your-repo/9tools.git .
```

### 2. Configure Environment Variables
Create `.env` file:
```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=9tools_db
DB_USER=9tools_user
DB_PASSWORD=your_secure_password

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# Application Configuration
NODE_ENV=production
PORT=3000
DOMAIN=your-domain.com
FRONTEND_URL=https://your-domain.com

# Security
JWT_SECRET=your_jwt_secret_key
ENCRYPTION_KEY=your_encryption_key
SESSION_SECRET=your_session_secret

# Email Configuration
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=your-email@your-domain.com
SMTP_PASS=your-email-password
EMAIL_FROM=noreply@your-domain.com
EMAIL_FROM_NAME=9Tools System

# File Storage
UPLOAD_PATH=/home/9tools/uploads
MAX_FILE_SIZE=104857600
CHUNK_SIZE=5242880

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=https://your-domain.com/auth/google/callback
```

### 3. Build and Deploy with Docker
```bash
# Build Docker image
docker build -t 9tools-backend ./backend

# Tag and push to registry (if using private registry)
docker tag 9tools-backend your-registry/9tools-backend:latest
docker push your-registry/9tools-backend:latest

# Run with Docker Compose
docker-compose up -d
```

### 4. Create Systemd Service
Create `/etc/systemd/system/9tools.service`:
```ini
[Unit]
Description=9Tools Document Management System
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/9tools
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Enable and start service:
```bash
sudo systemctl enable 9tools
sudo systemctl start 9tools
```

## 🌐 Nginx Configuration

### 1. Install Nginx via DirectAdmin
```bash
# In DirectAdmin: CustomBuild -> Install Software
# Select Nginx
```

### 2. Configure Nginx for Reverse Proxy
Create `/etc/nginx/sites-available/9tools`:
```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    # SSL Configuration
    ssl_certificate /etc/ssl/certs/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/ssl/private/your-domain.com.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-SHA384:DHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-SHA384:ECDHE-RSA-AES256-SHA384:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security Headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy "strict-origin-when-cross-origin";

    # Proxy to Node.js application
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_no_cache $http_upgrade;
        proxy_redirect off;
        
        # File upload size
        client_max_body_size 100M;
    }

    # WebSocket support
    location /ws/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static files caching
    location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        proxy_pass http://localhost:3000;
    }

    # Logging
    access_log /var/log/nginx/9tools_access.log;
    error_log /var/log/nginx/9tools_error.log;
}
```

### 3. Enable Site
```bash
sudo ln -s /etc/nginx/sites-available/9tools /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 🔒 SSL Certificate Setup

### 1. Let's Encrypt (Recommended)
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### 2. Commercial SSL Certificate
```bash
# Upload certificate files to /etc/ssl/certs/
# Upload private key to /etc/ssl/private/
# Set proper permissions
sudo chmod 600 /etc/ssl/private/your-domain.com.key
```

## ⚙️ Environment Configuration

### 1. Production Environment Variables
```bash
# Set production mode
export NODE_ENV=production

# Set proper file permissions
sudo chown -R www-data:www-data /home/9tools
sudo chmod -R 755 /home/9tools
```

### 2. Database Connection Pool
Update `.env`:
```ini
DB_CONNECTION_POOL_MIN=2
DB_CONNECTION_POOL_MAX=10
DB_CONNECTION_POOL_IDLE_TIMEOUT=30000
DB_CONNECTION_POOL_CONNECTION_TIMEOUT=60000
```

## 🔧 Service Management

### 1. Systemd Services
```bash
# Check service status
sudo systemctl status 9tools
sudo systemctl status postgresql
sudo systemctl status redis
sudo systemctl status nginx

# View logs
sudo journalctl -u 9tools -f
sudo journalctl -u postgresql -f
```

### 2. Docker Container Management
```bash
# View running containers
docker-compose ps

# View logs
docker-compose logs -f backend

# Update application
docker-compose pull
docker-compose up -d --force-recreate
```

### 3. Database Management
```bash
# Connect to database
sudo -u postgres psql 9tools_db

# Run migrations
cd /home/9tools/backend
knex migrate:latest

# Create backup
sudo -u postgres pg_dump 9tools_db > backup_$(date +%Y%m%d_%H%M%S).sql
```

## 🧪 Testing & Verification

### 1. Application Health Check
```bash
# Check application health
curl -f http://localhost:3000/api/health

# Check database connection
curl -f http://localhost:3000/api/health/database

# Check Redis connection
curl -f http://localhost:3000/api/health/redis
```

### 2. SSL Certificate Test
```bash
# Test SSL configuration
sudo nginx -t

# Check certificate validity
openssl x509 -in /etc/ssl/certs/your-domain.com/fullchain.pem -text -noout
```

### 3. Performance Test
```bash
# Load test
ab -n 1000 -c 10 https://your-domain.com/

# Database performance
sudo -u postgres psql 9tools_db -c "EXPLAIN ANALYZE SELECT * FROM documents LIMIT 10;"
```

## 🚨 Troubleshooting

### Common Issues & Solutions

#### 1. Application Won't Start
```bash
# Check logs
docker-compose logs backend

# Check port conflicts
sudo netstat -tulpn | grep :3000

# Check environment variables
docker-compose config
```

#### 2. Database Connection Issues
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check connection
sudo -u postgres psql -h localhost -U 9tools_user -d 9tools_db -c "SELECT 1;"

# Check configuration
sudo -u postgres psql -c "SHOW config_file;"
```

#### 3. SSL Certificate Issues
```bash
# Check certificate expiration
openssl x509 -in /etc/ssl/certs/your-domain.com/fullchain.pem -noout -dates

# Test certificate chain
curl -I https://your-domain.com

# Renew certificate
sudo certbot renew --dry-run
```

#### 4. Performance Issues
```bash
# Check system resources
htop
df -h
free -h

# Check application logs
tail -f /var/log/nginx/9tools_error.log

# Optimize database
sudo -u postgres psql 9tools_db -c "VACUUM ANALYZE;"
```

### Log Locations
- Application: `docker-compose logs backend`
- Nginx: `/var/log/nginx/9tools_*.log`
- PostgreSQL: `/var/log/postgresql/`
- System: `/var/log/syslog`
- DirectAdmin: `/var/log/directadmin/`

### Monitoring Commands
```bash
# System monitoring
top
iostat -x 1
netstat -tulpn

# Application monitoring
curl -s http://localhost:3000/api/admin/health | jq .

# Database monitoring
sudo -u postgres psql -c "SELECT * FROM pg_stat_activity;"
```

## 📊 Performance Optimization

### 1. Database Optimization
```sql
-- Create indexes
CREATE INDEX CONCURRENTLY idx_documents_folder_id ON documents(folder_id);
CREATE INDEX CONCURRENTLY idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX CONCURRENTLY idx_documents_status ON documents(status);

-- Update statistics
ANALYZE documents;
ANALYZE users;
ANALYZE audit_trails;
```

### 2. Nginx Optimization
```nginx
# Add to server block
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_min_length 1000;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

# Enable caching
location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

## 🔐 Security Hardening

### 1. Firewall Configuration
```bash
# Configure UFW
sudo ufw allow ssh
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 2. Application Security
```bash
# Set proper file permissions
sudo chmod 600 /home/9tools/.env
sudo chmod 700 /home/9tools/uploads

# Configure fail2ban
sudo apt install fail2ban
sudo systemctl enable fail2ban
```

### 3. Database Security
```sql
-- Create secure user
CREATE USER 9tools_app WITH PASSWORD 'strong_password';
GRANT CONNECT ON DATABASE 9tools_db TO 9tools_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO 9tools_app;
```

## 📈 Monitoring & Maintenance

### 1. Setup Monitoring
```bash
# Create monitoring script
cat > /home/9tools/scripts/monitor.sh << 'EOF'
#!/bin/bash
curl -s http://localhost:3000/api/admin/health | jq '.status' | grep -q "healthy" || echo "Application is down" | mail -s "9Tools Alert" admin@your-domain.com
EOF

chmod +x /home/9tools/scripts/monitor.sh

# Add to crontab
echo "*/5 * * * * /home/9tools/scripts/monitor.sh" | crontab -
```

### 2. Backup Strategy
```bash
# Create backup script
cat > /home/9tools/scripts/backup.sh << 'EOF'
#!/bin/bash
DATE=\$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/9tools"
mkdir -p \$BACKUP_DIR

# Database backup
sudo -u postgres pg_dump 9tools_db > \$BACKUP_DIR/db_backup_\$DATE.sql

# File backup
tar -czf \$BACKUP_DIR/files_backup_\$DATE.tar.gz /home/9tools/uploads

# Cleanup old backups (keep 7 days)
find \$BACKUP_DIR -name "*.sql" -mtime +7 -delete
find \$BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
EOF

chmod +x /home/9tools/scripts/backup.sh

# Schedule daily backup
echo "0 2 * * * /home/9tools/scripts/backup.sh" | crontab -
```

## 🎉 Deployment Complete

After following this guide, you should have:
- ✅ 9Tools Document Management System running
- ✅ PostgreSQL database configured
- ✅ Redis cache running
- ✅ Nginx reverse proxy configured
- ✅ SSL certificate installed
- ✅ Security hardening applied
- ✅ Monitoring and backup in place

### Access Your Application
- **Main Application**: https://your-domain.com
- **Admin Dashboard**: https://your-domain.com/admin
- **API Documentation**: https://your-domain.com/api/docs

### Default Login Credentials
- **Admin**: admin / admin123 (change immediately after first login)
- **Manager**: manager / manager123
- **User**: user / user123

**Important**: Change all default passwords immediately after first login!

## 📞 Support

For deployment issues or questions:
1. Check the troubleshooting section
2. Review application logs
3. Verify system requirements
4. Consult the documentation at `/docs/technical-docs/Deployment.md`

---

**Deployment completed successfully! 🎉**
