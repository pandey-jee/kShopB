# Production Environment Setup Guide

## Required Environment Variables for Production Deployment

Before deploying to production, ensure all environment variables are properly configured. This guide explains how to set up each variable.

### 🔐 Security Variables

#### JWT_SECRET
Generate a secure JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

#### SESSION_SECRET
Generate a secure session secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 🗄️ Database Configuration

#### MONGODB_URI
1. Create a MongoDB Atlas cluster
2. Get connection string from Atlas dashboard
3. Format: `mongodb+srv://<username>:<password>@<cluster>.mongodb.net/panditji-auto-connect?retryWrites=true&w=majority`
4. Ensure IP whitelist includes your server IP

### 📧 Email Configuration

#### Gmail SMTP Setup
1. Enable 2FA on Gmail account
2. Generate App Password: Google Account → Security → App passwords
3. Use these variables:
   - `EMAIL_USER`: Your Gmail address
   - `EMAIL_APP_PASSWORD`: Generated app password (not your Gmail password)
   - `EMAIL_FROM`: Your support email address
   - `ADMIN_EMAIL`: Admin notification email

### ☁️ Cloudinary Configuration

#### Required Variables
1. Sign up for Cloudinary account
2. Get credentials from Dashboard:
   - `CLOUDINARY_CLOUD_NAME`: Your cloud name
   - `CLOUDINARY_API_KEY`: API key from dashboard
   - `CLOUDINARY_API_SECRET`: API secret from dashboard

### 💳 Payment Gateway (Razorpay)

#### Live Keys Setup
1. Complete Razorpay KYC verification
2. Get live keys from Razorpay dashboard:
   - `RAZORPAY_LIVE_KEY_ID`: rzp_live_xxxxxxxxxxxx
   - `RAZORPAY_LIVE_KEY_SECRET`: Your live secret key

⚠️ **Important**: Never use test keys in production!

### 🌐 Frontend Configuration

#### Domain Setup
- `FRONTEND_URL`: Your production frontend domain (e.g., https://pandijiautoconnect.com)
- `ADMIN_FRONTEND_URL`: Admin panel URL (e.g., https://admin.pandijiautoconnect.com)
- `CORS_ORIGIN`: Same as frontend URL for CORS configuration

### 📊 Analytics (Optional)

#### Google Analytics
- `GOOGLE_ANALYTICS_ID`: GA4 measurement ID (G-XXXXXXXXXX)
- `GOOGLE_SEARCH_CONSOLE_ID`: Search Console property ID

## Deployment Platform Specific Instructions

### Render.com Deployment
1. Connect GitHub repository
2. Set build command: `npm install`
3. Set start command: `npm start`
4. Add all environment variables in Render dashboard

### Heroku Deployment
1. Install Heroku CLI
2. Create app: `heroku create panditji-auto-connect-api`
3. Set environment variables:
```bash
heroku config:set NODE_ENV=production
heroku config:set MONGODB_URI="your-mongodb-uri"
heroku config:set JWT_SECRET="your-jwt-secret"
# ... add all other variables
```

### Railway Deployment
1. Connect GitHub repository
2. Add environment variables in Railway dashboard
3. Set start command: `npm start`

### DigitalOcean App Platform
1. Create app from GitHub
2. Configure environment variables in control panel
3. Set build and run commands

## Security Checklist

- [ ] All secrets use environment variables (no hardcoded values)
- [ ] JWT secret is cryptographically secure (64+ characters)
- [ ] Database uses authentication and SSL
- [ ] Email uses app-specific passwords
- [ ] Payment gateway uses live keys
- [ ] CORS is configured for specific domains
- [ ] Rate limiting is enabled
- [ ] Security headers are configured

## Testing Production Configuration

1. Test database connection
2. Test email functionality
3. Test file uploads to Cloudinary
4. Test payment processing with small amounts
5. Verify CORS settings
6. Check security headers
7. Test API rate limiting

## Backup and Recovery

1. Enable MongoDB Atlas automated backups
2. Set up log file rotation
3. Configure error monitoring (optional: Sentry)
4. Set up uptime monitoring

## Environment Variables Summary

Copy this template and fill in your production values:

```bash
# Core Configuration
NODE_ENV=production
PORT=5004

# Database
MONGODB_URI=mongodb+srv://...

# JWT
JWT_SECRET=...
SESSION_SECRET=...

# Cloudinary
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# Email
EMAIL_USER=...
EMAIL_APP_PASSWORD=...
EMAIL_FROM=...
ADMIN_EMAIL=...

# Payment
RAZORPAY_LIVE_KEY_ID=...
RAZORPAY_LIVE_KEY_SECRET=...

# Frontend
FRONTEND_URL=...
CORS_ORIGIN=...

# Optional Analytics
GOOGLE_ANALYTICS_ID=...
```

Remember: Never commit `.env.production` with real values to version control!
