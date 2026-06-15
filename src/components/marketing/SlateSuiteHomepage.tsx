import Link from 'next/link'

/**
 * SLATESUITE marketing homepage.
 * Rendered at "/" for unauthenticated visitors.
 * All styles are self-contained in the <style> tag below.
 */
export function SlateSuiteHomepage() {
  return (
    <div className="ss-page">
      <style>{css}</style>

      {/* ── NAV ──────────────────────────────────────────────────── */}
      <nav>
        <div className="nav-inner">
          <div className="nav-logo">SLATE<span>SUITE</span></div>
          <ul className="nav-links">
            <li><a href="#features">Features</a></li>
            <li><a href="#budgets">Budgets</a></li>
            <li><a href="#invoicing">Invoicing</a></li>
          </ul>
          <div className="nav-actions">
            <Link href="/sign-in" className="nav-signin">Sign in</Link>
            <Link href="/sign-up" className="btn-primary">
              Get early access
              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7h10M7 2l5 5-5 5" /></svg>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section className="hero-section">
        <div className="hero">
          <div className="hero-copy">
            <div className="hero-badge">
              <div className="hero-badge-dot"></div>
              Built for film &amp; video production
            </div>
            <h1>Run your production business like a <em>studio.</em></h1>
            <p>Budgets, proposals, invoices, and call sheets — all in one place. Purpose-built for independent film and video production companies.</p>
            <div className="hero-ctas">
              <Link href="/sign-up" className="btn-primary-lg">
                Get early access
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px' }}><path d="M3 8h10M8 3l5 5-5 5" /></svg>
              </Link>
              <span className="hero-secondary">Already have an account? <Link href="/sign-in">Sign in</Link></span>
            </div>
          </div>

          {/* Mini app dashboard preview */}
          <div className="hero-mockup">
            <div className="mockup-topbar">
              <div className="topbar-dots"><span></span><span></span><span></span></div>
              <div className="topbar-url">slatesuite.io/projects</div>
            </div>
            <div className="mockup-layout">
              <div className="mockup-sidebar">
                <div className="sidebar-logo">
                  <svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M5 3V2M11 3V2M2 7h12" stroke="#fff" strokeWidth="1.3" fill="none" strokeLinecap="round" /></svg>
                </div>
                <div className="sidebar-icon active">
                  <svg viewBox="0 0 16 16"><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></svg>
                </div>
                <div className="sidebar-icon">
                  <svg viewBox="0 0 16 16"><path d="M13 13H3a1 1 0 01-1-1V5l4-3h7a1 1 0 011 1v9a1 1 0 01-1 1z" /><path d="M6 2v3H2" /></svg>
                </div>
                <div className="sidebar-icon">
                  <svg viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="1.5" /><path d="M5 8h6M5 5.5h6M5 10.5h4" strokeLinecap="round" /></svg>
                </div>
                <div className="sidebar-icon">
                  <svg viewBox="0 0 16 16"><circle cx="8" cy="6" r="3" /><path d="M2.5 13.5c0-2.485 2.462-4.5 5.5-4.5s5.5 2.015 5.5 4.5" strokeLinecap="round" /></svg>
                </div>
                <div className="sidebar-icon">
                  <svg viewBox="0 0 16 16"><path d="M13 4H3a1 1 0 00-1 1v7a1 1 0 001 1h10a1 1 0 001-1V5a1 1 0 00-1-1z" /><path d="M11 4V3a1 1 0 00-1-1H6a1 1 0 00-1 1v1" strokeLinecap="round" /></svg>
                </div>
              </div>
              <div className="mockup-main">
                <div className="mockup-header">
                  <div className="mockup-title">Projects</div>
                  <div className="mockup-new-btn">+ New</div>
                </div>
                <div className="project-card">
                  <div className="project-card-top">
                    <div>
                      <div className="project-name">Ridgeline — Brand Film</div>
                      <div className="project-client">Ridgeline Foods · Music Video</div>
                    </div>
                    <span className="status-badge badge-active">ACTIVE</span>
                  </div>
                  <div className="project-meta">
                    <div className="project-amount">$47,500</div>
                    <div className="project-tags">
                      <span className="project-tag">Proposal SENT</span>
                      <span className="project-tag">Invoice PAID</span>
                    </div>
                  </div>
                </div>
                <div className="project-card">
                  <div className="project-card-top">
                    <div>
                      <div className="project-name">Meridian — Campaign S/S 25</div>
                      <div className="project-client">Meridian Creative · Brand Campaign</div>
                    </div>
                    <span className="status-badge badge-active">ACTIVE</span>
                  </div>
                  <div className="project-meta">
                    <div className="project-amount">$82,000</div>
                    <div className="project-tags">
                      <span className="project-tag">Proposal SIGNED</span>
                      <span className="project-tag">Invoice SENT</span>
                    </div>
                  </div>
                </div>
                <div className="project-card">
                  <div className="project-card-top">
                    <div>
                      <div className="project-name">Strider — Anthem Spot</div>
                      <div className="project-client">Strider Global · Commercial</div>
                    </div>
                    <span className="status-badge badge-lead">LEAD</span>
                  </div>
                  <div className="project-meta">
                    <div className="project-amount">$130,000</div>
                    <div className="project-tags">
                      <span className="project-tag">Budget draft</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SOCIAL STRIP ─────────────────────────────────────────── */}
      <div className="social-strip">
        <div className="social-strip-inner">
          <strong>Everything between the slate and the invoice</strong>
          &nbsp;·&nbsp; Budgets &nbsp;·&nbsp; Proposals &nbsp;·&nbsp; E-signatures &nbsp;·&nbsp; Invoicing &nbsp;·&nbsp; Online Payments &nbsp;·&nbsp; Call Sheets &nbsp;·&nbsp; Actuals Tracking
        </div>
      </div>

      {/* ── FEATURE PILLS ────────────────────────────────────────── */}
      <div className="feature-nav" id="features">
        <div className="feature-nav-label">What&apos;s inside</div>
        <div className="feature-pills">
          <div className="feature-pill">
            <svg viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="1.5" /><path d="M5 8h6M5 5.5h3M5 10.5h4" strokeLinecap="round" /></svg>
            Production budgets
          </div>
          <div className="feature-pill">
            <svg viewBox="0 0 16 16"><path d="M10 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V5l-3-3z" /><path d="M10 2v3h3" /><path d="M5 9h6M5 11.5h4" strokeLinecap="round" /></svg>
            Proposals &amp; e-sign
          </div>
          <div className="feature-pill">
            <svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M2 7h12M6 7v6M5 3V1.5M11 3V1.5" strokeLinecap="round" /></svg>
            Invoicing
          </div>
          <div className="feature-pill">
            <svg viewBox="0 0 16 16"><path d="M8 2L2 5v4c0 3.1 2.5 5.5 6 6 3.5-.5 6-2.9 6-6V5L8 2z" /></svg>
            Online payments
          </div>
          <div className="feature-pill">
            <svg viewBox="0 0 16 16"><path d="M2 4h12M2 8h12M2 12h6" strokeLinecap="round" /></svg>
            Call sheets
          </div>
          <div className="feature-pill">
            <svg viewBox="0 0 16 16"><path d="M2 12l3.5-4 3 2.5L12 5l2 2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Actuals &amp; margins
          </div>
        </div>
      </div>

      <div className="features-wrap">

        {/* ── BUDGETS ──────────────────────────────────────────────── */}
        <div className="feature-section" id="budgets">
          <div className="feature-copy">
            <div className="feature-eyebrow">Budgets</div>
            <h2>Build detailed production budgets in minutes.</h2>
            <p>Stop building budgets in Google Sheets and then reformatting them for every client. SLATESUITE gives you a structured budget builder designed for how productions actually cost out.</p>
            <ul className="feature-list">
              <li>Organize by phases — pre-production, production, post</li>
              <li>Break down accounts with nested line items, day rates, and quantities</li>
              <li>Apply markup, agency fee, and tax automatically</li>
              <li>Budgets flow directly into proposals and invoices — no copy/paste</li>
            </ul>
          </div>
          <div className="mockup-panel">
            <div className="panel-titlebar">
              <svg viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="1.5" /><path d="M5 6h6M5 8.5h6M5 11h3" strokeLinecap="round" /></svg>
              Budget · Meridian Campaign S/S 25
            </div>
            <div style={{ padding: 0 }}>
              <table className="budget-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th style={{ textAlign: 'center' }}>Days</th>
                    <th>Rate</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td className="budget-category" colSpan={4}>Above-the-Line</td></tr>
                  <tr><td>Director</td><td style={{ textAlign: 'center', color: 'var(--ss-gray-500)' }}>5</td><td style={{ color: 'var(--ss-gray-500)' }}>$3,500/d</td><td>$17,500</td></tr>
                  <tr><td>Executive Producer</td><td style={{ textAlign: 'center', color: 'var(--ss-gray-500)' }}>5</td><td style={{ color: 'var(--ss-gray-500)' }}>$2,000/d</td><td>$10,000</td></tr>
                  <tr><td className="budget-category" colSpan={4}>Crew</td></tr>
                  <tr><td>Director of Photography</td><td style={{ textAlign: 'center', color: 'var(--ss-gray-500)' }}>5</td><td style={{ color: 'var(--ss-gray-500)' }}>$1,800/d</td><td>$9,000</td></tr>
                  <tr><td>Gaffer</td><td style={{ textAlign: 'center', color: 'var(--ss-gray-500)' }}>5</td><td style={{ color: 'var(--ss-gray-500)' }}>$850/d</td><td>$4,250</td></tr>
                  <tr><td>1st AD</td><td style={{ textAlign: 'center', color: 'var(--ss-gray-500)' }}>5</td><td style={{ color: 'var(--ss-gray-500)' }}>$750/d</td><td>$3,750</td></tr>
                  <tr><td className="budget-category" colSpan={4}>Equipment &amp; Locations</td></tr>
                  <tr><td>Camera Package</td><td style={{ textAlign: 'center', color: 'var(--ss-gray-500)' }}>5</td><td style={{ color: 'var(--ss-gray-500)' }}>$2,400/d</td><td>$12,000</td></tr>
                  <tr><td>Location Fee</td><td style={{ textAlign: 'center', color: 'var(--ss-gray-500)' }}>2</td><td style={{ color: 'var(--ss-gray-500)' }}>$3,500/d</td><td>$7,000</td></tr>
                </tbody>
                <tfoot>
                  <tr className="budget-totals"><td colSpan={3}>Subtotal</td><td>$63,500</td></tr>
                  <tr className="budget-totals"><td colSpan={3} style={{ color: 'var(--ss-gray-500)', fontWeight: 500 }}>Agency Fee (15%)</td><td style={{ color: 'var(--ss-gray-500)' }}>$9,525</td></tr>
                  <tr className="budget-grand"><td colSpan={3}>Total</td><td>$73,025</td></tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        <div className="section-divider"></div>

        {/* ── PROPOSALS ────────────────────────────────────────────── */}
        <div className="feature-section flip" id="proposals">
          <div className="feature-copy">
            <div className="feature-eyebrow">Proposals</div>
            <h2>Send proposals clients actually sign.</h2>
            <p>Generate a polished proposal PDF directly from your budget, define payment milestones, and let clients review and e-sign — all without leaving SLATESUITE.</p>
            <ul className="feature-list">
              <li>Proposals generated from your budget in one click</li>
              <li>Define deposit, progress, and final payment milestones</li>
              <li>Clients sign digitally — no DocuSign needed</li>
              <li>Track when the client viewed and when they signed</li>
            </ul>
          </div>
          <div className="mockup-panel">
            <div className="proposal-header">
              <div className="proposal-from">From: The Third Place Creative</div>
              <div className="proposal-title">Meridian Campaign S/S 25</div>
              <div className="proposal-subtitle">Commercial · 5-day shoot · $73,025</div>
            </div>
            <div className="proposal-status-row">
              <div className="proposal-status-dot" style={{ background: 'var(--ss-violet)' }}></div>
              <div className="proposal-status-text"><strong>Viewed 4 times</strong> · Last opened Jun 13, 2:41 PM</div>
              <span className="status-badge badge-viewed" style={{ fontSize: '10px' }}>VIEWED</span>
            </div>
            <div className="milestone-row">
              <div className="milestone-num done">1</div>
              <div className="milestone-info">
                <div className="milestone-name">Deposit — 50%</div>
                <div className="milestone-when">Due on signing</div>
              </div>
              <div className="milestone-amount">$36,513</div>
              <span className="status-badge badge-paid" style={{ fontSize: '9px' }}>PAID</span>
            </div>
            <div className="milestone-row">
              <div className="milestone-num pending">2</div>
              <div className="milestone-info">
                <div className="milestone-name">Final — 50%</div>
                <div className="milestone-when">Due on delivery</div>
              </div>
              <div className="milestone-amount">$36,512</div>
              <span className="status-badge badge-sent" style={{ fontSize: '9px' }}>SENT</span>
            </div>
            <div className="sign-row">
              <div>
                <div className="sign-status" style={{ marginBottom: '3px' }}>Signed by client</div>
                <div className="sign-name">Sarah Mitchell</div>
                <div className="sign-date">Jun 9, 2025 at 11:22 AM</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="sign-status" style={{ marginBottom: '3px' }}>Your signature</div>
                <div className="sign-name">Ashish Y.</div>
                <div className="sign-date">Jun 9, 2025 at 9:05 AM</div>
              </div>
            </div>
          </div>
        </div>

        <div className="section-divider"></div>

        {/* ── INVOICING ────────────────────────────────────────────── */}
        <div className="feature-section" id="invoicing">
          <div className="feature-copy">
            <div className="feature-eyebrow">Invoicing</div>
            <h2>Invoice clients and get paid — online.</h2>
            <p>Create professional invoices tied to your milestones, send them by email, and let clients pay directly from the invoice link. Track every dollar from sent to paid.</p>
            <ul className="feature-list">
              <li>Generate deposit, progress, and final invoices from milestones</li>
              <li>Clients pay online via card or ACH from a branded payment page</li>
              <li>Real-time status: Draft → Sent → Viewed → Paid</li>
              <li>PDF download, custom notes, and net terms — all included</li>
            </ul>
          </div>
          <div className="mockup-panel">
            <div className="panel-titlebar">
              <svg viewBox="0 0 16 16" style={{ stroke: 'var(--ss-gray-400)', fill: 'none', strokeWidth: '1.5' }}><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M2 7h12M6 7v6M5 3V2M11 3V2" strokeLinecap="round" /></svg>
              Invoices
            </div>
            <div>
              <div className="invoice-row">
                <div className="invoice-icon deposit">
                  <svg viewBox="0 0 14 14"><path d="M7 1v12M10 4H5.5a2.5 2.5 0 000 5H8.5a2.5 2.5 0 010 5H4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div className="invoice-info">
                  <div className="invoice-num">TTP-2026-001</div>
                  <div className="invoice-proj">Meridian S/S 25 — Deposit (50%)</div>
                </div>
                <div className="invoice-right">
                  <div className="invoice-amount">$36,513</div>
                  <div className="invoice-due">Paid Jun 9</div>
                </div>
                <div className="invoice-actions">
                  <span className="status-badge badge-paid" style={{ fontSize: '9px', alignSelf: 'center' }}>PAID</span>
                </div>
              </div>
              <div className="invoice-row">
                <div className="invoice-icon final">
                  <svg viewBox="0 0 14 14"><path d="M7 1v12M10 4H5.5a2.5 2.5 0 000 5H8.5a2.5 2.5 0 010 5H4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div className="invoice-info">
                  <div className="invoice-num">TTP-2026-002</div>
                  <div className="invoice-proj">Meridian S/S 25 — Final (50%)</div>
                </div>
                <div className="invoice-right">
                  <div className="invoice-amount">$36,512</div>
                  <div className="invoice-due">Due Jul 15, 2026</div>
                </div>
                <div className="invoice-actions">
                  <span className="status-badge badge-viewed" style={{ fontSize: '9px', alignSelf: 'center' }}>VIEWED</span>
                </div>
              </div>
              <div className="invoice-row">
                <div className="invoice-icon deposit">
                  <svg viewBox="0 0 14 14"><path d="M7 1v12M10 4H5.5a2.5 2.5 0 000 5H8.5a2.5 2.5 0 010 5H4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div className="invoice-info">
                  <div className="invoice-num">TTP-2026-003</div>
                  <div className="invoice-proj">Ridgeline — Deposit (50%)</div>
                </div>
                <div className="invoice-right">
                  <div className="invoice-amount">$23,750</div>
                  <div className="invoice-due">Due Jun 30, 2026</div>
                </div>
                <div className="invoice-actions">
                  <span className="status-badge badge-sent" style={{ fontSize: '9px', alignSelf: 'center' }}>SENT</span>
                </div>
              </div>
              <div className="invoice-row">
                <div className="invoice-icon progress" style={{ background: 'var(--ss-gray-100)', color: 'var(--ss-gray-500)' }}>
                  <svg viewBox="0 0 14 14"><path d="M7 1v12M10 4H5.5a2.5 2.5 0 000 5H8.5a2.5 2.5 0 010 5H4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div className="invoice-info">
                  <div className="invoice-num">TTP-2026-004</div>
                  <div className="invoice-proj">Strider Anthem — Deposit Draft</div>
                </div>
                <div className="invoice-right">
                  <div className="invoice-amount">$65,000</div>
                  <div className="invoice-due">Not sent yet</div>
                </div>
                <div className="invoice-actions">
                  <span className="status-badge" style={{ fontSize: '9px', alignSelf: 'center', background: 'var(--ss-gray-100)', color: 'var(--ss-gray-500)' }}>DRAFT</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>{/* end .features-wrap */}

      {/* ── CALL SHEETS + ACTUALS ────────────────────────────────── */}
      <div className="features-pair">

        <div className="feature-card">
          <div className="feature-card-copy">
            <div className="feature-eyebrow" style={{ fontSize: '11px', marginBottom: '0.5rem' }}>Call Sheets</div>
            <h3>Keep your crew on the same page.</h3>
            <p>Build and distribute professional call sheets for every shoot day. Set call times, crew positions, and location details — then share a link or export PDF.</p>
          </div>
          <div className="feature-card-mockup">
            <div className="callsheet-header">
              <div className="cs-title">Meridian Campaign — Day 1 of 5</div>
              <div className="cs-meta">June 18, 2026 · Downtown LA Warehouse</div>
            </div>
            <div className="cs-highlights">
              <div className="cs-highlight">
                <div className="cs-highlight-label">Crew call</div>
                <div className="cs-highlight-value">6:30 AM</div>
              </div>
              <div className="cs-highlight">
                <div className="cs-highlight-label">Camera</div>
                <div className="cs-highlight-value">7:00 AM</div>
              </div>
              <div className="cs-highlight">
                <div className="cs-highlight-label">Talent call</div>
                <div className="cs-highlight-value">9:00 AM</div>
              </div>
            </div>
            <div className="crew-row">
              <div className="crew-avatar" style={{ background: '#EDE9FE', color: '#4C1D95' }}>AY</div>
              <div className="crew-info">
                <div className="crew-name">Ashish Yamdagni</div>
                <div className="crew-role">Director / Producer</div>
              </div>
              <div className="crew-call">6:30 AM</div>
            </div>
            <div className="crew-row">
              <div className="crew-avatar" style={{ background: '#DBEAFE', color: '#1E40AF' }}>MK</div>
              <div className="crew-info">
                <div className="crew-name">Marco Kim</div>
                <div className="crew-role">Director of Photography</div>
              </div>
              <div className="crew-call">6:30 AM</div>
            </div>
            <div className="crew-row">
              <div className="crew-avatar" style={{ background: '#ECFDF5', color: '#065F46' }}>JP</div>
              <div className="crew-info">
                <div className="crew-name">Jordan Price</div>
                <div className="crew-role">Gaffer</div>
              </div>
              <div className="crew-call">7:00 AM</div>
            </div>
          </div>
        </div>

        <div className="feature-card">
          <div className="feature-card-copy">
            <div className="feature-eyebrow" style={{ fontSize: '11px', marginBottom: '0.5rem' }}>Actuals &amp; Margins</div>
            <h3>Know your margin before the wrap party.</h3>
            <p>Log actual spend against your budget lines as the project runs. See your profit and margin in real time — no post-wrap spreadsheet archaeology required.</p>
          </div>
          <div className="feature-card-mockup">
            <div className="actuals-row">
              <div className="actuals-label">Budget total</div>
              <div className="actuals-value">$73,025</div>
            </div>
            <div className="actuals-row">
              <div className="actuals-label">Billed to client</div>
              <div className="actuals-value" style={{ color: 'var(--ss-purple)' }}>$73,025</div>
            </div>
            <div className="actuals-row">
              <div className="actuals-label">Actual spend</div>
              <div className="actuals-value">$52,180</div>
            </div>
            <div className="actuals-bar-wrap">
              <div className="actuals-bar-label">
                <span>Spent</span>
                <span style={{ fontWeight: 600, color: 'var(--ss-gray-700)' }}>71% of budget</span>
              </div>
              <div className="actuals-bar-track">
                <div className="actuals-bar-fill" style={{ width: '71%', background: 'var(--ss-purple)' }}></div>
              </div>
            </div>
            <div className="actuals-stats">
              <div className="actuals-stat">
                <div className="actuals-stat-label">Profit</div>
                <div className="actuals-stat-value" style={{ color: 'var(--ss-green)' }}>$20,845</div>
              </div>
              <div className="actuals-stat">
                <div className="actuals-stat-label">Margin</div>
                <div className="actuals-stat-value" style={{ color: 'var(--ss-green)' }}>28.5%</div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ── CLIENT ROLODEX ───────────────────────────────────────── */}
      <div style={{ maxWidth: '1200px', margin: '0 auto 80px', padding: '0 2rem' }}>
        <div className="mockup-panel">
          <div className="panel-titlebar">
            <svg viewBox="0 0 16 16" style={{ stroke: 'var(--ss-gray-400)', fill: 'none', strokeWidth: '1.5' }}><circle cx="8" cy="5" r="2.5" /><path d="M3 13c0-2.76 2.24-5 5-5s5 2.24 5 5" strokeLinecap="round" /></svg>
            Client rolodex
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)' }}>
            <div className="client-row" style={{ borderRight: '1px solid var(--ss-gray-100)' }}>
              <div className="client-avatar" style={{ background: '#EDE9FE', color: '#4C1D95' }}>MC</div>
              <div className="client-info">
                <div className="client-name">Meridian Creative</div>
                <div className="client-detail">sarah.m@meridiancreative.com</div>
              </div>
              <div className="client-amount">$73,025</div>
            </div>
            <div className="client-row" style={{ borderRight: '1px solid var(--ss-gray-100)' }}>
              <div className="client-avatar" style={{ background: '#ECFDF5', color: '#065F46' }}>RF</div>
              <div className="client-info">
                <div className="client-name">Ridgeline Foods</div>
                <div className="client-detail">brand@ridgelinefoods.com</div>
              </div>
              <div className="client-amount">$47,500</div>
            </div>
            <div className="client-row">
              <div className="client-avatar" style={{ background: '#FEF3C7', color: '#92400E' }}>SG</div>
              <div className="client-info">
                <div className="client-name">Strider Global</div>
                <div className="client-detail">production@striderglobal.com</div>
              </div>
              <div className="client-amount">$130,000</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <section className="cta-section">
        <h2>Your next production deserves<br />better <em>tools.</em></h2>
        <p>Stop stitching together spreadsheets, PDFs, and email threads. SLATESUITE puts everything in one place, built from the ground up for production companies.</p>
        <Link href="/sign-up" className="btn-primary-lg" style={{ background: '#fff', color: 'var(--ss-purple)', margin: '0 auto' }}>
          Get early access
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px' }}><path d="M3 8h10M8 3l5 5-5 5" /></svg>
        </Link>
        <div className="cta-note">No credit card required.</div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────── */}
      <footer>
        <div className="footer-inner">
          <div className="footer-logo">SLATE<span>SUITE</span></div>
          <ul className="footer-links">
            <li><a href="#">Features</a></li>
            <li><Link href="/sign-in">Sign in</Link></li>
            <li><a href="#">Privacy</a></li>
            <li><a href="#">Terms</a></li>
          </ul>
          <div className="footer-copy">© 2026 SLATESUITE</div>
        </div>
      </footer>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// All styles are scoped to .ss-page to avoid conflicts with Tailwind globals.
