# Render Deployment Step-by-Step Guide

This guide will walk you through deploying your Express.js Cognito backend on Render.

---

## Prerequisites

Before you start, ensure you have:

- [ ] GitHub account (with your project pushed)
- [ ] Render account (free tier available at [render.com](https://render.com))
- [ ] Valid AWS credentials (with new access key - not the exposed one)
- [ ] Your Cognito Client ID
- [ ] Your AWS Region (ap-south-1)

---

## Step 1: Prepare Your Project for Deployment

### 1.1 Create a `.gitignore` file (if not already present)

Make sure your `.env` file is ignored:

```
node_modules/
.env
.env.local
.DS_Store
npm-debug.log*
```

### 1.2 Ensure your `package.json` has correct scripts:

```json
{
  "scripts": {
    "start": "node index.js"
  },
  "engines": {
    "node": "18"
  }
}
```

### 1.3 Verify `.env.example` exists (template for deployment):

```
AWS_ACCESS_KEY_ID=your_aws_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key_here
AWS_REGION=ap-south-1
COGNITO_CLIENT_ID=your_cognito_client_id_here
PORT=3000
```

---

## Step 2: Push Your Project to GitHub

### 2.1 Initialize Git (if not already done):

```bash
cd c:\Users\kolhe\ExpressServer
git init
```

### 2.2 Add files to Git:

```bash
git add -A
```

### 2.3 Commit your changes:

```bash
git commit -m "Express Cognito Backend Ready for Deployment"
```

### 2.4 Create a GitHub repository:

1. Go to [github.com/new](https://github.com/new)
2. Create a new repository (name: `express-cognito-backend`)
3. Do NOT initialize with README (you have one)

### 2.5 Push to GitHub:

```bash
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/express-cognito-backend.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

---

## Step 3: Create a Render Account

1. Go to [render.com](https://render.com)
2. Click **Sign Up** (top right)
3. Choose **Sign up with GitHub** (easier for deployment)
4. Authorize Render to access your GitHub

---

## Step 4: Create a New Web Service on Render

### 4.1 Create the Service

1. After logging in, click **Dashboard**
2. Click **New +** button (top right)
3. Select **Web Service**

### 4.2 Connect Your Repository

1. In the "Create a new Web Service" page, you'll see your GitHub repositories
2. Click **Connect** next to `express-cognito-backend`
3. Render will ask for permissions - click **Authorize**

### 4.3 Configure the Service

1. **Name**: `express-cognito-backend` (or your preferred name)
2. **Environment**: Select `Node`
3. **Region**: `Ohio` (default is fine, or select closest to your users)
4. **Branch**: `main`
5. **Build Command**: Leave empty or use `npm install`
6. **Start Command**: `npm start`
7. **Plan**: Select `Free` (you can upgrade later)

Click **Create Web Service**

---

## Step 5: Add Environment Variables

### 5.1 Wait for Initial Deployment (it will fail - this is normal)

The service will try to deploy but fail because environment variables are missing.

### 5.2 Go to Environment Variables

1. In your Render dashboard, open your `express-cognito-backend` service
2. Go to the **Environment** tab on the left sidebar
3. Click **Add Environment Variable**

### 5.3 Add Each Variable

Add the following variables one by one:

**Variable 1: AWS_ACCESS_KEY_ID**
- Key: `AWS_ACCESS_KEY_ID`
- Value: `your_new_aws_access_key_id` (rotated key, not the exposed one)
- Click **Add**

**Variable 2: AWS_SECRET_ACCESS_KEY**
- Key: `AWS_SECRET_ACCESS_KEY`
- Value: `your_new_aws_secret_access_key`
- Click **Add**

**Variable 3: AWS_REGION**
- Key: `AWS_REGION`
- Value: `ap-south-1`
- Click **Add**

**Variable 4: COGNITO_CLIENT_ID**
- Key: `COGNITO_CLIENT_ID`
- Value: `nc99t83otiqu5dbbtp5ti06a3` (your Cognito client ID)
- Click **Add**

**Variable 5: PORT** (optional)
- Key: `PORT`
- Value: `3000`
- Click **Add**

---

## Step 6: Deploy

### 6.1 Trigger a New Deployment

1. Go to the **Deploys** tab
2. Click **Manual Deploy** → **Deploy latest commit**

Render will now:
- Install dependencies (`npm install`)
- Build the project
- Start the server (`npm start`)

### 6.2 Monitor the Deployment

1. Watch the **Build Logs** tab
2. You should see: `Server running on port 3000`
3. Once complete, you'll see a green checkmark

This usually takes 2-5 minutes.

---

## Step 7: Verify Your Deployment

### 7.1 Get Your Service URL

1. In the Render dashboard, find your service URL at the top
2. It will look like: `https://express-cognito-backend.onrender.com`

### 7.2 Test the Health Check Endpoint

Open this in your browser or use a REST client:

```
GET https://express-cognito-backend.onrender.com/
```

You should see:
```json
{
  "message": "Express Cognito Backend is running",
  "timestamp": "2026-02-25T10:30:00.000Z"
}
```

### 7.3 Test the Signup Endpoint

Use **Postman**, **VS Code REST Client**, or **curl**:

```bash
curl -X POST https://express-cognito-backend.onrender.com/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "TestPass123!",
    "email": "test@example.com",
    "name": "Test User"
  }'
```

Expected response:
```json
{
  "message": "User signed up successfully. Please check your email for the verification code.",
  "userSub": "uuid-string"
}
```

---

## Step 8: Update Your Android App

### 8.1 Update Base URL

In your Android app (Retrofit or HttpClient configuration):

```kotlin
// Before (direct Cognito)
// AWSMobileClient.getInstance().signIn(...)

// After (REST API)
const val BASE_URL = "https://express-cognito-backend.onrender.com"
```

### 8.2 Update Signup Call

```kotlin
val apiService = RetrofitClient.getInstance(BASE_URL).create(ApiService::class.java)

apiService.signup(SignupRequest(
    username = "john_doe",
    password = "SecurePass123!",
    email = "john@example.com",
    name = "John Doe"
)).enqueue(object : Callback<SignupResponse> {
    override fun onResponse(call: Call<SignupResponse>, response: Response<SignupResponse>) {
        if (response.isSuccessful) {
            val data = response.body()!!
            // Navigate to VerifyActivity with username
        } else {
            val errorBody = response.errorBody()?.string()
            // Show error: errorBody?.fromJson<ErrorResponse>().error
        }
    }
    override fun onFailure(call: Call<SignupResponse>, t: Throwable) {
        // Handle network error
    }
})
```

### 8.3 Update Login Call

```kotlin
apiService.login(LoginRequest("john_doe", "SecurePass123!"))
    .enqueue(object : Callback<LoginResponse> {
        override fun onResponse(call: Call<LoginResponse>, response: Response<LoginResponse>) {
            if (response.isSuccessful) {
                val data = response.body()!!
                
                // Save tokens
                sharedPreferences.edit().apply {
                    putString("idToken", data.idToken)
                    putString("accessToken", data.accessToken)
                    putString("refreshToken", data.refreshToken)
                    apply()
                }
                
                // Save user data
                sharedPreferences.edit().apply {
                    putString("username", data.user.username)
                    putString("email", data.user.email)
                    putString("userId", data.user.sub)
                    apply()
                }
                
                // Navigate to home
            }
        }
        override fun onFailure(call: Call<LoginResponse>, t: Throwable) {
            // Handle error
        }
    })
```

---

## Step 9: Monitor Your Deployment

### 9.1 View Logs

1. Go to your service on Render
2. Click **Logs** tab
3. Monitor for errors or issues

### 9.2 View Metrics

1. Click **Metrics** tab
2. Monitor CPU, memory, and requests

---

## Common Issues & Troubleshooting

### Issue 1: Deployment Fails with "Missing Environment Variables"

**Solution**: Check the Environment tab and ensure all 4-5 variables are set correctly.

### Issue 2: 502 Bad Gateway Error

**Solution**: 
- Check CloudWatch Logs in your service
- Ensure the server is listening on the correct PORT
- Verify AWS credentials are correct

### Issue 3: CORS Errors from Android App

**Solution**: The server already has CORS enabled, but if issues persist:

```javascript
// In index.js, add specific origins:
app.use(cors({
  origin: ['https://yourdomain.com'],
  credentials: true
}));
```

### Issue 4: Cognito Authentication Fails

**Solution**:
- Verify COGNITO_CLIENT_ID is correct
- Check AWS Region matches your Cognito pool
- Ensure the IAM user has Cognito permissions

---

## Step 10: Final Checklist

- [ ] Project pushed to GitHub
- [ ] Render service created
- [ ] All 5 environment variables added
- [ ] Deployment successful (green checkmark)
- [ ] Health check endpoint returns 200
- [ ] Signup endpoint tested successfully
- [ ] Android app updated with new BASE_URL
- [ ] Login test successful from Android app

---

## Useful Commands

### View Recent Deployments
Go to **Deploys** tab to see all deployment history

### Redeploy
Click **Manual Deploy** → **Deploy latest commit**

### Check Service Status
Dashboard shows live status (Operating, Suspended, etc.)

### View Error Logs
Click **Logs** tab for real-time logs

---

## Cost & Limits

**Free Tier (Render):**
- 750 compute hours/month
- One free PostgreSQL database
- 100GB/month bandwidth

**Your server runs continuously (unless you pause it):**
- Deploys are free
- "Spinning down" after 15 minutes of inactivity (free tier)
- Instant restart on new request

---

## Next Steps

1. **Auto-Deploy from GitHub**: Enable automatic deployments whenever you push to `main`
2. **Add Custom Domain**: Connect a domain name to your Render service
3. **Enable HTTPS**: Render provides free SSL/TLS certificates
4. **Set Up Monitoring**: Use Render's Alerts feature for uptime monitoring

---

## Support

- Render Docs: [render.com/docs](https://render.com/docs)
- Your Service Logs: Always check Logs tab first for debugging
- GitHub Issues: Document any issues in your repository

