require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { 
  CognitoIdentityProviderClient, 
  SignUpCommand, 
  ConfirmSignUpCommand, 
  InitiateAuthCommand 
} = require('@aws-sdk/client-cognito-identity-provider');

const app = express();
app.use(express.json());
app.use(cors());

// Validate environment variables
const requiredEnvVars = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'COGNITO_CLIENT_ID'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({ 
    message: 'Express Cognito Backend is running',
    timestamp: new Date().toISOString()
  });
});

// Signup endpoint - POST /auth/signup
// Body: { username, password, email, name }
app.post('/auth/signup', async (req, res) => {
  const { username, password, email, name } = req.body;

  // Input validation
  if (!username || !password || !email || !name) {
    return res.status(400).json({ error: 'Username, password, email, and name are required.' });
  }

  const params = {
    ClientId: process.env.COGNITO_CLIENT_ID,
    Username: username,
    Password: password,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'name', Value: name },
      { Name: 'custom:username', Value: username },
    ],
  };

  try {
    const command = new SignUpCommand(params);
    const response = await cognitoClient.send(command);
    res.status(200).json({
      message: 'User signed up successfully. Please check your email for the verification code.',
      userSub: response.UserSub,
    });
  } catch (error) {
    console.error('Error during sign up:', error);
    
    // Provide user-friendly error messages
    let errorMessage = 'An error occurred during signup.';
    if (error.name === 'UsernameExistsException') {
      errorMessage = 'Username already exists.';
    } else if (error.name === 'InvalidPasswordException') {
      errorMessage = 'Password does not meet the required complexity.';
    } else if (error.name === 'InvalidParameterException') {
      errorMessage = 'Invalid input parameters.';
    }
    
    res.status(400).json({ error: errorMessage });
  }
});

// Verify endpoint - POST /auth/verify
// Body: { username, otp }
app.post('/auth/verify', async (req, res) => {
  const { username, otp } = req.body;

  // Input validation
  if (!username || !otp) {
    return res.status(400).json({ error: 'Username and OTP are required.' });
  }

  const params = {
    ClientId: process.env.COGNITO_CLIENT_ID,
    Username: username,
    ConfirmationCode: otp,
  };

  try {
    const command = new ConfirmSignUpCommand(params);
    await cognitoClient.send(command);
    res.status(200).json({ message: 'User verified successfully.' });
  } catch (error) {
    console.error('Error during verification:', error);
    
    // Provide user-friendly error messages
    let errorMessage = 'An error occurred during verification.';
    if (error.name === 'CodeMismatchException') {
      errorMessage = 'Invalid OTP. Please check and try again.';
    } else if (error.name === 'ExpiredCodeException') {
      errorMessage = 'OTP has expired. Please request a new one.';
    } else if (error.name === 'UserNotFoundException') {
      errorMessage = 'User does not exist.';
    } else if (error.name === 'NotAuthorizedException') {
      errorMessage = 'User is already confirmed.';
    }
    
    res.status(400).json({ error: errorMessage });
  }
});

// Login endpoint - POST /auth/login
// Body: { username, password }
// Returns: { idToken, accessToken, refreshToken, user }
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;

  // Input validation
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const params = {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: process.env.COGNITO_CLIENT_ID,
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password,
    },
  };

  try {
    const command = new InitiateAuthCommand(params);
    const { AuthenticationResult } = await cognitoClient.send(command);
    
    if (AuthenticationResult) {
      // Decode ID Token to get user attributes (custom:username, sub, etc.)
      const idTokenPayload = JSON.parse(Buffer.from(AuthenticationResult.IdToken.split('.')[1], 'base64').toString());
      
      res.status(200).json({
        message: 'Login successful',
        idToken: AuthenticationResult.IdToken,
        accessToken: AuthenticationResult.AccessToken,
        refreshToken: AuthenticationResult.RefreshToken,
        user: {
          username: idTokenPayload['custom:username'] || idTokenPayload['cognito:username'],
          email: idTokenPayload.email,
          sub: idTokenPayload.sub,
          name: idTokenPayload.name,
        },
      });
    } else {
        res.status(400).json({ error: 'Login failed. Please check your credentials.' });
    }

  } catch (error) {
    console.error('Error during login:', error);
    
    // Provide user-friendly error messages
    let errorMessage = 'An error occurred during login.';
    if (error.name === 'UserNotConfirmedException') {
      errorMessage = 'User account is not confirmed. Please verify your email.';
    } else if (error.name === 'NotAuthorizedException') {
      errorMessage = 'Invalid username or password.';
    } else if (error.name === 'UserNotFoundException') {
      errorMessage = 'User does not exist.';
    }
    
    res.status(400).json({ error: errorMessage });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
