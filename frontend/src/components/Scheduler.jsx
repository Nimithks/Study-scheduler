import React, { useState } from 'react';

// Scheduler Component for Timetable Scheduling and Listing
export default function Scheduler({
  tasks,
  loading,
  newTaskDate,
  setNewTaskDate,
  apiCall,
  fetchTasks,
  handleCompleteTask,
  handleDeleteTask,
  handleSnoozeTask
}) {
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskStart, setNewTaskStart] = useState('10:00');
  const [newTaskEnd, setNewTaskEnd] = useState('11:30');

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTaskName.trim()) return;

    try {
      await apiCall('tasks', 'POST', {
        date_str: newTaskDate,
        start_time: newTaskStart,
        end_time: newTaskEnd,
        task_name: newTaskName
      });
      setNewTaskName('');
      fetchTasks();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="scheduler-column">
      <div className="column-card">
        <h2>Timetable Scheduler</h2>
        <p className="subtitle">Enter your learning tasks and daily timeslots.</p>

        <form onSubmit={handleAddTask} className="add-task-form">
          <div className="form-group">
            <label htmlFor="taskName">Task Name</label>
            <input
              id="taskName"
              type="text"
              placeholder="e.g. React study, Coding Practice"
              value={newTaskName}
              onChange={(e) => setNewTaskName(e.target.value)}
              required
            />
          </div>
          <div className="form-row">
            <div className="form-group col">
              <label htmlFor="taskDate">Date</label>
              <input
                id="taskDate"
                type="date"
                value={newTaskDate}
                onChange={(e) => setNewTaskDate(e.target.value)}
                required
              />
            </div>
            <div className="form-group col">
              <label htmlFor="taskStart">Start Time</label>
              <input
                id="taskStart"
                type="time"
                value={newTaskStart}
                onChange={(e) => setNewTaskStart(e.target.value)}
                required
              />
            </div>
            <div className="form-group col">
              <label htmlFor="taskEnd">End Time</label>
              <input
                id="taskEnd"
                type="time"
                value={newTaskEnd}
                onChange={(e) => setNewTaskEnd(e.target.value)}
                required
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-block">Add to Timetable</button>
        </form>

        <div className="tasks-list-box">
          <h3>Your Scheduled Tasks</h3>
          {loading && <div className="mini-loader">Refreshing schedule...</div>}

          {tasks.length === 0 ? (
            <p className="empty-tasks">No tasks scheduled yet. Add a slot above!</p>
          ) : (
            <div className="tasks-list">
              {tasks.map(task => {
                const isScheduled = task.status === 'Scheduled';
                return (
                  <div key={task.id} className={`task-item ${task.status.toLowerCase()}`}>
                    <div className="task-item-details">
                      <span className="task-date">{task.date_str}</span>
                      <div className="task-time-slot">
                        <strong>{task.start_time} - {task.end_time}</strong>
                      </div>
                      <span className="task-name-text">{task.task_name}</span>
                      <span className={`status-tag ${task.status.toLowerCase()}`}>{task.status}</span>
                    </div>

                    <div className="task-item-actions">
                      {isScheduled && (
                        <button
                          className="btn btn-sm btn-success"
                          onClick={() => handleCompleteTask(task)}
                          title="Mark completed early & pull forward next tasks"
                        >
                          ✓ Done Early
                        </button>
                      )}

                      {isScheduled && (
                        <button
                          className="btn btn-sm btn-info"
                          onClick={() => {
                            const mins = prompt("Enter snooze minutes (10, 20, 30, 40, 50, 60, 120, 180):", "30");
                            const parsedMins = parseInt(mins);
                            if ([10, 20, 30, 40, 50, 60, 120, 180].includes(parsedMins)) {
                              handleSnoozeTask(task, parsedMins);
                            } else if (mins) {
                              alert("Invalid snooze minutes. Use standard intervals.");
                            }
                          }}
                          title="Snooze and cascade-delay schedule"
                        >
                          ⏰ Snooze
                        </button>
                      )}

                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDeleteTask(task.id)}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
