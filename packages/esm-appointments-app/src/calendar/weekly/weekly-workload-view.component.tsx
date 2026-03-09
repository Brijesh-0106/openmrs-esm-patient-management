import { User } from '@carbon/react/icons';
import classNames from 'classnames';
import dayjs, { type Dayjs } from 'dayjs';
import React, { useMemo } from 'react';
import { omrsDateFormat } from '../../constants';
import { setCalendarView, setSelectedDate } from '../../store';
import { type DailyAppointmentsCountByService } from '../../types';
import styles from './weekly.scss';

interface WeeklyWorkloadViewProps {
  events: Array<DailyAppointmentsCountByService>;
  dateTime: Dayjs;
}

const WeeklyWorkloadView: React.FC<WeeklyWorkloadViewProps> = ({ dateTime, events }) => {
  const today = dayjs();
  const isToday = dateTime.isSame(today, 'day');

  const currentData = useMemo(
    () => events?.find((event) => dayjs(event.appointmentDate).format('YYYY-MM-DD') === dateTime.format('YYYY-MM-DD')),
    [dateTime, events],
  );

  const totalCount = useMemo(
    () => currentData?.services?.reduce((sum, { count = 0 }) => sum + count, 0) ?? 0,
    [currentData],
  );

  const drillToDay = () => {
    setSelectedDate(dateTime.startOf('day').format(omrsDateFormat));
    setCalendarView('daily');
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={drillToDay}
      onKeyDown={(e) => e.key === 'Enter' && drillToDay()}
      className={classNames(styles.weeklyCell, { [styles.todayCell]: isToday })}>
      {/* Total count */}
      {totalCount > 0 && (
        <div className={styles.totals}>
          <User size={14} />
          <span>{totalCount}</span>
        </div>
      )}

      {/* Per-service rows */}
      {currentData?.services?.map(({ serviceName, serviceUuid, count }, i) => (
        <div key={`${serviceUuid}-${i}`} className={styles.serviceRow}>
          <span className={styles.serviceName}>{serviceName}</span>
          <span className={styles.serviceCount}>{count}</span>
        </div>
      ))}
    </div>
  );
};

export default WeeklyWorkloadView;
