/**
 * Time utility functions for formatting and calculations
 */

export const formatSeconds = (totalSecs) =>
  new Date(totalSecs * 1000).toISOString().slice(11, 19);

export const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

export const formatMinutesToTime = (totalMin) => {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
