/* ═══════════════════════════════════════════════════════════════
   Beyond Kilos — Main Frontend JavaScript
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
const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000' : window.location.origin;

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
      // Only redirect to login if we are in a protected area
      if (window.location.pathname.startsWith('/portal') || window.location.pathname.startsWith('/admin')) {
        window.location.href = '/login.html';
      } else {
        // Just reload to clear UI state if on homepage/pricing
        if (typeof BeyondKilos !== 'undefined' && typeof window !== 'undefined') {
          console.warn('Session expired. Cleared auth silently.');
        }
      }
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

// ── Geo-Location & Currency Management ───────────────────────
let _detectedCountry = null;

async function detectCountry() {
  if (_detectedCountry) return _detectedCountry;
  const cached = localStorage.getItem('bk_country');
  if (cached) {
    _detectedCountry = cached;
    return cached;
  }

  // 1. Try IP Geolocation API 1 (geojs.io)
  try {
    const res = await fetch('https://get.geojs.io/v1/ip/country.json');
    if (res.ok) {
      const data = await res.json();
      if (data && data.country) {
        _detectedCountry = data.country.toUpperCase();
        localStorage.setItem('bk_country', _detectedCountry);
        return _detectedCountry;
      }
    }
  } catch (e) {}

  // 2. Try IP Geolocation API 2 (country.is)
  try {
    const res2 = await fetch('https://api.country.is');
    if (res2.ok) {
      const data2 = await res2.json();
      if (data2 && data2.country) {
        _detectedCountry = data2.country.toUpperCase();
        localStorage.setItem('bk_country', _detectedCountry);
        return _detectedCountry;
      }
    }
  } catch (e) {}

  // 3. Fallback to timezone
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz.includes('Calcutta') || tz.includes('Kolkata')) {
      _detectedCountry = 'IN';
    } else {
      _detectedCountry = 'US';
    }
  } catch (e) {
    _detectedCountry = 'IN';
  }

  localStorage.setItem('bk_country', _detectedCountry);
  return _detectedCountry;
}

function getCachedCountry() {
  if (_detectedCountry) return _detectedCountry;
  const cached = localStorage.getItem('bk_country');
  if (cached) {
    _detectedCountry = cached;
    return cached;
  }
  // Synchronous preliminary check via browser timezone before fetch completes
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz && !tz.includes('Calcutta') && !tz.includes('Kolkata')) {
      return 'INTL';
    }
  } catch (e) {}
  return 'IN';
}

function isInternational() {
  const c = getCachedCountry();
  return c !== 'IN';
}

function getCurrency() {
  return isInternational() ? 'USD' : 'INR';
}

function sanitizeInternationalUI() {
  if (!isInternational()) return;
  // Hide any domestic-only offers and elements from foreign visitors
  document.querySelectorAll('.domestic-only, [data-domestic-only]').forEach(el => {
    el.style.display = 'none';
  });
  const diwaliTop = document.getElementById('diwaliTopBar');
  if (diwaliTop) diwaliTop.style.display = 'none';
  const diwaliHome = document.getElementById('diwaliHomeOfferCard');
  if (diwaliHome) diwaliHome.style.display = 'none';
  const diwaliPricing = document.getElementById('diwaliOfferSection');
  if (diwaliPricing) diwaliPricing.style.display = 'none';
  // Redact any domestic rupee price tags on special pages
  document.querySelectorAll('.domestic-price-badge').forEach(el => {
    el.textContent = 'Personalized 1-on-1 plans';
  });
  document.querySelectorAll('.domestic-price-faq').forEach(el => {
    el.textContent = 'All plans include 1-on-1 video consultations, dedicated WhatsApp support, personalized diet plans, and lab report review. Your initial consultation is free.';
  });
}

// Automatically detect country & sanitize UI on load
if (typeof window !== 'undefined') {
  detectCountry().then(() => {
    sanitizeInternationalUI();
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sanitizeInternationalUI);
  } else {
    sanitizeInternationalUI();
  }
}

// Make helpers available globally
window.BeyondKilos = {
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
  detectCountry,
  getCachedCountry,
  isInternational,
  getCurrency,
  sanitizeInternationalUI,
};

// ── GA4 WhatsApp & Consultation CTA Click Tracking ──────────
(function initConversionClickTracking() {
  if (typeof document === 'undefined') return;

  let lastWaClickTime = 0;
  let lastCtaClickTime = 0;
  document.addEventListener('click', function(e) {
    const waLink = e.target.closest('a[href*="wa.me"], a[href*="api.whatsapp.com"]');
    if (waLink) {
      const now = Date.now();
      if (now - lastWaClickTime < 1000) return;
      lastWaClickTime = now;

      if (typeof window.gtag === 'function') {
        window.gtag('event', 'contact_whatsapp', {
          event_category: 'engagement',
          event_label: 'WhatsApp Contact Click',
          link_url: waLink.href,
          page_location: window.location.href,
          page_title: document.title
        });
      }
      return;
    }

    const bookLink = e.target.closest('a[href*="book.html"]');
    if (bookLink) {
      const now = Date.now();
      if (now - lastCtaClickTime < 1000) return;
      lastCtaClickTime = now;

      if (typeof window.gtag === 'function') {
        window.gtag('event', 'consultation_cta_click', {
          event_category: 'engagement',
          event_label: (bookLink.textContent || '').trim().slice(0, 80) || 'Book Consultation',
          page_location: window.location.href,
          page_title: document.title
        });
      }
    }
  }, { passive: true });
})();

