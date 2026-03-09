import classNames from 'classnames';
import dayjs, { type Dayjs } from 'dayjs';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { omrsDateFormat } from '../../constants';
import { setCalendarView, setSelectedDate } from '../../store';
import styles from './weekly.scss';

interface WeeklyHeaderProps {
  weekDays: Array<Dayjs>;
}

const WeeklyHeader: React.FC<WeeklyHeaderProps> = ({ weekDays }) => {
  const { t } = useTranslation();
  const today = dayjs();

  const handleDayClick = useCallback((day: Dayjs) => {
    setSelectedDate(day.startOf('day').format(omrsDateFormat));
    setCalendarView('daily');
  }, []);

  return (
    <div className={styles.headerRow}>
      {weekDays.map((day) => {
        const isToday = day.isSame(today, 'day');
        return (
          <button
            key={day.format('YYYY-MM-DD')}
            className={classNames(styles.dayHeader, { [styles.todayHeader]: isToday })}
            onClick={() => handleDayClick(day)}
            aria-label={`${t('viewDay', 'View day')} ${day.format('D MMM YYYY')}`}>
            <span className={styles.dayName}>{day.format('ddd').toUpperCase()}</span>
            <span className={classNames(styles.dayNum, { [styles.todayNum]: isToday })}>{day.format('D')}</span>
            <span className={styles.monthName}>{day.format('MMM')}</span>
          </button>
        );
      })}
    </div>
  );
};

export default WeeklyHeader;