// Variables use --ss- prefix to avoid collision with the app's CSS variables.
// ─────────────────────────────────────────────────────────────────────────────
const css = `
  .ss-page {
    --ss-purple:        #5D00A4;
    --ss-purple-hover:  #4A0083;
    --ss-purple-mid:    #8B3FBF;
    --ss-purple-light:  #F5EDFA;
    --ss-purple-border: #D9B3F5;
    --ss-purple-200:    #C98EE8;
    --ss-gray-900:      #111827;
    --ss-gray-700:      #374151;
    --ss-gray-500:      #6B7280;
    --ss-gray-400:      #9CA3AF;
    --ss-gray-200:      #E5E7EB;
    --ss-gray-100:      #F3F4F6;
    --ss-gray-50:       #F9FAFB;
    --ss-green:         #059669;
    --ss-green-bg:      #ECFDF5;
    --ss-green-text:    #065F46;
    --ss-blue:          #2563EB;
    --ss-blue-bg:       #EFF6FF;
    --ss-blue-text:     #1E40AF;
    --ss-violet:        #7C3AED;
    --ss-violet-bg:     #F5F3FF;
    --ss-violet-text:   #4C1D95;
    --ss-amber:         #D97706;
    --ss-amber-bg:      #FFFBEB;
    --ss-amber-text:    #92400E;
  }

  .ss-page, .ss-page * { box-sizing: border-box; margin: 0; padding: 0; }
  .ss-page {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    color: var(--ss-gray-900);
    background: #fff;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  .ss-page a { color: inherit; text-decoration: none; }

  /* NAV */
  .ss-page nav {
    position: sticky; top: 0; z-index: 100;
    background: rgba(255,255,255,0.92);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--ss-gray-200);
    padding: 0 2rem;
  }
  .ss-page .nav-inner {
    max-width: 1200px; margin: 0 auto;
    display: flex; align-items: center; justify-content: space-between; height: 60px;
  }
  .ss-page .nav-logo { font-size: 15px; font-weight: 800; letter-spacing: 0.08em; color: var(--ss-gray-900); }
  .ss-page .nav-logo span { color: var(--ss-purple); }
  .ss-page .nav-links { display: flex; align-items: center; gap: 2rem; list-style: none; }
  .ss-page .nav-links a { font-size: 14px; font-weight: 500; color: var(--ss-gray-500); transition: color 0.15s; }
  .ss-page .nav-links a:hover { color: var(--ss-gray-900); }
  .ss-page .nav-actions { display: flex; align-items: center; gap: 1rem; }
  .ss-page .nav-signin { font-size: 14px; font-weight: 500; color: var(--ss-gray-700); }
  .ss-page .nav-signin:hover { color: var(--ss-gray-900); }
  .ss-page .btn-primary {
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--ss-purple); color: #fff;
    font-size: 13px; font-weight: 600; padding: 8px 16px;
    border-radius: 8px; border: none; cursor: pointer;
    transition: background 0.15s; text-decoration: none;
    white-space: nowrap; flex-shrink: 0; line-height: 1.4;
  }
  .ss-page .btn-primary:hover { background: var(--ss-purple-hover); }

  /* HERO */
  .ss-page .hero-section { padding: 0 2rem; }
  .ss-page .hero {
    max-width: 1200px; margin: 0 auto; padding: 80px 0 60px;
    display: grid; grid-template-columns: 1fr 1fr; gap: 4rem; align-items: center;
  }
  .ss-page .hero-badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--ss-purple-light); color: var(--ss-purple);
    font-size: 12px; font-weight: 600; padding: 5px 12px;
    border-radius: 100px; letter-spacing: 0.04em; margin-bottom: 1.5rem;
  }
  .ss-page .hero-badge-dot { width: 6px; height: 6px; background: var(--ss-purple); border-radius: 50%; }
  .ss-page .hero h1 {
    font-size: clamp(36px, 5vw, 52px); font-weight: 800;
    line-height: 1.1; letter-spacing: -0.03em; color: var(--ss-gray-900); margin-bottom: 1.25rem;
  }
  .ss-page .hero h1 em { font-style: normal; color: var(--ss-purple); }
  .ss-page .hero p { font-size: 17px; color: var(--ss-gray-500); line-height: 1.7; margin-bottom: 2rem; max-width: 440px; }
  .ss-page .hero-ctas { display: flex; align-items: center; gap: 1rem; }
  .ss-page .btn-primary-lg {
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--ss-purple); color: #fff;
    font-size: 15px; font-weight: 600; padding: 13px 24px;
    border-radius: 10px; transition: background 0.15s; text-decoration: none;
  }
  .ss-page .btn-primary-lg:hover { background: var(--ss-purple-hover); }
  .ss-page .hero-secondary { font-size: 14px; color: var(--ss-gray-400); }
  .ss-page .hero-secondary a { color: var(--ss-purple); font-weight: 500; }
  .ss-page .hero-secondary a:hover { text-decoration: underline; }

  /* HERO MOCKUP */
  .ss-page .hero-mockup {
    background: var(--ss-gray-50); border: 1px solid var(--ss-gray-200); border-radius: 16px;
    overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 20px 50px -10px rgba(93,0,164,0.12);
  }
  .ss-page .mockup-topbar {
    background: #fff; border-bottom: 1px solid var(--ss-gray-200);
    padding: 10px 16px; display: flex; align-items: center; gap: 10px;
  }
  .ss-page .topbar-dots { display: flex; gap: 5px; }
  .ss-page .topbar-dots span { width: 10px; height: 10px; border-radius: 50%; }
  .ss-page .topbar-dots span:nth-child(1) { background: #FF5F57; }
  .ss-page .topbar-dots span:nth-child(2) { background: #FFBD2E; }
  .ss-page .topbar-dots span:nth-child(3) { background: #28C840; }
  .ss-page .topbar-url {
    flex: 1; background: var(--ss-gray-100); border-radius: 6px;
    padding: 4px 10px; font-size: 11px; color: var(--ss-gray-400); font-family: monospace;
  }
  .ss-page .mockup-layout { display: grid; grid-template-columns: 48px 1fr; height: 340px; }
  .ss-page .mockup-sidebar {
    background: var(--ss-gray-900); padding: 12px 0;
    display: flex; flex-direction: column; align-items: center; gap: 4px;
  }
  .ss-page .sidebar-logo {
    width: 28px; height: 28px; background: var(--ss-purple); border-radius: 6px;
    margin-bottom: 8px; display: flex; align-items: center; justify-content: center;
  }
  .ss-page .sidebar-icon {
    width: 32px; height: 32px; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
  }
  .ss-page .sidebar-icon svg { width: 16px; height: 16px; stroke: #6B7280; fill: none; stroke-width: 1.5; }
  .ss-page .sidebar-icon.active { background: rgba(93,0,164,0.3); }
  .ss-page .sidebar-icon.active svg { stroke: var(--ss-purple-200); }
  .ss-page .mockup-main { background: #fff; padding: 14px; overflow: hidden; }
  .ss-page .mockup-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .ss-page .mockup-title { font-size: 13px; font-weight: 700; color: var(--ss-gray-900); }
  .ss-page .mockup-new-btn {
    background: var(--ss-purple); color: #fff; font-size: 10px; font-weight: 600; padding: 4px 8px; border-radius: 5px;
  }
  .ss-page .project-card { border: 1px solid var(--ss-gray-200); border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; }
  .ss-page .project-card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
  .ss-page .project-name { font-size: 12px; font-weight: 600; color: var(--ss-gray-900); }
  .ss-page .project-client { font-size: 10px; color: var(--ss-gray-500); margin-top: 1px; }
  .ss-page .status-badge { font-size: 9px; font-weight: 600; padding: 2px 7px; border-radius: 100px; }
  .ss-page .badge-active { background: var(--ss-green-bg); color: var(--ss-green-text); }
  .ss-page .badge-lead   { background: var(--ss-amber-bg); color: var(--ss-amber-text); }
  .ss-page .badge-sent   { background: var(--ss-blue-bg);  color: var(--ss-blue-text); }
  .ss-page .badge-paid   { background: var(--ss-green-bg); color: var(--ss-green-text); }
  .ss-page .badge-viewed { background: var(--ss-violet-bg); color: var(--ss-violet-text); }
  .ss-page .project-meta { display: flex; justify-content: space-between; align-items: center; }
  .ss-page .project-amount { font-size: 12px; font-weight: 700; color: var(--ss-gray-900); }
  .ss-page .project-tags { display: flex; gap: 4px; }
  .ss-page .project-tag { font-size: 9px; color: var(--ss-gray-500); background: var(--ss-gray-100); padding: 2px 6px; border-radius: 4px; }

  /* SOCIAL STRIP */
  .ss-page .social-strip {
    border-top: 1px solid var(--ss-gray-200); border-bottom: 1px solid var(--ss-gray-200);
    padding: 20px 2rem; background: var(--ss-gray-50);
  }
  .ss-page .social-strip-inner {
    max-width: 1200px; margin: 0 auto;
    display: flex; align-items: center; justify-content: center; gap: 0.5rem;
    font-size: 13px; color: var(--ss-gray-500);
  }
  .ss-page .social-strip-inner strong { color: var(--ss-gray-700); }

  /* FEATURE PILLS */
  .ss-page .feature-nav { max-width: 1200px; margin: 0 auto; padding: 56px 2rem 0; }
  .ss-page .feature-nav-label {
    text-align: center; font-size: 12px; font-weight: 600;
    letter-spacing: 0.1em; color: var(--ss-gray-400); text-transform: uppercase; margin-bottom: 1.5rem;
  }
  .ss-page .feature-pills { display: flex; justify-content: center; gap: 0.75rem; flex-wrap: wrap; }
  .ss-page .feature-pill {
    display: flex; align-items: center; gap: 7px;
    background: #fff; border: 1px solid var(--ss-gray-200); border-radius: 100px;
    padding: 8px 16px; font-size: 13px; font-weight: 500; color: var(--ss-gray-700);
    transition: border-color 0.15s, color 0.15s, background 0.15s; cursor: default;
  }
  .ss-page .feature-pill:hover {
    border-color: var(--ss-purple-border); color: var(--ss-purple); background: var(--ss-purple-light);
  }
  .ss-page .feature-pill svg { width: 15px; height: 15px; stroke: currentColor; fill: none; stroke-width: 1.8; }

  /* FEATURE SECTIONS */
  .ss-page .features-wrap { padding: 0 2rem; }
  .ss-page .feature-section {
    max-width: 1200px; margin: 80px auto;
    display: grid; grid-template-columns: 1fr 1fr; gap: 5rem; align-items: center;
  }
  .ss-page .feature-section.flip { direction: rtl; }
  .ss-page .feature-section.flip > * { direction: ltr; }
  .ss-page .feature-eyebrow {
    font-size: 12px; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--ss-purple); margin-bottom: 0.75rem;
  }
  .ss-page .feature-copy h2 {
    font-size: 32px; font-weight: 800; line-height: 1.15;
    letter-spacing: -0.02em; color: var(--ss-gray-900); margin-bottom: 1rem;
  }
  .ss-page .feature-copy p { font-size: 16px; color: var(--ss-gray-500); line-height: 1.7; margin-bottom: 1.5rem; }
  .ss-page .feature-list { list-style: none; display: flex; flex-direction: column; gap: 0.6rem; }
  .ss-page .feature-list li {
    display: flex; align-items: flex-start; gap: 10px;
    font-size: 14px; color: var(--ss-gray-700); line-height: 1.5;
  }
  .ss-page .feature-list li::before {
    content: ''; width: 18px; height: 18px; border-radius: 50%;
    background: var(--ss-purple-light); flex-shrink: 0; margin-top: 1px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M2 5l2.5 2.5L8 3' stroke='%235D00A4' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: center;
  }

  /* MOCKUP PANELS */
  .ss-page .mockup-panel {
    background: #fff; border: 1px solid var(--ss-gray-200); border-radius: 16px; overflow: hidden;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.04), 0 20px 50px -10px rgba(0,0,0,0.08);
  }
  .ss-page .panel-titlebar {
    background: var(--ss-gray-50); border-bottom: 1px solid var(--ss-gray-200);
    padding: 10px 16px; font-size: 12px; font-weight: 600; color: var(--ss-gray-500);
    display: flex; align-items: center; gap: 8px;
  }
  .ss-page .panel-titlebar svg { width: 14px; height: 14px; stroke: var(--ss-gray-400); fill: none; stroke-width: 1.5; flex-shrink: 0; }

  /* BUDGET TABLE */
  .ss-page .budget-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .ss-page .budget-table th {
    text-align: left; font-size: 10px; font-weight: 600; letter-spacing: 0.05em;
    text-transform: uppercase; color: var(--ss-gray-400); padding: 0 8px 8px;
    border-bottom: 1px solid var(--ss-gray-200);
  }
  .ss-page .budget-table th:last-child { text-align: right; }
  .ss-page .budget-table td {
    padding: 9px 8px; color: var(--ss-gray-700); border-bottom: 1px solid var(--ss-gray-100);
  }
  .ss-page .budget-table td:last-child { text-align: right; font-weight: 500; color: var(--ss-gray-900); }
  .ss-page .budget-table td:first-child { color: var(--ss-gray-900); font-weight: 500; }
  .ss-page .budget-category {
    font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--ss-gray-400); padding: 6px 8px 2px !important; background: var(--ss-gray-50);
  }
  .ss-page .budget-totals { border-top: 2px solid var(--ss-gray-200); }
  .ss-page .budget-totals td { font-weight: 600 !important; color: var(--ss-gray-900) !important; padding-top: 10px !important; }
  .ss-page .budget-grand td { font-size: 13px; font-weight: 700 !important; color: var(--ss-purple) !important; }

  /* PROPOSAL */
  .ss-page .proposal-header { background: var(--ss-purple-light); border-bottom: 1px solid var(--ss-purple-border); padding: 16px; }
  .ss-page .proposal-from { font-size: 10px; color: var(--ss-purple-mid); font-weight: 500; margin-bottom: 4px; }
  .ss-page .proposal-title { font-size: 15px; font-weight: 700; color: var(--ss-purple); margin-bottom: 2px; }
  .ss-page .proposal-subtitle { font-size: 11px; color: var(--ss-purple-mid); }
  .ss-page .proposal-status-row {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 16px; background: #fff; border-bottom: 1px solid var(--ss-gray-200);
  }
  .ss-page .proposal-status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ss-blue); }
  .ss-page .proposal-status-text { font-size: 11px; color: var(--ss-gray-500); }
  .ss-page .proposal-status-text strong { color: var(--ss-gray-700); font-weight: 600; }
  .ss-page .milestone-row {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 16px; border-bottom: 1px solid var(--ss-gray-100);
  }
  .ss-page .milestone-num {
    width: 22px; height: 22px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 700; flex-shrink: 0;
  }
  .ss-page .milestone-num.done    { background: var(--ss-purple); color: #fff; }
  .ss-page .milestone-num.pending { background: var(--ss-gray-100); color: var(--ss-gray-500); }
  .ss-page .milestone-info { flex: 1; }
  .ss-page .milestone-name { font-size: 12px; font-weight: 600; color: var(--ss-gray-900); }
  .ss-page .milestone-when { font-size: 10px; color: var(--ss-gray-500); }
  .ss-page .milestone-amount { font-size: 12px; font-weight: 700; color: var(--ss-gray-900); }
  .ss-page .sign-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; background: var(--ss-gray-50);
  }
  .ss-page .sign-status { font-size: 11px; color: var(--ss-gray-500); }
  .ss-page .sign-name { font-size: 14px; color: var(--ss-gray-400); font-family: 'Georgia', serif; font-style: italic; }
  .ss-page .sign-date { font-size: 10px; color: var(--ss-gray-400); }

  /* INVOICE */
  .ss-page .invoice-row {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 14px; border-bottom: 1px solid var(--ss-gray-100);
  }
  .ss-page .invoice-row:last-child { border-bottom: none; }
  .ss-page .invoice-icon {
    width: 30px; height: 30px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .ss-page .invoice-icon svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 1.5; }
  .ss-page .invoice-icon.deposit  { background: var(--ss-purple-light); color: var(--ss-purple); }
  .ss-page .invoice-icon.progress { background: var(--ss-blue-bg);     color: var(--ss-blue); }
  .ss-page .invoice-icon.final    { background: var(--ss-green-bg);    color: var(--ss-green); }
  .ss-page .invoice-info { flex: 1; min-width: 0; }
  .ss-page .invoice-num { font-size: 11px; font-weight: 600; font-family: monospace; color: var(--ss-gray-900); }
  .ss-page .invoice-proj { font-size: 10px; color: var(--ss-gray-500); margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ss-page .invoice-right { text-align: right; flex-shrink: 0; }
  .ss-page .invoice-amount { font-size: 12px; font-weight: 700; color: var(--ss-gray-900); }
  .ss-page .invoice-due { font-size: 10px; color: var(--ss-gray-400); margin-top: 1px; }
  .ss-page .invoice-actions { display: flex; gap: 4px; margin-left: 4px; }

  /* CALL SHEET */
  .ss-page .callsheet-header { background: var(--ss-gray-900); color: #fff; padding: 14px 16px; }
  .ss-page .cs-title { font-size: 13px; font-weight: 700; margin-bottom: 2px; }
  .ss-page .cs-meta { font-size: 10px; color: rgba(255,255,255,0.5); }
  .ss-page .cs-highlights { display: grid; grid-template-columns: repeat(3,1fr); border-bottom: 1px solid var(--ss-gray-200); }
  .ss-page .cs-highlight { padding: 10px 12px; border-right: 1px solid var(--ss-gray-200); }
  .ss-page .cs-highlight:last-child { border-right: none; }
  .ss-page .cs-highlight-label { font-size: 9px; font-weight: 600; color: var(--ss-gray-400); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
  .ss-page .cs-highlight-value { font-size: 12px; font-weight: 600; color: var(--ss-gray-900); }
  .ss-page .crew-row { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-bottom: 1px solid var(--ss-gray-100); }
  .ss-page .crew-avatar {
    width: 26px; height: 26px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 700; flex-shrink: 0;
  }
  .ss-page .crew-info { flex: 1; }
  .ss-page .crew-name { font-size: 11px; font-weight: 600; color: var(--ss-gray-900); }
  .ss-page .crew-role { font-size: 10px; color: var(--ss-gray-500); }
  .ss-page .crew-call { font-size: 11px; font-weight: 600; color: var(--ss-gray-900); }

  /* ACTUALS */
  .ss-page .actuals-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px; border-bottom: 1px solid var(--ss-gray-100);
  }
  .ss-page .actuals-label { font-size: 11px; color: var(--ss-gray-500); font-weight: 500; }
  .ss-page .actuals-value { font-size: 12px; font-weight: 700; color: var(--ss-gray-900); }
  .ss-page .actuals-bar-wrap { padding: 14px 16px; }
  .ss-page .actuals-bar-label { display: flex; justify-content: space-between; font-size: 10px; color: var(--ss-gray-500); margin-bottom: 6px; }
  .ss-page .actuals-bar-track { height: 8px; background: var(--ss-gray-100); border-radius: 100px; overflow: hidden; }
  .ss-page .actuals-bar-fill { height: 100%; border-radius: 100px; }
  .ss-page .actuals-stats { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid var(--ss-gray-200); }
  .ss-page .actuals-stat { padding: 12px 16px; border-right: 1px solid var(--ss-gray-200); }
  .ss-page .actuals-stat:last-child { border-right: none; }
  .ss-page .actuals-stat-label { font-size: 9px; color: var(--ss-gray-400); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; margin-bottom: 3px; }
  .ss-page .actuals-stat-value { font-size: 16px; font-weight: 800; }

  /* SECTION DIVIDER */
  .ss-page .section-divider { max-width: 1200px; margin: 0 auto; padding: 0 2rem; border-top: 1px solid var(--ss-gray-200); }

  /* SMALLER FEATURE CARDS */
  .ss-page .features-pair { max-width: 1200px; margin: 80px auto; padding: 0 2rem; display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
  .ss-page .feature-card { background: var(--ss-gray-50); border: 1px solid var(--ss-gray-200); border-radius: 16px; overflow: hidden; }
  .ss-page .feature-card-copy { padding: 28px 28px 24px; }
  .ss-page .feature-card-copy h3 { font-size: 20px; font-weight: 700; letter-spacing: -0.01em; color: var(--ss-gray-900); margin-bottom: 0.5rem; }
  .ss-page .feature-card-copy p { font-size: 14px; color: var(--ss-gray-500); line-height: 1.6; }
  .ss-page .feature-card-mockup { border-top: 1px solid var(--ss-gray-200); background: #fff; }

  /* CLIENT ROLODEX */
  .ss-page .client-row { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--ss-gray-100); }
  .ss-page .client-avatar {
    width: 30px; height: 30px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; flex-shrink: 0;
  }
  .ss-page .client-info { flex: 1; }
  .ss-page .client-name { font-size: 12px; font-weight: 600; color: var(--ss-gray-900); }
  .ss-page .client-detail { font-size: 10px; color: var(--ss-gray-500); margin-top: 1px; }
  .ss-page .client-amount { font-size: 11px; font-weight: 600; color: var(--ss-gray-900); }

  /* CTA */
  .ss-page .cta-section { background: var(--ss-gray-900); padding: 80px 2rem; text-align: center; }
  .ss-page .cta-section h2 {
    font-size: clamp(28px, 4vw, 42px); font-weight: 800;
    letter-spacing: -0.025em; color: #fff; margin-bottom: 1rem; line-height: 1.15;
  }
  .ss-page .cta-section h2 em { font-style: normal; color: var(--ss-purple-200); }
  .ss-page .cta-section p { font-size: 16px; color: rgba(255,255,255,0.5); margin-bottom: 2rem; max-width: 480px; margin-left: auto; margin-right: auto; }
  .ss-page .cta-note { margin-top: 1rem; font-size: 13px; color: rgba(255,255,255,0.3); }

  /* FOOTER */
  .ss-page footer { background: var(--ss-gray-900); border-top: 1px solid rgba(255,255,255,0.06); padding: 2rem; }
  .ss-page .footer-inner { max-width: 1200px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; }
  .ss-page .footer-logo { font-size: 13px; font-weight: 800; letter-spacing: 0.08em; color: rgba(255,255,255,0.4); }
  .ss-page .footer-logo span { color: rgba(255,255,255,0.15); }
  .ss-page .footer-links { display: flex; gap: 1.5rem; list-style: none; }
  .ss-page .footer-links a { font-size: 13px; color: rgba(255,255,255,0.3); }
  .ss-page .footer-links a:hover { color: rgba(255,255,255,0.6); }
  .ss-page .footer-copy { font-size: 12px; color: rgba(255,255,255,0.2); }

  /* RESPONSIVE */
  @media (max-width: 900px) {
    .ss-page .hero,
    .ss-page .feature-section,
    .ss-page .features-pair { grid-template-columns: 1fr; gap: 2rem; }
    .ss-page .feature-section.flip { direction: ltr; }
    .ss-page .nav-links { display: none; }
    .ss-page .hero-section { padding: 0 1.5rem; }
    .ss-page .hero { padding: 48px 0 40px; }
    .ss-page .features-wrap { padding: 0 1.5rem; }
    .ss-page .features-pair { padding: 0 1.5rem; }
  }
`
