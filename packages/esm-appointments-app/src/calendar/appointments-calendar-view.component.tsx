import { InlineLoading } from '@carbon/react';
import dayjs from 'dayjs';
import React, { Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { omrsDateFormat } from '../constants';
import AppointmentsHeader from '../header/appointments-header.component';
import { useAppointmentsCalendar } from '../hooks/useAppointmentsCalendar';
import { setSelectedDate, useAppointmentsStore } from '../store';
import CalendarHeader from './header/calendar-header.component';
import MonthlyCalendarView from './monthly/monthly-calendar-view.component';

// Lazy-load so a missing file only breaks that view, not the entire module
// (which would remove the Appointments nav link from the sidebar).
const WeeklyCalendarView = React.lazy(() => import('./weekly/weekly-calendar-view.component'));
const DailyCalendarView = React.lazy(() => import('./daily/Daily-calendar-view.component'));

const AppointmentsCalendarView: React.FC = () => {
  const { t } = useTranslation();
  const { selectedDate, calendarView } = useAppointmentsStore();
  const view = calendarView ?? 'monthly';

  const { calendarEvents } = useAppointmentsCalendar(dayjs(selectedDate).toISOString(), view);

  const params = useParams();

  useEffect(() => {
    if (params.date) {
      setSelectedDate(dayjs(params.date).startOf('day').format(omrsDateFormat));
    }
  }, [params.date]);

  return (
    <div data-testid="appointments-calendar">
      <AppointmentsHeader title={t('calendar', 'Calendar')} />
      <CalendarHeader />

      {view === 'monthly' && <MonthlyCalendarView events={calendarEvents} />}

      {view === 'weekly' && (
        <Suspense fallback={<InlineLoading description={t('loading', 'Loading…')} />}>
          <WeeklyCalendarView events={calendarEvents} />
        </Suspense>
      )}

      {view === 'daily' && (
        <Suspense fallback={<InlineLoading description={t('loading', 'Loading…')} />}>
          <DailyCalendarView events={calendarEvents} />
        </Suspense>
      )}
    </div>
  );
};

export default AppointmentsCalendarView;
