import React from 'react';
import { formatSeconds } from '../utils/time';

// Timer Component for Logging and Measuring Real-time Study Hours
export default function Timer({
  timerSeconds,
  selectedTaskForTimer,
  setSelectedTaskForTimer,
  tasks = [],
  timerActive,
  toggleTimer,
  handleStopAndSave
}) {
  const safeTasks = Array.isArray(tasks) ? tasks : [];

  return (
    <div className="timer-column">
      <div className="column-card timer-card">
        <h2>Active Study Timer</h2>
        <p className="subtitle">Track actual minutes studied for your logs.</p>

        <div className="stopwatch-display">
          {formatSeconds(timerSeconds)}
        </div>

        <div className="form-group select-study-task">
          <label htmlFor="timerTaskSelect">Select Active Topic</label>
          <select
            id="timerTaskSelect"
            value={selectedTaskForTimer}
            onChange={(e) => setSelectedTaskForTimer(e.target.value)}
          >
            <option value="">-- Choose Timetable Task or Type custom --</option>
            {safeTasks.filter(t => t.status === 'Scheduled').map(t => (
              <option key={t.id} value={t.task_name}>{t.task_name} ({t.start_time})</option>
            ))}
            <option value="General Coding">General Coding / Reading</option>
            <option value="Mock Interview">Mock Interview Prep</option>
          </select>

          <input
            type="text"
            placeholder="Or type custom topic..."
            value={selectedTaskForTimer}
            onChange={(e) => setSelectedTaskForTimer(e.target.value)}
            style={{ marginTop: '0.5rem' }}
          />
        </div>

        <div className="timer-controls">
          <button
            onClick={toggleTimer}
            className={`btn ${timerActive ? 'btn-danger' : 'btn-success'} btn-lg`}
          >
            {timerActive ? '⏸ Pause study' : '▶ Start Study Session'}
          </button>
          <button
            onClick={handleStopAndSave}
            disabled={timerSeconds === 0}
            className="btn btn-secondary btn-lg"
          >
            ⏹ Stop & Log Hours
          </button>
        </div>
      </div>
    </div>
  );
}
