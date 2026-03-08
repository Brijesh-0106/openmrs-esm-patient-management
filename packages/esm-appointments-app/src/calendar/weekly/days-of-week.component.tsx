import dayjs from 'dayjs';
import React from 'react';
import { useAppointmentsStore } from '../../store';
import styles from './weekly.scss';

interface Props {
  dayOfWeek: string;
}

const DaysOfWeekCard: React.FC<Props> = ({ dayOfWeek }) => {
  const { selectedDate } = useAppointmentsStore();

  const today = dayjs().format('ddd').toUpperCase();
  const isToday = today.startsWith(dayOfWeek.slice(0, 3));

  return <div className={styles.dayCard}>{dayOfWeek}</div>;
};

export default DaysOfWeekCard;
