/**
 * ChangeDetector class for comparing extracted values with stored values
 * and creating change records with metadata
 */
class ChangeDetector {
  /**
   * Detects if a change occurred between current and stored values
   * @param {string} currentValue - The newly extracted value
   * @param {string} storedValue - The previously stored value
   * @returns {boolean} True if values are different, false otherwise
   */
  detectChange(currentValue, storedValue) {
    // Handle null/undefined values
    if (currentValue == null && storedValue == null) {
      return false;
    }

    if (currentValue == null || storedValue == null) {
      return true;
    }

    // Compare trimmed string values to handle whitespace differences
    const trimmedCurrent = String(currentValue).trim();
    const trimmedStored = String(storedValue).trim();

    return trimmedCurrent !== trimmedStored;
  }

  /**
   * Creates a change record with metadata for detected changes
   * @param {Object} entry - The configuration entry being monitored
   * @param {string} oldValue - The previous stored value
   * @param {string} newValue - The newly extracted value
   * @returns {Object} Change record with metadata
   */
  createChangeRecord(entry, oldValue, newValue) {
    const timestamp = new Date();

    return {
      url: entry.url,
      css_selector: entry.css_selector,
      oldValue: oldValue,
      newValue: newValue,
      timestamp: timestamp.toISOString(),
      detected_at: timestamp,
      entry: entry,
      hasChanged: true,
    };
  }

  /**
   * Processes a monitoring entry and returns change detection result
   * @param {Object} entry - Configuration entry with url, css_selector, current_value
   * @param {string} extractedValue - The value extracted from the page
   * @returns {Object} Change detection result
   */
  processEntry(entry, extractedValue) {
    const hasChanged = this.detectChange(extractedValue, entry.current_value);

    if (!hasChanged) {
      return {
        entry: entry,
        hasChanged: false,
        oldValue: entry.current_value,
        newValue: extractedValue,
        timestamp: new Date().toISOString(),
      };
    }

    return this.createChangeRecord(entry, entry.current_value, extractedValue);
  }
}

module.exports = ChangeDetector;
