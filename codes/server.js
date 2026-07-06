const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const otpStore = new Map();

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function setOtp(email, otp) {
  otpStore.set(email.toLowerCase(), { otp, expiresAt: Date.now() + 5 * 60 * 1000 });
}

function getOtp(email) {
  const entry = otpStore.get(email.toLowerCase());
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(email.toLowerCase());
    return null;
  }
  return entry;
}

function clearOtp(email) {
  otpStore.delete(email.toLowerCase());
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  isVerified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

const officeSchema = new mongoose.Schema({
  office_name: String,
  department_type: String,
  location_district: String,
  service_name: String,
  start_time: String,
  end_time: String,
  est_processing_time: String,
  best_time_window: String,
  docs: [String],
  base_fee: Number,
  additional_charges: Number,
  payment_notes: String,
  route_steps: String,
  common_mistakes: String,
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

const User = mongoose.model('User', userSchema);
const OfficeRegistration = mongoose.model('OfficeRegistration', officeSchema);

function normalizeDocs(body) {
  const docsValue = body.docs || body['docs[]'];
  if (Array.isArray(docsValue)) return docsValue;
  if (!docsValue) return [];
  return [docsValue];
}

function successPage(message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Submission Saved</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f4f7ff; color: #14213d; margin: 0; display: grid; place-items: center; min-height: 100vh; }
    .card { background: white; padding: 28px; border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); max-width: 480px; text-align: center; }
    a { display: inline-block; margin-top: 16px; color: #003893; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Success</h2>
    <p>${message}</p>
    <a href="/office-register.html">Go back to the form</a>
  </div>
</body>
</html>`;
}

app.get('/api/health', async (req, res) => {
  res.json({
    ok: true,
    dbState: mongoose.connection.readyState,
    message: mongoose.connection.readyState === 1 ? 'Database connected' : 'Database not ready'
  });
});

app.post('/api/auth/send-otp', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ message: 'Email is required.' });

  try {
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const otp = generateOtp();
    setOtp(email, otp);
    res.json({ message: 'OTP sent to your email.', otp, preview: true });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ message: 'Unable to send OTP right now.' });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  const { email, otp, name, password } = req.body || {};
  if (!email || !otp || !name || !password) {
    return res.status(400).json({ message: 'Email, OTP, name and password are required.' });
  }

  try {
    const entry = getOtp(email);
    if (!entry || entry.otp !== otp) {
      return res.status(401).json({ message: 'Invalid or expired OTP.' });
    }

    const user = await User.create({ name, email: email.toLowerCase(), password, isVerified: true });
    clearOtp(email);
    res.status(201).json({
      message: 'Account created successfully.',
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ message: 'Unable to create account right now.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase(), password });
    if (!user) {
      return res.status(401).json({ message: 'Email or password is incorrect.' });
    }

    res.json({
      message: 'Signed in successfully.',
      user: { id: user._id, name: user.name, email: user.email, isVerified: user.isVerified }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Unable to sign in right now.' });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ message: 'Email is required.' });

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: 'No account found with that email.' });
    }

    const otp = generateOtp();
    setOtp(email, otp);
    res.json({ message: 'Reset OTP sent to your email.', otp, preview: true });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Unable to process reset request.' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { email, otp, password } = req.body || {};
  if (!email || !otp || !password) {
    return res.status(400).json({ message: 'Email, OTP and password are required.' });
  }

  try {
    const entry = getOtp(email);
    if (!entry || entry.otp !== otp) {
      return res.status(401).json({ message: 'Invalid or expired reset OTP.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'User not found.' });

    user.password = password;
    await user.save();
    clearOtp(email);
    res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Unable to reset password.' });
  }
});

app.post('/api/register-office', async (req, res) => {
  try {
    const registration = await OfficeRegistration.create({
      office_name: req.body.office_name,
      department_type: req.body.department_type,
      location_district: req.body.location_district,
      service_name: req.body.service_name,
      start_time: req.body.start_time,
      end_time: req.body.end_time,
      est_processing_time: req.body.est_processing_time,
      best_time_window: req.body.best_time_window,
      docs: normalizeDocs(req.body),
      base_fee: Number(req.body.base_fee || 0),
      additional_charges: Number(req.body.additional_charges || 0),
      payment_notes: req.body.payment_notes,
      route_steps: req.body.route_steps,
      common_mistakes: req.body.common_mistakes
    });

    res.status(201).send(successPage(`Your office registration was stored successfully in MongoDB. ID: ${registration._id}`));
  } catch (error) {
    console.error('Office registration error:', error);
    res.status(500).send(successPage('We could not save your registration. Please check your MongoDB connection.'));
  }
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'homepage.html'));
});

app.use(express.static(__dirname));

async function startServer() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/government-sewa';

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log('MongoDB connected successfully.');
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    console.log('Server will continue running; update your MONGODB_URI in the .env file to connect to Atlas or a local MongoDB instance.');
  }

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = app;
