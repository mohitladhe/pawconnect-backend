# Express.js Cognito Backend

A production-ready Express.js backend for AWS Cognito authentication operations. This server replaces direct Cognito integration in your Android app, providing simple REST API endpoints.

## Features

- ✅ User signup with email, password, username, and name
- ✅ Email OTP verification
- ✅ User login with JWT token generation
- ✅ User attributes extraction (custom:username, sub, email, name)
- ✅ Comprehensive error handling with user-friendly messages
- ✅ CORS enabled for mobile apps
- ✅ Environment variable configuration
- ✅ ready for Render deployment

## Prerequisites

- Node.js 14+ 
- npm or yarn
- AWS Account with Cognito User Pool configured
- Cognito User Pool ID and Client ID
- AWS IAM credentials with Cognito access

## Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd ExpressServer
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` and fill in your AWS credentials:
```
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=ap-south-1
COGNITO_CLIENT_ID=your_client_id
PORT=3000
```

## Running Locally

```bash
npm start
```

The server will start on `http://localhost:3000`

Health check: `GET http://localhost:3000`

## API Endpoints

### 1. User Signup
**POST** `/auth/signup`

Creates a new user in Cognito User Pool and sends verification email.

Request Body:
```json
{
  "username": "john_doe",
  "password": "SecurePass123!",
  "email": "john@example.com",
  "name": "John Doe"
}
```

Success Response (200):
```json
{
  "message": "User signed up successfully. Please check your email for the verification code.",
  "userSub": "uuid-here"
}
```

Error Responses:
```json
{
  "error": "Username already exists."
}
{
  "error": "Password does not meet the required complexity."
}
{
  "error": "Invalid input parameters."
}
```

---

### 2. Verify Email (OTP)
**POST** `/auth/verify`

Confirms the user registration using the OTP sent to their email.

Request Body:
```json
{
  "username": "john_doe",
  "otp": "123456"
}
```

Success Response (200):
```json
{
  "message": "User verified successfully."
}
```

Error Responses:
```json
{
  "error": "Invalid OTP. Please check and try again."
}
{
  "error": "OTP has expired. Please request a new one."
}
{
  "error": "User is already confirmed."
}
```

---

### 3. Login
**POST** `/auth/login`

Authenticates a user and returns JWT tokens along with user attributes.

Request Body:
```json
{
  "username": "john_doe",
  "password": "SecurePass123!"
}
```

Success Response (200):
```json
{
  "message": "Login successful",
  "idToken": "eyJhbGciOiJIUzI1NiIs...",
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "username": "john_doe",
    "email": "john@example.com",
    "sub": "uuid-here",
    "name": "John Doe"
  }
}
```

Error Responses:
```json
{
  "error": "Invalid username or password."
}
{
  "error": "User account is not confirmed. Please verify your email."
}
{
  "error": "User does not exist."
}
```

---

## Android Integration

Replace your Cognito SDK calls with REST calls:

### Signup
```kotlin
val request = SignupRequest(
    username = "john_doe",
    password = "SecurePass123!",
    email = "john@example.com",
    name = "John Doe"
)

apiService.signup(request).enqueue(object : Callback<SignupResponse> {
    override fun onResponse(call: Call<SignupResponse>, response: Response<SignupResponse>) {
        if (response.isSuccessful) {
            // Navigate to verification screen
        } else {
            val error = response.errorBody()?.string()
            // Show error to user
        }
    }
    override fun onFailure(call: Call<SignupResponse>, t: Throwable) {
        // Handle network error
    }
})
```

### Verification
```kotlin
apiService.verify(VerifyRequest("john_doe", "123456")).enqueue { response ->
    if (response.isSuccessful) {
        // Navigate to login
    }
}
```

### Login
```kotlin
apiService.login(LoginRequest("john_doe", "SecurePass123!")).enqueue { response ->
    if (response.isSuccessful) {
        val data = response.body()!!
        // Save tokens and user data
        preferenceManager.saveToken(data.idToken)
        preferenceManager.saveUser(data.user)
        // Navigate to home
    }
}
```

## Deployment on Render

### 1. Push to GitHub
```bash
git add .
git commit -m "Express Cognito Backend"
git push origin main
```

### 2. Create New Web Service on Render
- Go to [render.com](https://render.com)
- Click "New +" → "Web Service"
- Connect your GitHub repository
- Select the repository

### 3. Configure Service
- **Name**: `express-cognito-backend`
- **Environment**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`

### 4. Add Environment Variables
In the Render dashboard, add:
```
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=ap-south-1
COGNITO_CLIENT_ID=your_client_id
PORT=3000
```

### 5. Deploy
Click "Deploy" and Render will build and deploy your app.

Your API will be available at: `https://your-service-name.onrender.com`

## Security Notes

⚠️ **IMPORTANT**: 
- Never commit `.env` with real credentials to Git
- Always use `.env.example` as a template
- Rotate AWS credentials regularly
- Use IAM roles instead of access keys (if possible)
- Enable rate limiting in production
- Use HTTPS only (Render provides this by default)

## Troubleshooting

### "Cannot GET /"
This is normal. The health check endpoint returns JSON. Use a REST client or check the network tab.

### Cognito Authentication Failures
1. Verify `COGNITO_CLIENT_ID` is correct
2. Check AWS Region matches your Cognito pool
3. Ensure IAM user has Cognito permissions
4. Check User Pool settings allow PASSWORD_AUTH flow

### CORS Issues
The server has CORS enabled. If issues persist, update:
```javascript
app.use(cors({
  origin: ['https://yourdomain.com'],
  credentials: true
}));
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `AWS_ACCESS_KEY_ID` | AWS access key | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | `abc123...` |
| `AWS_REGION` | AWS region | `ap-south-1` |
| `COGNITO_CLIENT_ID` | Cognito app client ID | `nc99t83...` |
| `PORT` | Server port | `3000` |

## License

MIT
