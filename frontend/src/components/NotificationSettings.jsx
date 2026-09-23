import React, { useState } from 'react';

export default function NotificationSettings({ user, onUserUpdated, apiCall }) {
  const [emailInput, setEmailInput] = useState(user?.email || '');
  const [isEditing, setIsEditing] = useState(!user?.email);
  const [statusMsg, setStatusMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSaveEmail = async (e) => {
    e.preventDefault();
    setStatusMsg(null);
    setErrorMsg(null);

    const clean = emailInput.trim();
    if (!clean || !clean.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiCall('user/email', 'POST', { email: clean });
      setStatusMsg(res.message || 'Verification email sent! Check your inbox.');
      setIsEditing(false);
      if (onUserUpdated) {
        onUserUpdated({ ...user, email: clean, email_verified: false });
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setStatusMsg(null);
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await apiCall('user/resend-verification', 'POST');
      setStatusMsg(res.message || 'Verification email resent! Please check your inbox.');
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="analytics-card" style={{ maxWidth: '850px', margin: '0 auto 30px auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <span style={{ fontSize: '38px' }}>🔔</span>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--text-primary)' }}>Email Alerts & Remote Snooze</h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Receive automated 5-minute pre-alerts and 1-click snooze links even when your computer is closed.
          </p>
        </div>
      </div>

      {statusMsg && (
        <div style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#6ee7b7', border: '1px solid #10b981', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9rem' }}>
          ✅ {statusMsg}
        </div>
      )}

      {errorMsg && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', border: '1px solid var(--danger-color)', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9rem' }}>
          ❌ {errorMsg}
        </div>
      )}

      {/* STATUS CARD */}
      <div style={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', fontWeight: 700 }}>
              Notification Status
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
              {user?.email ? (
                user.email_verified ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', fontWeight: 600, padding: '4px 12px', borderRadius: '20px', fontSize: '0.85rem', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                    <span>🟢</span> Active & Verified
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', fontWeight: 600, padding: '4px 12px', borderRadius: '20px', fontSize: '0.85rem', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                    <span>🟡</span> Pending Verification
                  </span>
                )
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(148, 163, 184, 0.15)', color: 'var(--text-secondary)', fontWeight: 600, padding: '4px 12px', borderRadius: '20px', fontSize: '0.85rem' }}>
                  ⚪ No Email Configured
                </span>
              )}
              {user?.email && <strong style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>{user.email}</strong>}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {user?.email && !user.email_verified && (
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={handleResend}
                disabled={loading}
                style={{ fontSize: '0.85rem', padding: '0.5rem 0.9rem' }}
              >
                📩 Resend Verification
              </button>
            )}
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={() => setIsEditing(!isEditing)}
              style={{ fontSize: '0.85rem', padding: '0.5rem 0.9rem' }}
            >
              {isEditing ? 'Cancel' : (user?.email ? 'Change Email' : 'Add Email')}
            </button>
          </div>
        </div>

        {/* EMAIL EDIT FORM */}
        {isEditing && (
          <form onSubmit={handleSaveEmail} style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
            <label htmlFor="settingsEmail" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              {user?.email ? 'Update Email Address' : 'Enter Your Email Address'}
            </label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <input
                id="settingsEmail"
                type="email"
                placeholder="e.g. student@gmail.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                style={{ flex: 1, minWidth: '220px', padding: '0.65rem 0.9rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                required
              />
              <button type="submit" className="btn btn-primary" disabled={loading} style={{ padding: '0.65rem 1.25rem', fontSize: '0.9rem' }}>
                {loading ? 'Saving...' : 'Save & Send Verification'}
              </button>
            </div>
            <p style={{ margin: '8px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              A confirmation link will be sent to this email to verify ownership before sending study alerts.
            </p>
          </form>
        )}
      </div>

      {/* HOW IT WORKS SECTION */}
      <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '16px' }}>How Automated Study Alerts Work</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
        <div style={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '18px' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏰</div>
          <h4 style={{ margin: '0 0 6px 0', fontSize: '0.95rem', color: 'var(--text-primary)' }}>5-Minute Pre-Alert</h4>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Automated email reminder sent 5 minutes before scheduled start time so you can wrap up distractions and get seated.
          </p>
        </div>

        <div style={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '18px' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>🚨</div>
          <h4 style={{ margin: '0 0 6px 0', fontSize: '0.95rem', color: 'var(--text-primary)' }}>Starting Now Alert</h4>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            An urgent prompt at the exact task start time detailing subject, duration, and priority level.
          </p>
        </div>

        <div style={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '18px' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>💤</div>
          <h4 style={{ margin: '0 0 6px 0', fontSize: '0.95rem', color: 'var(--text-primary)' }}>1-Click Remote Snooze</h4>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Tap <strong>[Snooze 15m]</strong> directly in the email on your phone. Your server reschedules the task and re-arms your alert!
          </p>
        </div>
      </div>
    </div>
  );
}
