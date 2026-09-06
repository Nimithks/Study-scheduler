import React, { useState } from 'react';

// Auth Component for User Login and Registration Screens
export default function Auth({ onLoginSuccess, apiCall }) {
  const [isRegister, setIsRegister] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState(null);

  const handleRegisterOrLogin = async (e) => {
    e.preventDefault();
    setAuthError(null);
    if (!usernameInput.trim() || !passwordInput.trim()) return;

    const path = isRegister ? 'register' : 'login';
    try {
      const data = await apiCall(`auth/${path}`, 'POST', { username: usernameInput, password: passwordInput });
      if (isRegister) {
        alert('Registration successful! Please login.');
        setIsRegister(false);
        setPasswordInput('');
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
        <p className="auth-subtitle">Track study hours and manage daily timetables.</p>

        {authError && <div className="auth-error">❌ {authError}</div>}

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
          <button type="submit" className="btn btn-primary btn-block">
            {isRegister ? 'Register Account' : 'Authenticate & Login'}
          </button>
        </form>

        <p className="auth-toggle">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}
          <button className="toggle-btn" onClick={() => { setIsRegister(!isRegister); setAuthError(null); }}>
            {isRegister ? 'Login Here' : 'Create Account Here'}
          </button>
        </p>
      </div>
    </div>
  );
}
