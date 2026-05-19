/**
 * Utility functions for Quadranti (Starting Times Simulator)
 * Contains general-purpose helper functions
 */

/**
 * Creates an array of numbers from start to end (inclusive)
 * @param {number} start - Starting number
 * @param {number} end - Ending number (optional, if not provided, range is 0 to start)
 * @returns {number[]} Array of numbers
 */
export const range = (start, end) => {
  if (typeof end === 'undefined') {
    end = start;
    start = 0;
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
};

/**
 * Converts total minutes to HH:MM format
 * @param {number} totalMinutes - Total minutes
 * @returns {string} Time in HH:MM format
 */
export const formatMinutes = (totalMinutes) => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${minutes.toString().padStart(2, '0')}`;
};

/**
 * Adds two times in HH:MM format
 * @param {string} timeA - First time in HH:MM format
 * @param {string} timeB - Second time in HH:MM format
 * @returns {string} Sum of times in HH:MM format
 */
export const addTime = (timeA, timeB) => {
  const [hoursA, minutesA] = timeA.split(':').map(Number);
  const [hoursB, minutesB] = timeB.split(':').map(Number);
  
  let totalHours = hoursA + hoursB;
  let totalMinutes = minutesA + minutesB;
  
  if (totalMinutes >= 60) {
    totalMinutes -= 60;
    totalHours += 1;
  }
  
  return `${totalHours.toString().padStart(2, '0')}:${totalMinutes.toString().padStart(2, '0')}`;
};

/**
 * Divides a time duration in half
 * @param {string} duration - Duration in HH:MM format
 * @returns {string} Half duration in HH:MM format
 */
export const halfTime = (duration) => {
  const [hours, minutes] = duration.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes;
  const halfMinutes = Math.floor(totalMinutes / 2);
  
  return formatMinutes(halfMinutes);
};

/**
 * Checks if a number is between two values (inclusive)
 * @param {number} n - Number to check
 * @param {number} a - Lower bound
 * @param {number} b - Upper bound
 * @returns {boolean} True if n is between a and b
 */
export const isBetween = (n, a, b) => {
  return (n - a) * (n - b) <= 0;
};

/**
 * Splits an array into chunks of specified size
 * @param {Array} array - Array to split
 * @param {number} chunkSize - Size of each chunk
 * @returns {Array[]} Array of chunks
 */
export const chunkArray = (array, chunkSize) => {
  const result = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    result.push(array.slice(i, i + chunkSize));
  }
  return result;
};

/**
 * Storage utility functions
 */
export const storage = {
  /**
   * Gets a value from localStorage with a default fallback
   * @param {string} key - Storage key
   * @param {*} defaultValue - Default value if key doesn't exist
   * @returns {*} Stored value or default
   */
  get(key, defaultValue) {
    try {
      const item = localStorage.getItem(key);
      if (item === null) return defaultValue;
      
      // Try to parse as JSON, otherwise return as string
      try {
        return JSON.parse(item);
      } catch {
        return item;
      }
    } catch (error) {
      console.error(`Error getting ${key} from storage:`, error);
      return defaultValue;
    }
  },
  
  /**
   * Sets a value in localStorage
   * @param {string} key - Storage key
   * @param {*} value - Value to store
   */
  set(key, value) {
    try {
      const item = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, item);
    } catch (error) {
      console.error(`Error setting ${key} in storage:`, error);
    }
  },
  
  /**
   * Removes a value from localStorage
   * @param {string} key - Storage key
   */
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing ${key} from storage:`, error);
    }
  },
  
  /**
   * Clears all localStorage
   */
  clear() {
    try {
      localStorage.clear();
    } catch (error) {
      console.error('Error clearing storage:', error);
    }
  }
};

/**
 * Formats a date to DD-MM-YYYY format
 * @param {Date} date - Date to format
 * @returns {string} Formatted date
 */
export const formatDate = (date) => {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * @param {Function} func - Function to debounce
 * @param {number} wait - Milliseconds to wait
 * @returns {Function} Debounced function
 */
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Deep clones an object
 * @param {Object} obj - Object to clone
 * @returns {Object} Cloned object
 */
export const deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Validates if a time string is in HH:MM format
 * @param {string} time - Time string to validate
 * @returns {boolean} True if valid HH:MM format
 */
export const isValidTime = (time) => {
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
};

/**
 * Calculates the difference between two times in minutes
 * @param {string} startTime - Start time in HH:MM format
 * @param {string} endTime - End time in HH:MM format
 * @returns {number} Difference in minutes
 */
export const timeDifferenceInMinutes = (startTime, endTime) => {
  const [startHours, startMinutes] = startTime.split(':').map(Number);
  const [endHours, endMinutes] = endTime.split(':').map(Number);
  
  const startTotalMinutes = startHours * 60 + startMinutes;
  const endTotalMinutes = endHours * 60 + endMinutes;
  
  return endTotalMinutes - startTotalMinutes;
};
