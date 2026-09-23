import React, { useState } from 'react';

// Auth Component for User Login and Registration Screens
export default function Auth({ onLoginSuccess, apiCall }) {
  const [isRegister, setIsRegister] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [authError, setAuthError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const handleRegisterOrLogin = async (e) => {
    e.preventDefault();
    setAuthError(null);
    setSuccessMsg(null);
    if (!usernameInput.trim() || !passwordInput.trim()) return;

    const path = isRegister ? 'register' : 'login';
    const payload = {
      username: usernameInput,
      password: passwordInput,
      ...(isRegister && emailInput.trim() ? { email: emailInput.trim() } : {})
    };

    try {
      const data = await apiCall(`auth/${path}`, 'POST', payload);
      if (isRegister) {
        setSuccessMsg(
          data.message || (emailInput.trim() 
            ? 'Account created! A verification link has been sent to your email.' 
            : 'Registration successful! Please login.')
        );
        setIsRegister(false);
        setPasswordInput('');
        setEmailInput('');
      } else {
        onLoginSuccess(data, data.token);
      }
    } catch (err) {
      setAuthError(err.message);
    }
  };

  return (
    <div className="login-screen">
      <div className="auth-box">
        <span className="logo-emoji">📅</span>
        <h2>{isRegister ? 'Create Student Account' : 'Smart Study Scheduler'}</h2>
        <p className="auth-subtitle">Track study hours, daily timetables & smart task alerts.</p>

        {authError && (
          <div className="auth-error">
            <div>❌ {authError}</div>
            {authError.toLowerCase().includes('verify your email') && (
              <button
                type="button"
                className="toggle-btn"
                style={{ marginTop: '8px', display: 'inline-block', color: '#fcd34d', fontWeight: 600, fontSize: '12.5px' }}
                onClick={async () => {
                  try {
                    const res = await apiCall('auth/resend-verification', 'POST', { username: usernameInput });
                    setSuccessMsg(res.message);
                    setAuthError(null);
                  } catch (e) {
                    setAuthError(e.message);
                  }
                }}
              >
                📩 Resend verification email to my address
              </button>
            )}
          </div>
        )}
        {successMsg && <div className="auth-success" style={{ background: '#ecfdf5', color: '#065f46', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13.5px', border: '1px solid #a7f3d0' }}>✅ {successMsg}</div>}

        <form onSubmit={handleRegisterOrLogin}>
          <div className="form-group">
            <label htmlFor="authUsername">Username</label>
            <input
              id="authUsername"
              type="text"
              placeholder="Enter username"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="authPassword">Password</label>
            <input
              id="authPassword"
              type="password"
              placeholder="Enter password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              required
            />
          </div>

          {isRegister && (
            <div className="form-group">
              <label htmlFor="authEmail">
                Email Address <span style={{ color: '#64748b', fontWeight: 'normal', fontSize: '12px' }}>(Optional)</span>
              </label>
              <input
                id="authEmail"
                type="email"
                placeholder="e.g. student@gmail.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
              />
              <small style={{ color: '#64748b', display: 'block', marginTop: '4px', fontSize: '11.5px', lineHeight: 1.4 }}>
                💡 Receive 5-min pre-alerts & 1-click snooze links even when laptop or app is closed!
              </small>
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-block">
            {isRegister ? 'Register Account' : 'Authenticate & Login'}
          </button>
        </form>

        <p className="auth-toggle">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}
          <button className="toggle-btn" onClick={() => { setIsRegister(!isRegister); setAuthError(null); setSuccessMsg(null); }}>
            {isRegister ? 'Login Here' : 'Create Account Here'}
          </button>
        </p>
      </div>
    </div>
  );
}
