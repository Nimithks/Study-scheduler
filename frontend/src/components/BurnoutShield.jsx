import React from 'react';

// BurnoutShield Component for Managing Study Fatigue Prevention
export default function BurnoutShield({
  tasks,
  newTaskDate,
  handleScaleDownTimetable,
  getDailyScheduledMinutes
}) {
  const dailyScheduledMins = typeof getDailyScheduledMinutes === 'function' ? getDailyScheduledMinutes(newTaskDate) : 0;
  const dailyScheduledHours = Math.round(dailyScheduledMins / 60 * 10) / 10;
  const isScheduledEmpty = (tasks || []).filter(t => t.date_str === newTaskDate && t.status === 'Scheduled').length === 0;

  return (
    <React.Fragment>
      <div className="burnout-shield-panel">
        <div className="shield-info">
          <h3>🛡️ Study Burnout Shield</h3>
          <p>Monitors daily hours and adjusts study durations to prevent fatigue.</p>
        </div>
        <div className="shield-actions">
          <div className="scheduled-hours-stat">
            <span>Scheduled Time for {newTaskDate}:</span>
            <strong>{dailyScheduledHours}h / 8.0h</strong>
          </div>
          <button 
            type="button" 
            className="btn btn-warning" 
            onClick={() => handleScaleDownTimetable(newTaskDate)}
            disabled={isScheduledEmpty}
          >
            ⚡ Smart Load Adjuster (-20%)
          </button>
        </div>
      </div>

      {dailyScheduledMins > 480 && (
        <div className="burnout-warning-card">
          <span className="warning-icon">⚠️</span>
          <div className="warning-details">
            <strong>High Study Load Alert!</strong>
            <p>You have scheduled {dailyScheduledHours} hours of study for {newTaskDate}. To avoid mental exhaustion, consider using the <strong>Smart Load Adjuster</strong> to automatically insert break buffers between tasks.</p>
          </div>
        </div>
      )}
    </React.Fragment>
  );
}
