require("dotenv").config();
const express = require("express");
const cors = require("cors");
const {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
} = require("@aws-sdk/client-cognito-identity-provider");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK using the local service account file.
// This avoids relying on the GOOGLE_APPLICATION_CREDENTIALS env var
// and works consistently on Render/Vercel when the file is deployed securely.
// Initialize Firebase Admin SDK using either a base64-encoded service
try {
  const saB64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  const serviceAccount = saB64
    ? JSON.parse(Buffer.from(saB64, "base64").toString("utf8"))
    : require("./firebase-service-account.json");

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL:
      process.env.FIREBASE_DB_URL ||
      `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`,
  });
  console.log(
    "Firebase Admin SDK initialized successfully using service account file.",
  );
} catch (error) {
  console.error("Firebase Admin SDK initialization error:", error);
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(cors());

// Health check endpoint
app.get("/", (req, res) => {
  res.status(200).json({
    message: "PawConnect Backend is running",
    timestamp: new Date().toISOString(),
  });
});

// Validate environment variables
const requiredEnvVars = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_REGION",
  "COGNITO_CLIENT_ID",
  "FIREBASE_PROJECT_ID",
];
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  console.error(
    `Missing required environment variables: ${missingEnvVars.join(", ")}`,
  );
  process.exit(1);
}

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// S3 client for uploading pet images (will use AWS creds from env)
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Signup endpoint - POST /auth/signup
app.post("/auth/signup", async (req, res) => {
  let { username, password, email, name, role, specialization } = req.body;

  if (!username || !password || !email || !name || !role) {
    return res.status(400).json({
      error: "Username, password, email, name, and role are required.",
    });
  }

  if (role === "Vet" && !specialization) {
    return res
      .status(400)
      .json({ error: "Specialization is required for Vets." });
  }

  const params = {
    ClientId: process.env.COGNITO_CLIENT_ID,
    Username: String(username).trim(),
    Password: password,
    UserAttributes: [
      { Name: "email", Value: String(email).trim().toLowerCase() },
      { Name: "name", Value: String(name).trim() },
      { Name: "custom:username", Value: String(username).trim() },
      { Name: "custom:role", Value: String(role).trim() },
    ],
  };

  try {
    const command = new SignUpCommand(params);
    const response = await cognitoClient.send(command);

    // After successful signup, immediately sync user to Firebase
    const userMap = {
      userId: response.UserSub,
      username: String(username).trim(),
      email: String(email).trim().toLowerCase(),
      fullName: String(name).trim(),
      profileImage: "",
      role: String(role).trim(),
    };

    if (userMap.role === "Vet") {
      userMap.specialization = String(specialization || "").trim();
    }

    const db = admin.database();
    const ref = db.ref(`Users/${userMap.username}`);
    await ref.update(userMap);

    res.status(200).json({
      message:
        "User signed up and synced successfully. Please check your email for the verification code.",
      userSub: response.UserSub,
    });
  } catch (error) {
    console.error("Error during sign up:", error);
    let errorMessage = "An error occurred during signup.";
    if (error.name === "UsernameExistsException") {
      errorMessage = "Username already exists.";
    } else if (error.name === "InvalidPasswordException") {
      errorMessage = "Password does not meet the required complexity.";
    } else if (error.name === "InvalidParameterException") {
      errorMessage = "Invalid input parameters.";
    }
    res.status(400).json({ error: errorMessage });
  }
});

// Verify endpoint - POST /auth/verify
app.post("/auth/verify", async (req, res) => {
  let { username, otp } = req.body;

  if (!username || !otp) {
    return res.status(400).json({ error: "Username and OTP are required." });
  }

  const params = {
    ClientId: process.env.COGNITO_CLIENT_ID,
    Username: String(username).trim(),
    ConfirmationCode: String(otp).trim(),
  };

  try {
    const command = new ConfirmSignUpCommand(params);
    await cognitoClient.send(command);
    res.status(200).json({ message: "User verified successfully." });
  } catch (error) {
    console.error("Error during verification:", error);
    let errorMessage = "An error occurred during verification.";
    if (error.name === "CodeMismatchException") {
      errorMessage = "Invalid OTP. Please check and try again.";
    } else if (error.name === "ExpiredCodeException") {
      errorMessage = "OTP has expired. Please request a new one.";
    } else if (error.name === "UserNotFoundException") {
      errorMessage = "User does not exist.";
    } else if (error.name === "NotAuthorizedException") {
      errorMessage = "User is already confirmed.";
    }
    res.status(400).json({ error: errorMessage });
  }
});

