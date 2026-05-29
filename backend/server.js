require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Initialize database (runs schema + seed)
require('./db/database');

const setupSignaling = require('./socket/signaling');

// Route imports
const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const weightRoutes = require('./routes/weight');
const appointmentRoutes = require('./routes/appointments');
const dietRoutes = require('./routes/diets');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// ── Security & Middleware ─────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Login Rate Limiter to prevent brute-force attacks
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login requests per `window`
  message: { error: 'Too many login attempts, please try again after 15 minutes' }
});

// ── Static File Serving ──────────────────────────────────────────

app.use('/', express.static(path.join(__dirname, '..', 'frontend')));
app.use('/portal', express.static(path.join(__dirname, '..', 'client-portal')));
app.use('/admin', express.static(path.join(__dirname, '..', 'admin-panel')));

app.get('/portal/?', (req, res) => res.redirect('/portal/dashboard.html'));
app.get('/admin/?', (req, res) => res.redirect('/admin/dashboard.html'));

// ── API Routes ───────────────────────────────────────────────────
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/weight', weightRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/diets', dietRoutes);

// ── Health Check ─────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', brand: 'Diet2Fit', timestamp: new Date().toISOString() });
});

// ── WebRTC Signaling ─────────────────────────────────────────────
setupSignaling(io);

// ── Start Server ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('  🥗 ─────────────────────────────────────────');
  console.log(`  │  Diet2Fit Server Running`);
  console.log(`  │  http://localhost:${PORT}`);
  console.log(`  │`);
  console.log(`  │  Public Site:    http://localhost:${PORT}/`);
  console.log(`  │  Client Portal:  http://localhost:${PORT}/portal/`);
  console.log(`  │  Admin Panel:    http://localhost:${PORT}/admin/`);
  console.log('  │');
  console.log('  │  Admin Login: admin@diet2fit.com / admin123');
  console.log('  🥗 ─────────────────────────────────────────');
  console.log('');
});
