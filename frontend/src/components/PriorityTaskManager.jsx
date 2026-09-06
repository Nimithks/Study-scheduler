import React, { useState, useMemo } from 'react';

const PRIORITY_WEIGHTS = {
  High: 3,
  Medium: 2,
  Low: 1
};

export default function PriorityTaskManager({
  tasks,
  loading,
  apiCall,
  fetchTasks,
  handleCompleteTask,
  handleDeleteTask
}) {
  const [taskName, setTaskName] = useState('');
  const [priority, setPriority] = useState('High');
  const [deadlineDate, setDeadlineDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [deadlineTime, setDeadlineTime] = useState('18:00');
  const [filterStatus, setFilterStatus] = useState('Pending');

  // Compute full deadline string and timestamp for sorting
  const getTaskDeadlineTimestamp = (task) => {
    if (task.deadline) {
      const dt = new Date(task.deadline);
      if (!isNaN(dt.getTime())) return dt.getTime();
    }
    // Fallback using date_str and end_time/start_time
    const dateStr = task.date_str || new Date().toISOString().split('T')[0];
    const timeStr = task.end_time || task.start_time || '23:59';
    const dt = new Date(`${dateStr}T${timeStr}:00`);
    return isNaN(dt.getTime()) ? Infinity : dt.getTime();
  };

  // Earliest Deadline First (EDF) + Priority Tie-Breaker
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const timeA = getTaskDeadlineTimestamp(a);
      const timeB = getTaskDeadlineTimestamp(b);

      // 1. Earliest deadline comes first
      if (timeA !== timeB) {
        return timeA - timeB;
      }

      // 2. High priority comes first if deadlines match
      const pA = PRIORITY_WEIGHTS[a.priority] || 2;
      const pB = PRIORITY_WEIGHTS[b.priority] || 2;
      return pB - pA;
    });
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    if (filterStatus === 'Pending') {
      return sortedTasks.filter(t => t.status === 'Scheduled' || t.status === 'Pending');
    }
    if (filterStatus === 'Completed') {
      return sortedTasks.filter(t => t.status === 'Completed');
    }
    return sortedTasks;
  }, [sortedTasks, filterStatus]);

  // Find the top recommended task to tackle right now
  const topFocusTask = useMemo(() => {
    return sortedTasks.find(t => t.status === 'Scheduled' || t.status === 'Pending');
  }, [sortedTasks]);

  const handleCreatePriorityTask = async (e) => {
    e.preventDefault();
    if (!taskName.trim()) return;

    const fullDeadlineIso = `${deadlineDate}T${deadlineTime}:00`;

    try {
      await apiCall('tasks', 'POST', {
        date_str: deadlineDate,
        start_time: deadlineTime,
        end_time: deadlineTime,
        task_name: taskName,
        priority: priority,
        deadline: fullDeadlineIso
      });
      setTaskName('');
      fetchTasks();
    } catch (err) {
      alert(err.message || 'Failed to add priority task');
    }
  };

  // Helper for human-readable deadline display & overdue detection
  const renderDeadlineBadge = (task) => {
    const ts = getTaskDeadlineTimestamp(task);
    if (ts === Infinity) return null;

    const diffMs = ts - Date.now();
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));

    if (diffMs < 0 && task.status !== 'Completed') {
      return <span className="deadline-badge overdue">⚠️ Overdue</span>;
    }
    if (diffHours >= 0 && diffHours <= 3 && task.status !== 'Completed') {
      return <span className="deadline-badge urgent">⏰ Due in {diffHours === 0 ? 'less than 1 hr' : `${diffHours}h`}</span>;
    }

    const dt = new Date(ts);
    const dateFormatted = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timeFormatted = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return <span className="deadline-badge normal">🗓️ Due {dateFormatted} at {timeFormatted}</span>;
  };

  return (
    <div className="priority-manager-container">
      {/* Top Focus Recommendation Banner */}
      {topFocusTask && (
        <div className="focus-recommendation-card">
          <div className="focus-header">
            <span className="focus-icon">⚡</span>
            <div>
              <h3>Smart Recommended Task</h3>
              <p className="subtitle">Earliest finishing & highest priority match</p>
            </div>
          </div>
          <div className="focus-body">
            <div className="focus-task-info">
              <span className={`priority-tag ${(topFocusTask.priority || 'Medium').toLowerCase()}`}>
                {topFocusTask.priority || 'Medium'} Priority
              </span>
              <strong className="focus-task-title">{topFocusTask.task_name}</strong>
              {renderDeadlineBadge(topFocusTask)}
            </div>
            {topFocusTask.status === 'Scheduled' && (
              <button
                className="btn btn-success"
                onClick={() => handleCompleteTask(topFocusTask)}
              >
                ✓ Mark Completed
              </button>
            )}
          </div>
        </div>
      )}

      <div className="priority-grid">
        {/* Left Column: Form to Add Task */}
        <div className="column-card priority-form-card">
          <h2>🎯 Add Priority Task</h2>
          <p className="subtitle">Schedule tasks with specific deadline dates and priority levels.</p>

          <form onSubmit={handleCreatePriorityTask} className="priority-task-form">
            <div className="form-group">
              <label htmlFor="pTaskName">Task Title</label>
              <input
                id="pTaskName"
                type="text"
                placeholder="e.g. Finalize Resume, Submit Project Report"
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="pPriority">Priority Category</label>
              <select
                id="pPriority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="priority-select"
              >
                <option value="High">🔥 High Priority</option>
                <option value="Medium">⚡ Medium Priority</option>
                <option value="Low">🌱 Low Priority</option>
              </select>
            </div>

            <div className="form-row">
              <div className="form-group col">
                <label htmlFor="pDeadlineDate">Deadline Date</label>
                <input
                  id="pDeadlineDate"
                  type="date"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                  required
                />
              </div>
              <div className="form-group col">
                <label htmlFor="pDeadlineTime">Time</label>
                <input
                  id="pDeadlineTime"
                  type="time"
                  value={deadlineTime}
                  onChange={(e) => setDeadlineTime(e.target.value)}
                  required
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary btn-block">
              + Add Priority Task
            </button>
          </form>
        </div>

        {/* Right Column: Priority Task List with Sorting */}
        <div className="column-card priority-list-card">
          <div className="list-header-row">
            <div>
              <h2>Priority Task Queue</h2>
              <p className="subtitle">Automatically ordered by Earliest Deadline → Priority</p>
            </div>
            <div className="filter-buttons">
              <button
                className={`filter-btn ${filterStatus === 'Pending' ? 'active' : ''}`}
                onClick={() => setFilterStatus('Pending')}
              >
                Pending
              </button>
              <button
                className={`filter-btn ${filterStatus === 'Completed' ? 'active' : ''}`}
                onClick={() => setFilterStatus('Completed')}
              >
                Completed
              </button>
              <button
                className={`filter-btn ${filterStatus === 'All' ? 'active' : ''}`}
                onClick={() => setFilterStatus('All')}
              >
                All
              </button>
            </div>
          </div>

          {loading && <div className="mini-loader">Loading priority queue...</div>}

          {filteredTasks.length === 0 ? (
            <p className="empty-tasks">No {filterStatus.toLowerCase()} priority tasks found.</p>
          ) : (
            <div className="priority-tasks-list">
              {filteredTasks.map((task) => {
                const isScheduled = task.status === 'Scheduled' || task.status === 'Pending';
                const pLevel = (task.priority || 'Medium').toLowerCase();

                return (
                  <div key={task.id} className={`priority-task-item ${task.status.toLowerCase()} border-${pLevel}`}>
                    <div className="task-content">
                      <div className="task-badge-row">
                        <span className={`priority-tag ${pLevel}`}>
                          {task.priority || 'Medium'}
                        </span>
                        {renderDeadlineBadge(task)}
                      </div>
                      <h4 className="priority-task-name">{task.task_name}</h4>
                    </div>

                    <div className="task-actions">
                      {isScheduled && (
                        <button
                          className="btn btn-sm btn-success"
                          onClick={() => handleCompleteTask(task)}
                        >
                          ✓ Done
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