// Login endpoint - POST /auth/login
app.post("/auth/login", async (req, res) => {
  let { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required." });
  }

  const params = {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: process.env.COGNITO_CLIENT_ID,
    AuthParameters: {
      USERNAME: String(username).trim(),
      PASSWORD: password,
    },
  };

  try {
    const command = new InitiateAuthCommand(params);
    const { AuthenticationResult } = await cognitoClient.send(command);

    if (AuthenticationResult) {
      const idTokenPayload = JSON.parse(
        Buffer.from(
          AuthenticationResult.IdToken.split(".")[1],
          "base64",
        ).toString(),
      );
      res.status(200).json({
        message: "Login successful",
        idToken: AuthenticationResult.IdToken,
        accessToken: AuthenticationResult.AccessToken,
        refreshToken: AuthenticationResult.RefreshToken,
        user: {
          username:
            idTokenPayload["custom:username"] ||
            idTokenPayload["cognito:username"],
          email: idTokenPayload.email,
          sub: idTokenPayload.sub,
          name: idTokenPayload.name,
          role: idTokenPayload["custom:role"],
        },
      });
    } else {
      res
        .status(400)
        .json({ error: "Login failed. Please check your credentials." });
    }
  } catch (error) {
    console.error("Error during login:", error);
    let errorMessage = "An error occurred during login.";
    if (error.name === "UserNotConfirmedException") {
      errorMessage = "User account is not confirmed. Please verify your email.";
    } else if (error.name === "NotAuthorizedException") {
      errorMessage = "Invalid username or password.";
    } else if (error.name === "UserNotFoundException") {
      errorMessage = "User does not exist.";
    }
    res.status(400).json({ error: errorMessage });
  }
});

// Forgot Password endpoint - POST /auth/forgot-password
app.post("/auth/forgot-password", async (req, res) => {
  let { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: "Username is required." });
  }

  const params = {
    ClientId: process.env.COGNITO_CLIENT_ID,
    Username: String(username).trim(),
  };

  try {
    const command = new ForgotPasswordCommand(params);
    await cognitoClient.send(command);
    res.status(200).json({
      message:
        "Password reset code sent to your registered email. Please check your email for the reset code.",
    });
  } catch (error) {
    console.error("Error during forgot password:", error);
    let errorMessage = "An error occurred during password reset request.";
    if (error.name === "UserNotFoundException") {
      errorMessage = "User does not exist.";
    } else if (error.name === "InvalidParameterException") {
      errorMessage = "Invalid input parameters.";
    } else if (error.name === "LimitExceededException") {
      errorMessage = "Too many attempts. Please try again later.";
    } else if (error.name === "UserNotConfirmedException") {
      errorMessage =
        "User account is not confirmed. Please verify your email first.";
    }
    res.status(400).json({ error: errorMessage });
  }
});

// Confirm Forgot Password endpoint - POST /auth/confirm-forgot-password
app.post("/auth/confirm-forgot-password", async (req, res) => {
  let { username, otp, newPassword } = req.body;

  if (!username || !otp || !newPassword) {
    return res
      .status(400)
      .json({ error: "Username, OTP, and new password are required." });
  }

  const params = {
    ClientId: process.env.COGNITO_CLIENT_ID,
    Username: String(username).trim(),
    ConfirmationCode: String(otp).trim(),
    Password: newPassword,
  };

  try {
    const command = new ConfirmForgotPasswordCommand(params);
    await cognitoClient.send(command);
    res.status(200).json({
      message:
        "Password reset successfully. You can now log in with your new password.",
    });
  } catch (error) {
    console.error("Error during confirm forgot password:", error);
    let errorMessage = "An error occurred during password reset.";
    if (error.name === "CodeMismatchException") {
      errorMessage = "Invalid reset code. Please check and try again.";
    } else if (error.name === "ExpiredCodeException") {
      errorMessage = "Reset code has expired. Please request a new one.";
    } else if (error.name === "UserNotFoundException") {
      errorMessage = "User does not exist.";
    } else if (error.name === "InvalidPasswordException") {
      errorMessage = "Password does not meet the required complexity.";
    } else if (error.name === "LimitExceededException") {
      errorMessage = "Too many attempts. Please try again later.";
    } else if (error.name === "InvalidParameterException") {
      errorMessage = "Invalid input parameters.";
    }
    res.status(400).json({ error: errorMessage });
  }
});

