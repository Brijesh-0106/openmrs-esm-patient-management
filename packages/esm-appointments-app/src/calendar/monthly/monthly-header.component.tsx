import React from 'react';
import DaysOfWeekCard from './days-of-week.component';
import styles from './monthly-header.scss';

const DAYS_IN_WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THUR', 'FRI', 'SAT'];

/**
 * Renders only the days-of-week header row (SUN … SAT).
 * Navigation (Prev / Today / Next) is handled by CalendarHeader.
 */
const MonthlyHeader: React.FC = () => {
  return (
    <div className={styles.workLoadCard}>
      {DAYS_IN_WEEK.map((day) => (
        <DaysOfWeekCard key={day} dayOfWeek={day} />
      ))}
    </div>
  );
};

export default MonthlyHeader;
