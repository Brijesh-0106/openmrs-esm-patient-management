import dayjs from 'dayjs';
import React from 'react';
import { type DailyAppointmentsCountByService } from '../../types';
import styles from './weekly.scss';

interface Props {
  dateTime: dayjs.Dayjs;
  events: Array<DailyAppointmentsCountByService>;
}

const WeeklyWorkloadView: React.FC<Props> = ({ dateTime, events = [] }) => {
  const dayEvents = events.find(
    (event) => dayjs(event.appointmentDate).format('YYYY-MM-DD') === dateTime.format('YYYY-MM-DD'),
  );

  return (
    <div className={styles.weekDayColumn}>
      <div className={styles.dayHeader}>{dateTime.format('ddd DD')}</div>

      {dayEvents?.services?.map((service, i) => (
        <div key={i} className={styles.appointmentCard}>
          {service.serviceName} ({service.count})
        </div>
      ))}
    </div>
  );
};

export default WeeklyWorkloadView;