// Add Pet endpoint - POST /pets
// Expects JSON: { username, petName, type, age, breed, vaccinated, lastVaccination }
app.post("/pets", async (req, res) => {
  try {
    const {
      username,
      petName,
      type,
      age,
      breed,
      vaccinated,
      lastVaccination,
      imageBase64,
    } = req.body || {};

    if (!username || !petName || !type || !age) {
      return res
        .status(400)
        .json({ error: "username, petName, type and age are required." });
    }

    const db = admin.database();
    const petRef = db.ref(`Pets/${String(username).trim()}`);
    const newRef = petRef.push();
    // If an image was supplied as base64 (optionally data URL), upload to S3 first
    let imageUrl = "";
    try {
      if (imageBase64) {
        let base64Data = imageBase64;
        let contentType = "image/jpeg";
        const dataUrlMatch = String(base64Data).match(
          /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/,
        );
        if (dataUrlMatch) {
          contentType = dataUrlMatch[1];
          base64Data = dataUrlMatch[2];
        }

        const buffer = Buffer.from(base64Data, "base64");
        const ext = (contentType.split("/")[1] || "jpg").split("+")[0];
        const bucket =
          process.env.PETS_S3_BUCKET ||
          process.env.S3_BUCKET ||
          "pawconnect-profile-images";
        const key = `pets/${String(username).trim()}_${Date.now()}.${ext}`;

        const putParams = {
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          ACL: "public-read",
        };

        await s3Client.send(new PutObjectCommand(putParams));

        // Construct a public URL for the uploaded object
        const region = process.env.AWS_REGION || "us-east-1";
        imageUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
      }
    } catch (uploadErr) {
      console.error("S3 upload failed:", uploadErr);
      // proceed without image URL but log the error
    }

    const petData = {
      petName: String(petName).trim(),
      type: String(type).trim(),
      age: String(age).trim(),
      breed: breed ? String(breed).trim() : "",
      vaccinated: Boolean(vaccinated),
      imageUrl: imageUrl,
      lastVaccination: lastVaccination ? String(lastVaccination).trim() : "",
      createdAt: Date.now(),
    };

    await newRef.set(petData);

    res
      .status(200)
      .json({ message: "Pet saved successfully.", key: newRef.key, imageUrl });
  } catch (error) {
    console.error("Error saving pet:", error);
    res.status(500).json({ error: "Failed to save pet." });
  }
});

// Get Pets for a username - GET /pets/:username
app.get("/pets/:username", async (req, res) => {
  try {
    const username = String(req.params.username || "").trim();
    if (!username) return res.status(400).json({ error: "username is required in path" });

    const db = admin.database();
    const ref = db.ref(`Pets/${username}`);
    const snapshot = await ref.once("value");

    const pets = [];
    snapshot.forEach((child) => {
      const val = child.val() || {};
      pets.push({
        id: child.key,
        petName: val.petName || "",
        imageUrl: val.imageUrl || "",
        breed: val.breed || "",
        age: val.age || "",
        vaccinated: !!val.vaccinated,
        lastVaccination: val.lastVaccination || "",
        createdAt: val.createdAt || null,
      });
    });

    res.status(200).json({ pets });
  } catch (error) {
    console.error("Error fetching pets:", error);
    res.status(500).json({ error: "Failed to fetch pets." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
