/* ═══════════════════════════════════════════════════════════════
   Diet2Fit — Main Frontend JavaScript
   Handles animations, navbar, and common interactions
   ═══════════════════════════════════════════════════════════════ */

// ── Navbar Scroll Effect ──────────────────────────────────────
const navbar = document.getElementById('navbar');
if (navbar) {
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });
}

// ── Mobile Nav Toggle ──────────────────────────────────────────
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');
if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    navLinks.classList.toggle('active');
  });
  // Close on link click
  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('active');
    });
  });
}

// ── Scroll Reveal Animations ──────────────────────────────────
const observerOptions = {
  root: null,
  rootMargin: '0px 0px -80px 0px',
  threshold: 0.1,
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, observerOptions);

document.querySelectorAll('.animate-fade-up').forEach(el => {
  observer.observe(el);
});

// ── Smooth Scroll for Anchor Links ──────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ── Toast Notification System ─────────────────────────────────
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="material-symbols-outlined" style="font-size:18px;">
      ${type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info'}
    </span>
    ${message}
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── Auth Helpers ──────────────────────────────────────────────
const API_BASE = window.location.origin;

function getToken() {
  return localStorage.getItem('diet2fit_token');
}

function getUser() {
  const user = localStorage.getItem('diet2fit_user');
  return user ? JSON.parse(user) : null;
}

function setAuth(token, user) {
  localStorage.setItem('diet2fit_token', token);
  localStorage.setItem('diet2fit_user', JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem('diet2fit_token');
  localStorage.removeItem('diet2fit_user');
}

function isLoggedIn() {
  return !!getToken();
}

async function apiRequest(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  try {
    const response = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Something went wrong');
    }

    return data;
  } catch (err) {
    if (err.message === 'Invalid or expired token.') {
      clearAuth();
      window.location.href = '/login.html';
    }
    throw err;
  }
}

// ── Format Date ──────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

// ── Session Validation (Persistent Login) ────────────────────
async function validateSession() {
  const token = getToken();
  if (!token) return null;
  
  try {
    const data = await apiRequest('/api/auth/me');
    if (data.user) {
      // Update stored user data in case it changed
      localStorage.setItem('diet2fit_user', JSON.stringify(data.user));
      return data.user;
    }
    return null;
  } catch (err) {
    // Token is invalid or expired — clear it silently
    clearAuth();
    return null;
  }
}

// Make helpers available globally
window.Diet2Fit = {
  showToast,
  getToken,
  getUser,
  setAuth,
  clearAuth,
  isLoggedIn,
  apiRequest,
  validateSession,
  formatDate,
  formatDateTime,
  getTodayDate,
  API_BASE,
};
