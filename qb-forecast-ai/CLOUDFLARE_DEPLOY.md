# Cloudflare Pages Deployment Guide

## Quick Deploy with GitHub

1. Push to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Deploy to Cloudflare Pages"
   git remote add origin https://github.com/your-username/qb-forecast-ai.git
   git push -u origin main
   ```

2. Go to https://pages.cloudflare.com
3. Connect GitHub repository
4. Build settings:
   - Framework: Vite
   - Build command: `npm run build`
   - Output directory: `dist`
5. Add environment variable:
   - Name: `GEMINI_API_KEY`
   - Value: Your Gemini API key
6. Deploy!

## Deploy with Wrangler CLI

```bash
# Install Wrangler
npm install -g wrangler

# Login
wrangler login

# Build
npm install
npm run build

# Deploy
wrangler pages deploy dist --project-name=qb-forecast-ai

# Set environment variable
wrangler pages secret put GEMINI_API_KEY --project-name=qb-forecast-ai
```

## Custom Domain

1. Go to Cloudflare Pages dashboard
2. Select your project
3. Go to "Custom domains"
4. Add your domain
5. Follow DNS configuration instructions

## Automatic Deployments

Every push to `main` branch will automatically deploy to production.
Create a `develop` branch for preview deployments.

## Environment Variables

Set in Cloudflare Pages dashboard:
- Production: Used for main branch
- Preview: Used for other branches

Required variables:
- `GEMINI_API_KEY`: Your Gemini API key from https://makersuite.google.com/app/apikey

## Performance

Cloudflare Pages provides:
- Global CDN (200+ locations)
- Unlimited bandwidth
- Automatic HTTPS
- DDoS protection
- 99.99% uptime SLA

## Monitoring

View deployment logs and analytics in Cloudflare Pages dashboard.
