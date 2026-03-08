import { Button } from '@carbon/react';
import { formatDate } from '@openmrs/esm-framework';
import dayjs from 'dayjs';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { omrsDateFormat } from '../../constants';
import { setSelectedDate, useAppointmentsStore } from '../../store';
import DaysOfWeekCard from '../monthly/days-of-week.component';
import styles from './weekly.scss';

const DAYS_IN_WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THUR', 'FRI', 'SAT'];

const WeeklyHeader: React.FC = () => {
  const { t } = useTranslation();
  const { selectedDate } = useAppointmentsStore();

  const handlePrevWeek = useCallback(() => {
    setSelectedDate(dayjs(selectedDate).subtract(1, 'week').format(omrsDateFormat));
  }, [selectedDate]);

  const handleNextWeek = useCallback(() => {
    setSelectedDate(dayjs(selectedDate).add(1, 'week').format(omrsDateFormat));
  }, [selectedDate]);

  const start = dayjs(selectedDate).startOf('week');
  const end = dayjs(selectedDate).endOf('week');

  return (
    <>
      <div className={styles.weeklyHeader}>
        <Button size="sm" kind="tertiary" onClick={handlePrevWeek}>
          {t('prev', 'Prev')}
        </Button>

        <span>
          {formatDate(start.toDate(), { day: true, time: false })} -{' '}
          {formatDate(end.toDate(), { day: true, time: false })}
        </span>

        <Button size="sm" kind="tertiary" onClick={handleNextWeek}>
          {t('next', 'Next')}
        </Button>
      </div>

      <div className={styles.weekDaysRow}>
        {DAYS_IN_WEEK.map((day) => (
          <DaysOfWeekCard key={day} dayOfWeek={day} />
        ))}
      </div>
    </>
  );
};

export default WeeklyHeader;
