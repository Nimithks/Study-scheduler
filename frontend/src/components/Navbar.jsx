import React from 'react';

// Navbar Component for App Header and Navigation
export default function Navbar({
  user,
  tab,
  setTab,
  handleLogout,
  fetchAnalytics
}) {
  return (
    <header className="navbar">
      <div className="brand" onClick={() => setTab('schedule')}>
        <span className="brand-icon">📅</span>
        <div>
          <h1>Smart Scheduler & Tracker</h1>
          <span className="brand-user">Student: <strong>{user?.username || 'Student'}</strong></span>
        </div>
      </div>
      <nav>
        <button 
          className={`nav-btn ${tab === 'schedule' ? 'active' : ''}`} 
          onClick={() => setTab('schedule')}
        >
          Timetable & Timer
        </button>
        <button 
          className={`nav-btn ${tab === 'priority' ? 'active' : ''}`} 
          onClick={() => setTab('priority')}
        >
          🎯 Priority Tasks
        </button>
        <button 
          className={`nav-btn ${tab === 'analytics' ? 'active' : ''}`} 
          onClick={() => { setTab('analytics'); fetchAnalytics(); }}
        >
          Analytics Dashboard
        </button>
        <button 
          className={`nav-btn ${tab === 'notifications' ? 'active' : ''}`} 
          onClick={() => setTab('notifications')}
        >
          🔔 Email Alerts {user?.email && (user.email_verified ? '🟢' : '🟡')}
        </button>
        <button className="nav-btn btn-danger-text" onClick={handleLogout}>Log Out</button>
      </nav>
    </header>
  );
}
