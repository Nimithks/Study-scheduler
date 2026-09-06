import React from 'react';

export default function MissedTasksModal({
  missedData,
  onReschedule,
  onMarkAsUnfinished,
  onDismiss
}) {
  if (!missedData) return null;

  const { overdueTasks, proposedSchedule, hasMidnightOverflow, overflowTaskCount, compressionCount } = missedData;

  return (
    <div className="modal-overlay">
      <div className="modal-content missed-tasks-modal">
        <div className="missed-modal-header">
          <span className="missed-icon">⚠️</span>
          <h3>Missed Scheduled Tasks Detected</h3>
        </div>

        <p className="missed-modal-desc">
          You have <strong>{overdueTasks.length}</strong> task{overdueTasks.length > 1 ? 's' : ''} scheduled earlier today that you didn't start:
        </p>

        <div className="missed-tasks-list">
          {overdueTasks.map(task => (
            <div key={task.id} className="missed-task-item">
              <span className="task-name">📌 {task.task_name}</span>
              <span className="task-time-original">Originally:  {task.start_time} - {task.end_time}</span>
            </div>
          ))}
        </div>

        {hasMidnightOverflow && (
          <div className="alert-banner warning-banner modal-warning-banner">
            <span>🚨 <strong>Schedule Overflow Warning: </strong> Rescheduling starting from now will push <strong>{overflowTaskCount}</strong> task{overflowTaskCount > 1 ? 's' : ''} past midnight (11:59 PM)!</span>
          </div>
        )}

        <div className="proposed-preview">
          <h4>Proposed Timeline (Starting Now):</h4>
          <ul className="preview-list">
            {proposedSchedule.map(task => (
              <li key={task.id} className={task.status === 'Unfinished' ? 'overflow-task' : ''}>
                <span className="preview-task-name">{task.task_name}</span>
                <span className="preview-task-time">{task.start_time} - {task.end_time}</span>
                {task.status === 'Unfinished' && <span className="status-badge unfinished">Unfinished (Past Midnight)</span>}
              </li>
            ))}
          </ul>
        </div>

        <div className="missed-modal-actions">
          {hasMidnightOverflow ? (
            <button
              type="button"
              className="btn btn-warning"
              onClick={() => onReschedule(true)}
            >
              ⚡ Reduce Tasks by 20% & Reschedule {compressionCount > 0 ? `(Applied x${compressionCount})` : ''}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-success"
              onClick={() => onReschedule(false)}
            >
              🔄 Reschedule All Starting Now
            </button>
          )}

          {hasMidnightOverflow && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onReschedule(false)}
            >
              Accept & Mark Late Tasks Unfinished
            </button>
          )}

          <button
            type="button"
            className="btn btn-danger"
            onClick={onMarkAsUnfinished}
          >
            Mark Missed as Unfinished
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
