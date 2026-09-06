import React from 'react';

// AlarmModal Component to Handle Real-time Study Prompts and Snoozes
export default function AlarmModal({
  activeAlarmTask,
  setActiveAlarmTask,
  setSelectedTaskForTimer,
  setTab,
  timerActive,
  toggleTimer,
  handleSnoozeTask
}) {
  if (!activeAlarmTask) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content alarm-modal">
        <span className="alarm-icon">⏰</span>
        <h3>Time to study!</h3>
        <p className="alarm-task-title">"{activeAlarmTask.task_name}"</p>
        <p className="alarm-prompt">Starts: {activeAlarmTask.start_time} - Ends: {activeAlarmTask.end_time}</p>

        <div className="alarm-actions">
          <button
            className="btn btn-success"
            onClick={() => {
              setSelectedTaskForTimer(activeAlarmTask.task_name);
              setActiveAlarmTask(null);
              setTab('schedule');
              if (!timerActive) toggleTimer(); // Start timer
            }}
          >
            Start Study Now
          </button>

          <div className="snooze-section">
            <span>Or Snooze Task:</span>
            <div className="snooze-grid">
              {[10, 20, 30, 40, 50, 60, 120, 180].map(mins => (
                <button
                  key={mins}
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleSnoozeTask(activeAlarmTask, mins)}
                >
                  {mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
