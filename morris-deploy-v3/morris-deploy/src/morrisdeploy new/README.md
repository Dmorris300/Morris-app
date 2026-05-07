# Morris — Built on the Tools

Construction admin app for UK tradespeople. Built by a duct fitter.

## What is Morris?

Morris is a SaaS web application providing 44 professional document generation tools for UK construction tradespeople. Variation letters, RAMS, CIS invoices, payment chasers, contract review and much more.

**Website:** morrisapp.co.uk  
**Company:** Morris Construction Tech Ltd

---

## Deploying to Vercel

### Step 1 — Get your Anthropic API key
1. Go to console.anthropic.com
2. Create an account
3. Go to API Keys
4. Create a new key
5. Copy it — you'll need it in Step 4

### Step 2 — Push to GitHub
1. Create a new repository on github.com called morris-app
2. Upload all these files to the repository
3. Commit the changes

### Step 3 — Deploy on Vercel
1. Go to vercel.com
2. Sign up with your GitHub account
3. Click New Project
4. Select your morris-app repository
5. Click Deploy
6. Vercel builds Morris automatically

### Step 4 — Add your API key
1. In Vercel go to your project
2. Click Settings
3. Click Environment Variables
4. Add new variable:
   - Name: VITE_ANTHROPIC_API_KEY
   - Value: your API key from Step 1
5. Click Save
6. Redeploy the project

### Step 5 — Connect your domain
1. In Vercel go to your project Settings
2. Click Domains
3. Add morrisapp.co.uk
4. Vercel gives you DNS records
5. Add those DNS records in Namecheap
6. Wait 24-48 hours

Morris is live at morrisapp.co.uk ✅

---

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:5173

---

## Tech Stack

- React 18
- Vite
- Anthropic Claude API
- Deployed on Vercel

---

*Morris Construction Tech Ltd — Built on the tools.*
