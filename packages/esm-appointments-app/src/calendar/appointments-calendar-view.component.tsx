import dayjs from 'dayjs';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { omrsDateFormat } from '../constants';
import AppointmentsHeader from '../header/appointments-header.component';
import { useAppointmentsCalendar } from '../hooks/useAppointmentsCalendar';
import { setSelectedDate, useAppointmentsStore } from '../store';
import CalendarHeader from './header/calendar-header.component';
import MonthlyCalendarView from './monthly/monthly-calendar-view.component';
import WeeklyCalendarView from './weekly/weekly-calendar-view.component';

const AppointmentsCalendarView: React.FC = () => {
  const { t } = useTranslation();
  const { selectedDate } = useAppointmentsStore();
  const { calendarEvents } = useAppointmentsCalendar(dayjs(selectedDate).toISOString(), 'monthly');

  let params = useParams();

  useEffect(() => {
    if (params.date) {
      setSelectedDate(dayjs(params.date).startOf('day').format(omrsDateFormat));
    }
  }, [params.date]);

  return (
    <div data-testid="appointments-calendar">
      apt-cal---------------------
      <AppointmentsHeader title={t('calendar', 'Calendar')} />
      <CalendarHeader />
      <WeeklyCalendarView events={calendarEvents} />
      <MonthlyCalendarView events={calendarEvents} />
    </div>
  );
};

export default AppointmentsCalendarView;
