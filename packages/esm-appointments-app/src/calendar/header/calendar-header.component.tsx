import { Button, ContentSwitcher, Switch } from '@carbon/react';
import { ArrowLeft, ChevronLeft, ChevronRight } from '@carbon/react/icons';
import { navigate } from '@openmrs/esm-framework';
import dayjs from 'dayjs';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { omrsDateFormat, spaHomePage } from '../../constants';
import { setCalendarView, setSelectedDate, useAppointmentsStore, type CalendarViewType } from '../../store';
import styles from './calendar-header.scss';

const CalendarHeader: React.FC = () => {
  const { t } = useTranslation();
  const { selectedDate, calendarView } = useAppointmentsStore();
  const view: CalendarViewType = calendarView ?? 'monthly';
  const date = dayjs(selectedDate);

  /* ── Navigation ─────────────────────────────────────────────────────── */
  const handlePrev = useCallback(() => {
    if (view === 'monthly') {
      setSelectedDate(date.subtract(1, 'month').startOf('month').format(omrsDateFormat));
    } else if (view === 'weekly') {
      setSelectedDate(date.subtract(1, 'week').format(omrsDateFormat));
    } else {
      setSelectedDate(date.subtract(1, 'day').format(omrsDateFormat));
    }
  }, [date, view]);

  const handleNext = useCallback(() => {
    if (view === 'monthly') {
      setSelectedDate(date.add(1, 'month').startOf('month').format(omrsDateFormat));
    } else if (view === 'weekly') {
      setSelectedDate(date.add(1, 'week').format(omrsDateFormat));
    } else {
      setSelectedDate(date.add(1, 'day').format(omrsDateFormat));
    }
  }, [date, view]);

  const handleToday = useCallback(() => {
    setSelectedDate(dayjs().startOf('day').format(omrsDateFormat));
  }, []);

  const handleBack = () => {
    navigate({ to: `${spaHomePage}/appointments/${date.format('YYYY-MM-DD')}` });
  };

  /* ── View switcher ──────────────────────────────────────────────────── */
  const handleViewChange = useCallback(({ name }: { name: string | number }) => {
    setCalendarView(name as CalendarViewType);
  }, []);

  const viewIndex = view === 'monthly' ? 0 : view === 'weekly' ? 1 : 2;

  /* ── Period label ───────────────────────────────────────────────────── */
  const periodLabel = (() => {
    if (view === 'monthly') return date.format('MMMM YYYY');
    if (view === 'weekly') {
      const ws = date.startOf('week');
      const we = date.endOf('week');
      return ws.month() === we.month()
        ? `${ws.date()}–${we.date()} ${ws.format('MMMM YYYY')}`
        : `${ws.format('D MMM')} – ${we.format('D MMM YYYY')}`;
    }
    return date.format('dddd, D MMMM YYYY');
  })();

  return (
    <div className={styles.calendarHeaderContainer}>
      {/* ── Row 1: Back + view switcher ─────────────────────────────── */}
      <div className={styles.topRow}>
        <Button
          className={styles.backButton}
          iconDescription={t('back', 'Back')}
          kind="ghost"
          onClick={handleBack}
          renderIcon={ArrowLeft}
          size="md">
          {t('back', 'Back')}
        </Button>

        <div className={styles.switcherWrapper}>
          <ContentSwitcher onChange={handleViewChange} selectedIndex={viewIndex} size="sm">
            <Switch name="monthly" text={t('month', 'Month')} />
            <Switch name="weekly" text={t('week', 'Week')} />
            <Switch name="daily" text={t('day', 'Day')} />
          </ContentSwitcher>
        </div>
      </div>

      {/* ── Row 2: Prev / Today / Next + period label + breadcrumb ──── */}
      <div className={styles.navRow}>
        <div className={styles.navControls}>
          <Button
            hasIconOnly
            iconDescription={t('previousPeriod', 'Previous')}
            kind="ghost"
            onClick={handlePrev}
            renderIcon={ChevronLeft}
            size="sm"
          />
          <Button kind="tertiary" onClick={handleToday} size="sm" className={styles.todayBtn}>
            {t('today', 'Today')}
          </Button>
          <Button
            hasIconOnly
            iconDescription={t('nextPeriod', 'Next')}
            kind="ghost"
            onClick={handleNext}
            renderIcon={ChevronRight}
            size="sm"
          />
        </div>

        <span className={styles.periodLabel}>{periodLabel}</span>

        {view !== 'monthly' && (
          <nav className={styles.breadcrumb} aria-label="breadcrumb">
            <button
              className={styles.breadcrumbLink}
              onClick={() => {
                setCalendarView('monthly');
                setSelectedDate(date.startOf('month').format(omrsDateFormat));
              }}>
              {date.format('MMMM YYYY')}
            </button>
            {view === 'daily' && (
              <>
                <span className={styles.breadcrumbSep}>/</span>
                <button className={styles.breadcrumbLink} onClick={() => setCalendarView('weekly')}>
                  {t('weekOf', 'Week of')} {date.startOf('week').format('D MMM')}
                </button>
                <span className={styles.breadcrumbSep}>/</span>
                <span className={styles.breadcrumbCurrent}>{date.format('ddd D MMM')}</span>
              </>
            )}
            {view === 'weekly' && (
              <>
                <span className={styles.breadcrumbSep}>/</span>
                <span className={styles.breadcrumbCurrent}>
                  {t('weekOf', 'Week of')} {date.startOf('week').format('D MMM')}
                </span>
              </>
            )}
          </nav>
        )}
      </div>
    </div>
  );
};

export default CalendarHeader;
