import React from 'react';

// Analytics Component for KPI Cards and Daily Study Bar Chart
export default function Analytics({ analytics }) {
  if (!analytics) return null;

  const chartData = Array.isArray(analytics.chart_data) ? analytics.chart_data : [];
  const maxMins = Math.max(...chartData.map(d => d.minutes || 0), 0);

  return (
    <div className="analytics-view">
      <h2>Study Analytics & Logs</h2>
      <p className="subtitle">Track timetable slots completed and total study hours logged.</p>

      <div className="analytics-kpis">
        <div className="kpi-card">
          <span className="kpi-val">{analytics.total_study_hours ?? 0}h</span>
          <span className="kpi-label">Total Time Logged</span>
        </div>
        <div className="kpi-card success">
          <span className="kpi-val">{analytics.completed_tasks ?? 0}</span>
          <span className="kpi-label">Completed Tasks</span>
        </div>
        <div className="kpi-card info">
          <span className="kpi-val">{analytics.scheduled_tasks ?? 0}</span>
          <span className="kpi-label">Scheduled Tasks</span>
        </div>
        <div className="kpi-card warning">
          <span className="kpi-val">{analytics.unfinished_tasks ?? 0}</span>
          <span className="kpi-label">Unfinished (Past Midnight)</span>
        </div>
      </div>

      <div className="analytics-charts-grid">
        {/* Daily study tracker bar chart */}
        <div className="chart-card block-chart">
          <h3>Daily Study Tracking (Minutes Logged)</h3>
          <p className="chart-subtitle">Last 7 days visual overview</p>

          <div className="custom-bar-chart">
            <div className="chart-bars-wrapper">
              {chartData.map(day => (
                <div key={day.date} className="chart-bar-container">
                  <div
                    className="chart-bar"
                    style={{
                      height: maxMins > 0 ? `${((day.minutes || 0) / maxMins) * 80}%` : '5%',
                      backgroundColor: 'var(--success-color)'
                    }}
                  >
                    <span className="chart-bar-value">{day.minutes || 0}m</span>
                  </div>
                  <span className="chart-bar-label">{day.day}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
