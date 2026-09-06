import React, { useState, useEffect, useRef } from 'react';
import Navbar from './components/Navbar';
import Auth from './components/Auth';
import Scheduler from './components/Scheduler';
import Timer from './components/Timer';
import Analytics from './components/Analytics';
import AlarmModal from './components/AlarmModal';
import BurnoutShield from './components/BurnoutShield';
import MissedTasksModal from './components/MissedTasksModal';
import PriorityTaskManager from './components/PriorityTaskManager';
import { formatSeconds, parseTimeToMinutes, formatMinutesToTime } from './utils/time';

const API_BASE_URL = '/api';

export default function App() {
  // Session / Auth state (restoring token from sessionStorage if valid)
  const [token, setToken] = useState(() => {
    const saved = sessionStorage.getItem('study_token');
    return saved && saved !== 'undefined' && saved !== 'null' ? saved : null;
  });
  const [user, setUser] = useState(null);

  // Navigation Tabs: 'schedule', 'analytics'
  const [tab, setTab] = useState('schedule');

  // Timetable Tasks State
  const [tasks, setTasks] = useState([]);
  const [newTaskDate, setNewTaskDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Study Timer (Stopwatch) State
  const [timerActive, setTimerActive] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [selectedTaskForTimer, setSelectedTaskForTimer] = useState('');
  const timerIntervalRef = useRef(null);

  // Active Alarm State
  const [activeAlarmTask, setActiveAlarmTask] = useState(null);
  const [alerted5MinTaskIds, setAlerted5MinTaskIds] = useState(new Set());
  const [alarmedTaskIds, setAlarmedTaskIds] = useState(new Set());
  const [activePreAlertText, setActivePreAlertText] = useState(null);

  // Missed Tasks Recovery State
  const [missedTasksModalData, setMissedTasksModalData] = useState(null);
  const checkedMissedRef = useRef(false);

  // General UI state
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);

  // --- MISSED TASKS RESCHEDULING ENGINE ---
  const calculateMissedReschedule = (taskList, applyCompression = false, compressionFactor = 1, currentCompressionCount = 0) => {
    const now = new Date();
    const currentTodayStr = now.toISOString().split('T')[0];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const todayScheduled = taskList.filter(t => t.date_str === currentTodayStr && t.status === 'Scheduled');
    todayScheduled.sort((a, b) => a.start_time.localeCompare(b.start_time));

    const overdueTasks = todayScheduled.filter(t => parseTimeToMinutes(t.start_time) < currentMinutes);
    if (overdueTasks.length === 0) return null;

    const firstOverdueId = overdueTasks[0].id;
    const startIndex = todayScheduled.findIndex(t => t.id === firstOverdueId);

    let fullUpdatedTasksList = JSON.parse(JSON.stringify(taskList));
    let proposedSchedule = [];

    let nextStartM = currentMinutes;
    let overflowTaskCount = 0;

    for (let i = startIndex; i < todayScheduled.length; i++) {
      const originalTask = todayScheduled[i];
      const taskInFull = fullUpdatedTasksList.find(t => t.id === originalTask.id);
      if (!taskInFull) continue;

      let startM = parseTimeToMinutes(originalTask.start_time);
      let endM = parseTimeToMinutes(originalTask.end_time);
      let duration = endM - startM;
      if (duration < 0) duration += 24 * 60;

      if (applyCompression) {
        duration = Math.max(10, Math.round(duration * compressionFactor));
      }

      let proposedEndM = nextStartM + duration;
      let status = 'Scheduled';

      if (proposedEndM > 23 * 60 + 59) {
        status = 'Unfinished';
        overflowTaskCount++;
      }

      taskInFull.start_time = formatMinutesToTime(Math.min(nextStartM, 23 * 60 + 59));
      taskInFull.end_time = formatMinutesToTime(Math.min(proposedEndM, 23 * 60 + 59));
      taskInFull.status = status;

      proposedSchedule.push({
        id: taskInFull.id,
        task_name: taskInFull.task_name,
        start_time: taskInFull.start_time,
        end_time: taskInFull.end_time,
        status: taskInFull.status
      });

      nextStartM = proposedEndM;
    }

    return {
      overdueTasks,
      proposedSchedule,
      fullUpdatedTasksList,
      hasMidnightOverflow: overflowTaskCount > 0,
      overflowTaskCount,
      compressionCount: currentCompressionCount
    };
  };

  const handleRescheduleMissed = async (applyCompression = false) => {
    if (!missedTasksModalData) return;

    if (applyCompression) {
      const newCount = (missedTasksModalData.compressionCount || 0) + 1;
      const factor = 0.8; // Reduce by 20%
      const newProposal = calculateMissedReschedule(tasks, true, factor, newCount);

      if (newProposal) {
        setMissedTasksModalData(newProposal);
        return;
      }
    }

    await saveTaskBatch(missedTasksModalData.fullUpdatedTasksList);
    setMissedTasksModalData(null);
  };

  const handleMarkMissedAsUnfinished = async () => {
    if (!missedTasksModalData) return;
    const missedIds = new Set(missedTasksModalData.overdueTasks.map(t => t.id));
    const updated = tasks.map(t => {
      if (missedIds.has(t.id)) {
        return { ...t, status: 'Unfinished' };
      }
      return t;
    });
    await saveTaskBatch(updated);
    setMissedTasksModalData(null);
  };

  // --- BURNOUT SHIELD SYSTEM METHODS ---
  const getDailyScheduledMinutes = (dateStr) => {
    return tasks
      .filter(t => t.date_str === dateStr && t.status === 'Scheduled')
      .reduce((sum, t) => {
        const startM = parseTimeToMinutes(t.start_time);
        const endM = parseTimeToMinutes(t.end_time);
        let diff = endM - startM;
        if (diff < 0) diff += 24 * 60; // Handle cross-midnight
        return sum + diff;
      }, 0);
  };

  const handleScaleDownTimetable = async (dateStr) => {
    const dayTasks = tasks.filter(t => t.date_str === dateStr && t.status === 'Scheduled');
    if (dayTasks.length === 0) {
      alert("No scheduled study tasks found for this date to scale down.");
      return;
    }

    if (!window.confirm(`Scale down all scheduled tasks for ${dateStr} by 20% to insert rest breaks?`)) {
      return;
    }

    const updatedTasks = tasks.map(t => {
      if (t.date_str === dateStr && t.status === 'Scheduled') {
        const startM = parseTimeToMinutes(t.start_time);
        const endM = parseTimeToMinutes(t.end_time);
        let duration = endM - startM;
        if (duration < 0) duration += 24 * 60;

        const newDuration = Math.max(15, Math.round(duration * 0.8));
        const newEndM = (startM + newDuration) % (24 * 60);

        return {
          ...t,
          end_time: formatMinutesToTime(newEndM)
        };
      }
      return t;
    });

    await saveTaskBatch(updatedTasks);
    alert("Timetable scaled down! 20% rest buffers have been created between tasks.");
  };

  // ----------------- API METHODS -----------------
  const apiCall = async (endpoint, method = 'GET', body = null) => {
    const options = { 
      method,
      headers: {}
    };
    if (body) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    // Retrieve token from sessionStorage 'study_token'
    const savedToken = sessionStorage.getItem('study_token');
    if (savedToken) {
      options.headers['Authorization'] = `Bearer ${savedToken}`;
    }

    const res = await fetch(`${API_BASE_URL}/${endpoint}`, options);
    const data = await res.json();
    if (!res.ok) {
      let errMsg = 'Request failed';
      if (data.detail) {
        if (typeof data.detail === 'string') {
          errMsg = data.detail;
        } else if (Array.isArray(data.detail)) {
          errMsg = data.detail.map(e => `${e.loc.join('/')}: ${e.msg}`).join(' | ');
        } else {
          errMsg = JSON.stringify(data.detail);
        }
      }
      throw new Error(errMsg);
    }
    return data;
  };

  const fetchTasks = async () => {
    if (!user) return;
    setLoading(true);
    setApiError(null);
    try {
      const data = await apiCall('tasks');
      setTasks(data);
    } catch (err) {
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await apiCall('analytics');
      setAnalytics(data);
    } catch (err) {
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('study_token');
    setToken(null);
    setUser(null);
    setTasks([]);
    checkedMissedRef.current = false;
    setMissedTasksModalData(null);
  };

  const handleDeleteTask = async (id) => {
    if (!window.confirm('Delete this task from schedule?')) return;
    try {
      await apiCall(`tasks/${id}`, 'DELETE');
      fetchTasks();
    } catch (err) {
      setApiError(err.message);
    }
  };

  const saveTaskBatch = async (updatedList) => {
    try {
      const bodyPayload = updatedList.map(t => ({
        id: t.id,
        start_time: t.start_time,
        end_time: t.end_time,
        status: t.status
      }));
      await apiCall('tasks/batch', 'PUT', bodyPayload);
      fetchTasks();
    } catch (err) {
      setApiError(err.message);
    }
  };

  // Fetch user details if token is available
  useEffect(() => {
    const fetchMe = async () => {
      if (token && !user) {
        try {
          const data = await apiCall('auth/me');
          setUser(data);
        } catch (err) {
          console.error("Session invalid or expired", err);
          handleLogout();
        }
      }
    };
    fetchMe();
  }, [token]);

  // Load schedule data when logged in
  useEffect(() => {
    if (user) {
      fetchTasks();
    }
  }, [user]);

  // Auto-detect missed tasks when tasks are loaded for today
  useEffect(() => {
    if (tasks.length > 0 && !checkedMissedRef.current) {
      checkedMissedRef.current = true;
      const proposal = calculateMissedReschedule(tasks);
      if (proposal) {
        setMissedTasksModalData(proposal);
      }
    }
  }, [tasks]);

  // ----------------- ALARM / CASCADING SNOOZE ENGINE -----------------
  const tasksRef = useRef(tasks);
  const alarmedTaskIdsRef = useRef(alarmedTaskIds);
  const alerted5MinTaskIdsRef = useRef(alerted5MinTaskIds);

  useEffect(() => {
    tasksRef.current = tasks;
    alarmedTaskIdsRef.current = alarmedTaskIds;
    alerted5MinTaskIdsRef.current = alerted5MinTaskIds;
  }, [tasks, alarmedTaskIds, alerted5MinTaskIds]);

  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      const now = new Date();
      const currentTodayStr = now.toISOString().split('T')[0];
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      const currentTasks = tasksRef.current;
      const currentAlarmed = alarmedTaskIdsRef.current;
      const currentAlerted = alerted5MinTaskIdsRef.current;

      currentTasks.forEach(task => {
        if (task.date_str !== currentTodayStr || task.status !== 'Scheduled') return;

        const taskStartMinutes = parseTimeToMinutes(task.start_time);
        const timeDiff = taskStartMinutes - currentMinutes;

        if (timeDiff === 5 && timeDiff > 0 && !currentAlerted.has(task.id)) {
          setActivePreAlertText(`Pre-Alert: Your study task "${task.task_name}" will start in 5 minutes!`);
          setAlerted5MinTaskIds(prev => new Set([...prev, task.id]));
        }

        if (timeDiff <= 0 && !currentAlarmed.has(task.id)) {
          setActiveAlarmTask(task);
          setAlarmedTaskIds(prev => new Set([...prev, task.id]));
        }
      });
    }, 10000);

    return () => clearInterval(interval);
  }, [user]);

  const handleSnoozeTask = (task, minutes) => {
    const dateTasks = tasks.filter(t => t.date_str === task.date_str && (t.status === 'Scheduled' || t.id === task.id));
    dateTasks.sort((a, b) => a.start_time.localeCompare(b.start_time));

    let updatedTasks = [...tasks];
    let delay = minutes;

    const startIndex = dateTasks.findIndex(t => t.id === task.id);

    for (let i = startIndex; i < dateTasks.length; i++) {
      const current = updatedTasks.find(t => t.id === dateTasks[i].id);
      if (!current) continue;

      let startM = parseTimeToMinutes(current.start_time);
      let endM = parseTimeToMinutes(current.end_time);
      let duration = endM - startM;
      if (duration < 0) duration += 24 * 60;

      let newStartM = startM + delay;
      let newEndM = newStartM + duration;

      if (newEndM > 23 * 60 + 59) {
        current.status = 'Unfinished';
        alert(`Task "${current.task_name}" shifted past midnight! Marked as Unfinished.`);
      } else {
        current.start_time = formatMinutesToTime(newStartM);
        current.end_time = formatMinutesToTime(newEndM);
      }

      if (i + 1 < dateTasks.length) {
        const next = updatedTasks.find(t => t.id === dateTasks[i + 1].id);
        if (next) {
          let nextStartM = parseTimeToMinutes(next.start_time);
          if (newEndM > nextStartM) {
            delay = newEndM - nextStartM;
          } else {
            break;
          }
        }
      }
    }

    setAlarmedTaskIds(prev => {
      const next = new Set(prev);
      next.delete(task.id);
      return next;
    });

    setActiveAlarmTask(null);
    saveTaskBatch(updatedTasks);
  };

  const handleCompleteTask = (task) => {
    let updatedTasks = [...tasks];
    const completedIdx = updatedTasks.findIndex(t => t.id === task.id);
    if (completedIdx === -1) return;

    updatedTasks[completedIdx].status = 'Completed';

    if (timerActive && selectedTaskForTimer === task.task_name) {
      stopAndSaveTimer(task.task_name);
    }

    const sameDateTasks = updatedTasks.filter(t => t.date_str === task.date_str && t.status === 'Scheduled');
    sameDateTasks.sort((a, b) => a.start_time.localeCompare(b.start_time));

    if (sameDateTasks.length > 0) {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();

      let nextTask = sameDateTasks[0];
      let origStartM = parseTimeToMinutes(nextTask.start_time);
      let origEndM = parseTimeToMinutes(nextTask.end_time);
      let duration = origEndM - origStartM;

      let newStartM = nowMinutes;
      let newEndM = newStartM + duration;

      if (origStartM > newStartM) {
        nextTask.start_time = formatMinutesToTime(newStartM);
        nextTask.end_time = formatMinutesToTime(newEndM);

        for (let i = 1; i < sameDateTasks.length; i++) {
          let current = sameDateTasks[i];
          let currentStartM = parseTimeToMinutes(current.start_time);
          let prevEndM = parseTimeToMinutes(sameDateTasks[i - 1].end_time);

          if (currentStartM > prevEndM) {
            let currDuration = parseTimeToMinutes(current.end_time) - currentStartM;
            current.start_time = formatMinutesToTime(prevEndM);
            current.end_time = formatMinutesToTime(prevEndM + currDuration);
          }
        }
      }
    }

    saveTaskBatch(updatedTasks);
  };

  // ----------------- TIMER METHODS -----------------
  const toggleTimer = () => {
    if (timerActive) {
      clearInterval(timerIntervalRef.current);
      setTimerActive(false);
    } else {
      if (!selectedTaskForTimer) {
        alert('Please write or select a topic to study!');
        return;
      }
      setTimerActive(true);
      timerIntervalRef.current = setInterval(() => {
        setTimerSeconds(prev => prev + 1);
      }, 1000);
    }
  };

  const handleStopAndSave = () => {
    if (timerSeconds === 0) return;
    stopAndSaveTimer(selectedTaskForTimer);
  };

  const stopAndSaveTimer = async (taskName) => {
    clearInterval(timerIntervalRef.current);
    setTimerActive(false);

    try {
      await apiCall('sessions', 'POST', {
        task_name: taskName,
        duration: timerSeconds
      });
      alert(`Successfully logged ${formatSeconds(timerSeconds)} of study time!`);
    } catch (err) {
      console.error(err);
    }

    setTimerSeconds(0);
  };

  // ----------------- RENDER METHODS -----------------
  if (!user) {
    return (
      <Auth
        onLoginSuccess={(userData, tokenData) => {
          sessionStorage.setItem('study_token', tokenData);
          setToken(tokenData);
          setUser(userData);
        }}
        apiCall={apiCall}
      />
    );
  }

  return (
    <div className="app-container">
      {/* NAVBAR */}
      <Navbar
        user={user}
        tab={tab}
        setTab={setTab}
        handleLogout={handleLogout}
        fetchAnalytics={fetchAnalytics}
      />

      {/* SYSTEM WARNING BANNER FOR 5-MIN PRE-ALERTS */}
      {activePreAlertText && (
        <div className="alert-banner info-banner">
          <span>🔔 {activePreAlertText}</span>
          <button className="close-alert-btn" onClick={() => setActivePreAlertText(null)}>×</button>
        </div>
      )}

      {apiError && (
        <div className="alert-banner error-banner">
          <span>⚠️ {apiError}</span>
          <button className="close-alert-btn" onClick={() => setApiError(null)}>×</button>
        </div>
      )}

      {/* --- MISSED TASKS RECOVERY MODAL --- */}
      <MissedTasksModal
        missedData={missedTasksModalData}
        onReschedule={handleRescheduleMissed}
        onMarkAsUnfinished={handleMarkMissedAsUnfinished}
        onDismiss={() => setMissedTasksModalData(null)}
      />

      {/* --- START STUDY ALARM MODAL --- */}
      <AlarmModal
        activeAlarmTask={activeAlarmTask}
        setActiveAlarmTask={setActiveAlarmTask}
        setSelectedTaskForTimer={setSelectedTaskForTimer}
        setTab={setTab}
        timerActive={timerActive}
        toggleTimer={toggleTimer}
        handleSnoozeTask={handleSnoozeTask}
      />

      <main className="content-body">
        {/* --- TIMETABLE & TIMER TABS --- */}
        {tab === 'schedule' && (
          <div>
            {/* Burnout Shield Control Panel */}
            <BurnoutShield
              tasks={tasks}
              newTaskDate={newTaskDate}
              handleScaleDownTimetable={handleScaleDownTimetable}
              getDailyScheduledMinutes={getDailyScheduledMinutes}
            />

            <div className="schedule-split-view">
              {/* Left side: Timetable list */}
              <Scheduler
                tasks={tasks}
                loading={loading}
                newTaskDate={newTaskDate}
                setNewTaskDate={setNewTaskDate}
                apiCall={apiCall}
                fetchTasks={fetchTasks}
                handleCompleteTask={handleCompleteTask}
                handleDeleteTask={handleDeleteTask}
                handleSnoozeTask={handleSnoozeTask}
              />

              {/* Right side: Study Timer stopwatch */}
              <Timer
                timerSeconds={timerSeconds}
                selectedTaskForTimer={selectedTaskForTimer}
                setSelectedTaskForTimer={setSelectedTaskForTimer}
                tasks={tasks}
                timerActive={timerActive}
                toggleTimer={toggleTimer}
                handleStopAndSave={handleStopAndSave}
              />
            </div>
          </div>
        )}

        {/* --- PRIORITY TASKS TAB --- */}
        {tab === 'priority' && (
          <PriorityTaskManager
            tasks={tasks}
            loading={loading}
            apiCall={apiCall}
            fetchTasks={fetchTasks}
            handleCompleteTask={handleCompleteTask}
            handleDeleteTask={handleDeleteTask}
          />
        )}

        {/* --- ANALYTICS TAB --- */}
        {tab === 'analytics' && (
          <Analytics analytics={analytics} />
        )}
      </main>

      <footer className="footer">
        <p>Final Year Student Project. Built with React & FastAPI.</p>
      </footer>
    </div>
  );
}
