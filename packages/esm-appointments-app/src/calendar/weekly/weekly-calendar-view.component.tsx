import dayjs from 'dayjs';
import React from 'react';
import { useAppointmentsStore } from '../../store';
import WeeklyHeader from './weekly-header.component';
import WeeklyWorkloadView from './weekly-workload-view.component';
import styles from './weekly.scss';

const getWeekDays = (date: string) => {
  const start = dayjs(date).startOf('week');
  return Array.from({ length: 7 }).map((_, i) => start.add(i, 'day'));
};

interface Props {
  events: any[];
}

const WeeklyCalendarView: React.FC<Props> = ({ events }) => {
  const { selectedDate } = useAppointmentsStore();

  const weekDays = getWeekDays(selectedDate);

  return (
    <div className={styles.weeklyContainer}>
      <WeeklyHeader />

      <div className={styles.weeklyCalendar}>
        {weekDays.map((dateTime) => (
          <WeeklyWorkloadView key={dateTime.toString()} dateTime={dateTime} events={events} />
        ))}
      </div>
    </div>
  );
};

export default WeeklyCalendarView;
