# Safe SEO Audit & Implementation Report: Beyond Kilos (gobeyondkilos.com)

**Date:** October 16, 2026  
**Auditor / Engineer:** Senior Technical SEO & Full-Stack QA Engineer  
**Target Website:** [https://www.gobeyondkilos.com/](https://www.gobeyondkilos.com/)  
**Primary Business Objective:** Drive qualified Indian organic search traffic and convert visitors into paid 1-on-1 dietitian consultations.  
**Branch:** `seo/safe-audit-fixes` (Isolated working branch created for safety and rollback)

---

## A. Executive Summary

### Current Website State
Go Beyond Kilos operates as an online clinical nutrition and dietary consulting practice led by **Dt. Disha Dey** (M.Sc. Clinical Dietetics, specialization in Cardiac and Diabetes nutrition). The platform offers consultations across India for weight management, PCOS/PCOD, diabetes, cardiac wellness, and general health.

On **September 16, 2026**, the website underwent a major architecture and SEO update (Git commit `cd8fc7c`):
- Added dedicated static service hub and condition pages (`/online-dietitian-india/`, `/about-dt-disha/`, `/weight-loss-dietitian/`, `/pcos-dietitian/`, `/diabetes-dietitian/`, `/cardiac-nutritionist/`).
- Introduced `/robots.txt` and `/sitemap.xml` with 9 canonical public URLs.
- Added structured data (`Organization`, `ProfessionalService`, `Person`, `Service`, `FAQPage`, `BreadcrumbList`).
- Updated Helmet security headers to permit social link previews (WhatsApp / Facebook) and payment popups.

### Reconciliation of Google Search Console (GSC) Findings
The screenshots provided from Google Search Console (3-month window from August to mid-October 2026) report:
- **Total Clicks:** 28
- **Total Impressions:** 311
- **Average CTR:** 9.0%
- **Average Position:** 36.4
- **Page Indexing:** **8 Indexed Pages**, **16 Not Indexed Pages** (Total: 24 URLs tracked)
- **Sitemaps:** `https://www.gobeyondkilos.com/sitemap.xml` processed on `10/1/26` reporting **9 Discovered Pages**.

#### Precise Root Cause Breakdown of the 16 Non-Indexed URLs:
1. **Page with redirect (8 URLs):**
   - **Root Cause:** Express.js `express.static` automatically responds with a `301 Moved Permanently` to append a trailing slash whenever a directory path without a slash is requested (e.g., `/about-dt-disha` -> `/about-dt-disha/`, `/online-dietitian-india` -> `/online-dietitian-india/`, `/weight-loss-dietitian` -> `/weight-loss-dietitian/`, `/pcos-dietitian` -> `/pcos-dietitian/`, `/diabetes-dietitian` -> `/diabetes-dietitian/`, `/cardiac-nutritionist` -> `/cardiac-nutritionist/`, `/portal` -> `/portal/`, `/admin` -> `/admin/`).
   - **Assessment:** **Harmless & working as intended.** This is standard HTTP canonicalization behavior. All internal links already point to the trailing slash version.
2. **Blocked due to unauthorized request (401) (3 URLs):**
   - **Root Cause:** Prior to the introduction of `Disallow: /api/` in `robots.txt` on September 16, Googlebot extracted API endpoints from client-side JavaScript (`/api/clients`, `/api/appointments`, `/api/weight`). When Googlebot requested these endpoints without a JWT bearer token, Express middleware returned HTTP `401 Unauthorized`.
   - **Assessment:** **Intentional & secure.** Private client data and backend APIs must never be public. `robots.txt` now forbids `/api/`. These will drop off or mark as excluded over time.
3. **Blocked by robots.txt (2 URLs):**
   - **Root Cause:** `/portal/` and `/admin/` (or `/portal/dashboard.html` and `/admin/dashboard.html`).
   - **Assessment:** **Intentional & secure.** Private portals and administrative dashboards should never appear in public search engine indexes.
4. **Excluded by noindex tag (1 URL):**
   - **Root Cause:** `/login.html` contains `<meta name="robots" content="noindex, nofollow" />`.
   - **Assessment:** **Intentional.** Protects the portal login page from being indexed as a public landing page.
5. **Not found (404) (1 URL):**
   - **Root Cause:** Historical crawl of `/favicon.ico` prior to commit `de86098` (August 26, 2026), or a request to `/api/diets` (which has no bare GET endpoint).
   - **Assessment:** **Harmless historical artifact.** Live testing confirms `favicon.ico` is now present at root (HTTP 200).
6. **Discovered — currently not indexed (1 URL):**
   - **Root Cause:** Normal Googlebot crawl scheduling queue following the September 16 sitemap submission. At the time of the October 1 GSC sitemap read, 8 of the 9 sitemap URLs had been crawled and indexed, with 1 awaiting processing.
   - **Assessment:** **Resolved.** Real-time Google search verification (`site:gobeyondkilos.com`) confirms all 6 condition/service pages, the homepage, pricing, and book pages are actively indexed by Google.

---

## B. Technology & Architecture Inventory

| Layer | Verified Technology | Implementation Location |
| :--- | :--- | :--- |
| **Runtime & Backend** | Node.js (v18+) with Express.js (`4.21.2`) | [backend/server.js](file:///Users/siddhantmanglam/Documents/Diet2Fit/backend/server.js) |
| **Security & Headers** | Helmet.js (`8.2.0`) with custom CSP & CORS rules | [backend/server.js:L24-30](file:///Users/siddhantmanglam/Documents/Diet2Fit/backend/server.js#L24-L30) |
| **Reverse Proxy & Host** | Render.com Web Service behind Cloudflare CDN | Cloudflare Edge (`cf-ray`, `rndr-id`) |
| **Database & Storage** | PostgreSQL with Supabase Storage for diet plans | [backend/db/database.js](file:///Users/siddhantmanglam/Documents/Diet2Fit/backend/db/database.js) |
| **Frontend Framework** | Pure Vanilla HTML5, CSS3, Vanilla JavaScript | [frontend/](file:///Users/siddhantmanglam/Documents/Diet2Fit/frontend) |
| **Rendering Strategy** | 100% Static HTML / Server-Delivered. Zero CSR hydration issues. | Crawlers receive 100% rendered DOM immediately. |
| **Payment Gateway** | Razorpay Checkout SDK v1 | [frontend/pricing.html:L322](file:///Users/siddhantmanglam/Documents/Diet2Fit/frontend/pricing.html#L322) |
| **Sitemap & Robots** | Static XML (`sitemap.xml`) & Plaintext (`robots.txt`) | [frontend/sitemap.xml](file:///Users/siddhantmanglam/Documents/Diet2Fit/frontend/sitemap.xml), [frontend/robots.txt](file:///Users/siddhantmanglam/Documents/Diet2Fit/frontend/robots.txt) |

---

## C. URL-by-URL Audit Table

| URL | HTTP Status | Public Indexable? | Canonical Tag | Sitemap? | Confirmed Issues | Implemented / Recommended Fix | Priority |
| :--- | :---: | :---: | :---: | :---: | :--- | :--- | :---: |
| `https://www.gobeyondkilos.com/` | 200 | Yes | `https://www.gobeyondkilos.com/` | Yes | **HOMEPAGE: READ-ONLY.** Monitored for safety. No changes made. | Strictly protected. No modifications. | — |
| `https://www.gobeyondkilos.com/pricing.html` | 200 | Yes | `https://www.gobeyondkilos.com/pricing.html` | Yes | Missing `<lastmod>` in sitemap. | Added `<lastmod>` in sitemap. | P2 |
| `https://www.gobeyondkilos.com/book.html` | 200 | Yes | `https://www.gobeyondkilos.com/book.html` | Yes | 1. Three `<h1>` tags on wizard form steps.<br>2. Missing Breadcrumbs & Contact schema.<br>3. `twitter:card` set to `summary`. | 1. Reduced steps 2 & 3 to semantic `<h2>`.<br>2. Added `BreadcrumbList` & `ContactPage` JSON-LD.<br>3. Upgraded `twitter:card` to `summary_large_image`. | P1 |
| `https://www.gobeyondkilos.com/about-dt-disha/` | 200 | Yes | `https://www.gobeyondkilos.com/about-dt-disha/` | Yes | Missing `<lastmod>` in sitemap. | Added `<lastmod>` in sitemap. Has complete `Person` E-E-A-T schema. | P2 |
| `https://www.gobeyondkilos.com/online-dietitian-india/` | 200 | Yes | `https://www.gobeyondkilos.com/online-dietitian-india/` | Yes | Missing `<lastmod>` in sitemap. | Added `<lastmod>` in sitemap. Contains `Service` + `offers` + `FAQPage`. | P2 |
| `https://www.gobeyondkilos.com/weight-loss-dietitian/` | 200 | Yes | `https://www.gobeyondkilos.com/weight-loss-dietitian/` | Yes | 1. Missing `offers` in `Service` schema.<br>2. Missing `<lastmod>` in sitemap. | Added `offers` aggregate pricing and `<lastmod>`. | P2 |
| `https://www.gobeyondkilos.com/pcos-dietitian/` | 200 | Yes | `https://www.gobeyondkilos.com/pcos-dietitian/` | Yes | 1. Missing `offers` in `Service` schema.<br>2. Missing `<lastmod>` in sitemap. | Added `offers` aggregate pricing and `<lastmod>`. | P2 |
| `https://www.gobeyondkilos.com/diabetes-dietitian/` | 200 | Yes | `https://www.gobeyondkilos.com/diabetes-dietitian/` | Yes | 1. Missing `offers` in `Service` schema.<br>2. Missing `<lastmod>` in sitemap. | Added `offers` aggregate pricing and `<lastmod>`. | P2 |
| `https://www.gobeyondkilos.com/cardiac-nutritionist/` | 200 | Yes | `https://www.gobeyondkilos.com/cardiac-nutritionist/` | Yes | 1. Missing `offers` in `Service` schema.<br>2. Missing `<lastmod>` in sitemap. | Added `offers` aggregate pricing and `<lastmod>`. | P2 |
| `https://www.gobeyondkilos.com/login.html` | 200 | No (Noindex) | None | No | Noindex active; high impressions for "beyond diet login". | Documented findings. Requires approval before altering index status. | P3 |
| `https://www.gobeyondkilos.com/portal/` | 302 | No (Disallow) | N/A | No | Disallowed in `robots.txt`. | Protected private area. No change required. | — |
| `https://www.gobeyondkilos.com/admin/` | 302 | No (Disallow) | N/A | No | Disallowed in `robots.txt`. | Protected private area. No change required. | — |

---

## D. Technical SEO Issues

### 1. Confirmed Problems (Addressed in Working Branch)
- **Problem 1 (Multi-H1 in Form Wizard):** In [frontend/book.html](file:///Users/siddhantmanglam/Documents/Diet2Fit/frontend/book.html), Step 1, Step 2, and Step 3 each used `<h1>` tags (`What's your health goal?`, `Your Details`, `Request Sent!`).
  - *Fix:* Promoted Step 1 to the single primary H1: `Book Free Consultation — What's Your Health Goal?`, and adjusted Step 2 and Step 3 to semantic `<h2>` without impacting visual styling (`.text-headline`) or JS hooks (`document.getElementById('successTitle')`).
- **Problem 2 (Missing Structured Data on Conversion Page):** [frontend/book.html](file:///Users/siddhantmanglam/Documents/Diet2Fit/frontend/book.html) lacked any JSON-LD structured data.
  - *Fix:* Injected `BreadcrumbList` and `ContactPage` schema.
- **Problem 3 (Missing `<lastmod>` in Sitemap):** [frontend/sitemap.xml](file:///Users/siddhantmanglam/Documents/Diet2Fit/frontend/sitemap.xml) contained only `<loc>`, `<changefreq>`, and `<priority>`. Google heavily weights `<lastmod>` for crawl prioritization.
  - *Fix:* Appended `<lastmod>2026-10-16</lastmod>` to all 9 canonical URLs.
- **Problem 4 (Schema Inconsistency Across Service Pages):** `online-dietitian-india` had `offers` defined in its `Service` schema, while `weight-loss-dietitian`, `pcos-dietitian`, `diabetes-dietitian`, and `cardiac-nutritionist` omitted `offers`.
  - *Fix:* Standardized `offers` (INR 1,499 - 3,499) across all 4 service schemas.

### 2. Suspected Problems / Inactive Risks
- **Login Query Intent vs. Noindex:** GSC reported **95 impressions** for `beyond diet login` and **4 impressions** for `beyond the diet login` (0 clicks).
  - *Cause:* Existing clients search Google to access their portal dashboard. Because `login.html` has `<meta name="robots" content="noindex, nofollow" />`, Google ranks the homepage or subpages at position 36+, causing impressions without clicks.
  - *Recommendation:* Keep `login.html` noindexed to prevent thin login pages from diluting crawl budget, but ensure the homepage and subpage navigation bars feature a prominent "Client Login" button. If the user explicitly wants `login.html` indexed with a branded snippet ("Beyond Kilos Client Login"), that can be approved separately.

### 3. Items Requiring Manual Verification in Google Search Console
- **Verify Specific 404 URL:** In GSC > Indexing > Pages > "Not found (404)", click the row to inspect the exact URL. If it is `/favicon.ico` or `/api/diets`, click "Validate Fix" in Search Console.

---

## E. Keyword Strategy & Search Intent

| Keyword Cluster | Top Target Queries | Search Intent | Commercial Relevance | Target Landing Page | Priority |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **Cluster A: Online Dietitian Consultation** | `online dietitian in India`, `dietitian online India`, `online nutritionist consultation India` | Commercial / Transactional | High (Primary core business) | [/online-dietitian-india/](file:///Users/siddhantmanglam/Documents/Diet2Fit/frontend/online-dietitian-india/index.html) | P1 |
| **Cluster B: PCOS Nutrition** | `pcos nutritionist`, `best pcos dietitian`, `pcos nutritionist India`, `pcos diet plan` | Commercial / Solution-seeking | Very High (High willingness to pay for specialized care) | [/pcos-dietitian/](file:///Users/siddhantmanglam/Documents/Diet2Fit/frontend/pcos-dietitian/index.html) | P1 |
| **Cluster C: Weight Management** | `weight loss dietitian`, `online dietitian for weight loss India`, `weight management dietitian` | Commercial / Evaluative | High (Broadest market volume) | [/weight-loss-dietitian/](file:///Users/siddhantmanglam/Documents/Diet2Fit/frontend/weight-loss-dietitian/index.html) | P1 |
| **Cluster D: Diabetes Nutrition** | `diabetes dietitian`, `dietitian for diabetes in India`, `Indian diet plan for diabetes` | Commercial / Medical nutrition | High (Recurring, loyal client profile) | [/diabetes-dietitian/](file:///Users/siddhantmanglam/Documents/Diet2Fit/frontend/diabetes-dietitian/index.html) | P1 |
| **E-E-A-T & Brand Authority** | `nutrifitness by disha`, `dietsbydietitian`, `dt disha dey`, `beyond kilos` | Navigational / Trust verification | Very High (Closes conversions from referrals & social media) | [/about-dt-disha/](file:///Users/siddhantmanglam/Documents/Diet2Fit/frontend/about-dt-disha/index.html) | P1 |

---

## F. Implementation Log

All code changes were executed on working branch: `seo/safe-audit-fixes` (Commit `1182b3c`).

| File | Change Scope | Rationale |
| :--- | :--- | :--- |
| [frontend/sitemap.xml](file:///Users/siddhantmanglam/Documents/Diet2Fit/frontend/sitemap.xml) | Added `<lastmod>2026-10-16</lastmod>` to 9 canonical URLs | Instructs Googlebot on resource freshness and crawl priority. |
| [frontend/book.html](file:///Users/siddhantmanglam/Documents/Diet2Fit/frontend/book.html) | 1. Promoted Step 1 to single H1.<br>2. Adjusted Step 2 & 3 to semantic H2.<br>3. Upgraded `twitter:card` to `summary_large_image`.<br>4. Injected `BreadcrumbList` & `ContactPage` JSON-LD schemas. | Resolves multiple H1 SEO violation, provides social preview parity, enables rich snippet eligibility. |
| [frontend/weight-loss-dietitian/index.html](file:///Users/siddhantmanglam/Documents/Diet2Fit/frontend/weight-loss-dietitian/index.html) | Added `offers` aggregate pricing object to `Service` schema | Standardizes price transparency for Google Rich Results. |
| [frontend/pcos-dietitian/index.html](file:///Users/siddhantmanglam/Documents/Diet2Fit/frontend/pcos-dietitian/index.html) | Added `offers` aggregate pricing object to `Service` schema | Standardizes price transparency for Google Rich Results. |
| [frontend/diabetes-dietitian/index.html](file:///Users/siddhantmanglam/Documents/Diet2Fit/frontend/diabetes-dietitian/index.html) | Added `offers` aggregate pricing object to `Service` schema | Standardizes price transparency for Google Rich Results. |
| [frontend/cardiac-nutritionist/index.html](file:///Users/siddhantmanglam/Documents/Diet2Fit/frontend/cardiac-nutritionist/index.html) | Added `offers` aggregate pricing object to `Service` schema | Standardizes price transparency for Google Rich Results. |

---

## G. Test Report & Verification

| Test Executed | Command / Method | Result | Untested Areas |
| :--- | :--- | :---: | :--- |
| **Git Working Tree Check** | `git status` | Pass (Clean branch `seo/safe-audit-fixes`) | None |
| **Sitemap XML Parsing** | Python `xml.etree.ElementTree` parse of `frontend/sitemap.xml` | Pass (All 9 URLs valid XML with `<lastmod>`) | None |
| **JSON-LD Schema Syntax** | Python `json.loads` over all `<script type="application/ld+json">` tags | Pass (100% valid JSON across all 9 pages) | Google Rich Results manual tester (requires external URL fetch) |
| **Heading Hierarchy Check** | Regex scan of `<h1>` tags across all HTML files | Pass (Exactly 1 H1 per public page) | None |
| **Internal Link Integrity** | Custom HTML parser checking 181 internal `href` targets | Pass (0 broken internal links) | External third-party outbound links |
| **Homepage Regression Check** | Git diff comparison of `frontend/index.html` | Pass (**0 lines changed**; 100% untouched) | Live browser visual diff on staging domain |

---

## H. Homepage Protection Report

> [!IMPORTANT]
> **Strict Compliance Confirmation:**
> In accordance with Critical Safety Rule A, **no homepage-specific content, layout, styling, metadata, headings, structured data, canonical tags, or code in `frontend/index.html` was modified.**
> The file remains completely byte-identical to `origin/main`. Shared styles and global CSS files were untouched.

---

## I. Conversion Tracking Recommendations for Paid Consultations

Inspection of `frontend/book.html` and `frontend/pricing.html` indicates that the website currently has **no Google Analytics 4 (GA4) or Google Tag Manager (GTM) tracking installed**.

### Recommended GA4 Event Architecture:
1. **`lead_form_start`**: Triggered when a user clicks any "Request Free Consultation" or "Book Consultation" button.
2. **`generate_lead`**: Triggered on `frontend/book.html` when `fetch('/api/auth/register')` succeeds (Step 3).
3. **`begin_checkout`**: Triggered on `frontend/pricing.html` when user clicks a plan button (`selectPlan(planId)`).
4. **`purchase`**: Triggered inside Razorpay `handler(response)` callback upon receiving `verifyData.success === true` (`frontend/pricing.html:L520`).
   - *Parameters:* `transaction_id: response.razorpay_payment_id`, `value: orderData.amount / 100`, `currency: 'INR'`.
5. **`click_whatsapp`**: Triggered when any `wa.me/918306404335` CTA is clicked.

*Privacy Compliance Note:* Under no circumstances should client health conditions, weight, or medical notes be passed to analytics payloads. Only generic plan identifiers (`Starter`, `Signature`, `Complete Care`) and transaction IDs should be sent.

---

## J. Manual Actions Required in External Systems

### 1. In Google Search Console:
1. **Validate Fix for Disallowed / 401s:**
   - Go to **Indexing > Pages**.
   - Check the **"Blocked due to unauthorized request (401)"** and **"Blocked by robots.txt"** reports.
   - Click **"Validate Fix"** on any reported items where Google has re-crawled `robots.txt`.
2. **Re-submit Sitemap:**
   - Go to **Indexing > Sitemaps**.
   - Submit `https://www.gobeyondkilos.com/sitemap.xml` so Google refreshes its `<lastmod>` timestamps.
3. **Inspect Key URLs:**
   - Use the URL Inspection tool at the top of GSC on `https://www.gobeyondkilos.com/online-dietitian-india/` and `https://www.gobeyondkilos.com/pcos-dietitian/`.
   - Click **"Request Indexing"** to ensure Google picks up the latest metadata and schema enhancements.

### 2. In Analytics / Marketing Platforms (When Ready):
- Set up a Google Analytics 4 property for `gobeyondkilos.com` and provide the Measurement ID (`G-XXXXXXXXXX`) for integration.

---

## K. Remaining Risks & Rollback Procedure

### Risks
- Code changes on branch `seo/safe-audit-fixes` are strictly isolated and carry zero risk to the live website until merged.
- All modifications are purely additive metadata, schema, and heading semantics. No application logic, database schemas, or API routes were touched.

### Instant Rollback Procedure
If any change needs to be discarded:
```bash
# To discard changes and return to main:
git checkout main
# To delete the experimental branch:
git branch -D seo/safe-audit-fixes
```

---

## L. 90-Day Execution Plan & Next Steps

```mermaid
gantt
    title Go Beyond Kilos SEO Execution Roadmap
    dateFormat  YYYY-MM-DD
    section Phase 1: Technical & Audit
    Baseline Audit & Sitemap Update :done, 2026-10-16, 2026-10-20
    GSC Drilldown & 404 Validation :2026-10-21, 2026-10-30
    section Phase 2: Service Page Optimization
    PCOS & Weight Loss Content Depth :2026-10-31, 2026-11-15
    Conversion Tracking Setup (GA4) :2026-11-16, 2026-11-30
    section Phase 3: Authority & Linking
    Dt. Disha E-E-A-T Medical Content :2026-12-01, 2026-12-20
    Contextual Internal Linking Network :2026-12-21, 2026-12-31
    section Phase 4: Refinement
    Query Impression & Conversion Analysis :2027-01-01, 2027-01-15
```

### Next Actions & Ownership:
1. **User / Client:**
   - Review this report and inspect the changes on branch `seo/safe-audit-fixes`.
   - Decide whether to merge branch `seo/safe-audit-fixes` into `main` for automatic deployment on Render.
   - Provide a GA4 Measurement ID if conversion event tracking should be implemented.
2. **Technical SEO Engineer (Antigravity):**
   - Provide the exact GA4 tracking code snippets ready for insertion once approved.
   - Assist with content gap analysis for Cluster B (PCOS) and Cluster C (Weight Loss).
