import { InlineLoading, InlineNotification } from '@carbon/react';
import { navigate } from '@openmrs/esm-framework';
import classNames from 'classnames';
import dayjs from 'dayjs';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { spaHomePage } from '../../constants';
import { useAppointmentsForDay } from '../../hooks/Useappointmentsbydaterange';
import { useAppointmentsStore } from '../../store';
import { type DailyAppointmentsCountByService } from '../../types';
import styles from './daily.scss';

const TOTAL_HOURS = 24;
const HOURS = Array.from({ length: TOTAL_HOURS }, (_, i) => i);
export const HOUR_HEIGHT_PX = 56; // slightly taller for the single-column view

const SERVICE_COLORS = [
  '#0F62FE',
  '#24A148',
  '#DA1E28',
  '#8A3FFC',
  '#FF832B',
  '#007D79',
  '#9F1853',
  '#198038',
  '#0043CE',
  '#F1C21B',
];

interface DailyCalendarViewProps {
  events: Array<DailyAppointmentsCountByService>;
}

const DailyCalendarView: React.FC<DailyCalendarViewProps> = () => {
  const { t } = useTranslation();
  const { selectedDate } = useAppointmentsStore();
  const date = dayjs(selectedDate);
  const now = dayjs();
  const isToday = date.isSame(now, 'day');

  const { appointments, isLoading } = useAppointmentsForDay(date);

  const serviceColorMap = useMemo(() => {
    const map = new Map<string, string>();
    appointments.forEach((appt) => {
      if (appt.service?.uuid && !map.has(appt.service.uuid)) {
        map.set(appt.service.uuid, SERVICE_COLORS[map.size % SERVICE_COLORS.length]);
      }
    });
    return map;
  }, [appointments]);

  const topPx = (dt: typeof now) => (dt.hour() + dt.minute() / 60) * HOUR_HEIGHT_PX;
  const heightPx = (start: typeof now, end: typeof now) =>
    Math.max((end.diff(start, 'minute') / 60) * HOUR_HEIGHT_PX, 24);

  const nowTop = (now.hour() + now.minute() / 60) * HOUR_HEIGHT_PX;

  const fmtHour = (h: number) => (h === 0 ? '' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`);

  if (isLoading) {
    return <InlineLoading className={styles.loading} description={t('loadingAppointments', 'Loading appointments…')} />;
  }

  return (
    <div className={styles.outer}>
      {/* ── Sticky day-header row ───────────────────────────────────────── */}
      <div className={styles.headerRow}>
        <div className={styles.tzLabel}>
          <span>GMT{now.format('Z').replace(':00', '')}</span>
        </div>
        <div className={classNames(styles.dayHeader, { [styles.todayDayHeader]: isToday })}>
          <span className={styles.dayName}>{date.format('ddd').toUpperCase()}</span>
          <span className={classNames(styles.dayNum, { [styles.todayDayNum]: isToday })}>{date.format('D')}</span>
          <span className={styles.totalBadge}>
            {appointments.length} {t('appts', 'appts')}
          </span>
        </div>
      </div>

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {appointments.length === 0 && (
        <InlineNotification
          kind="info"
          title={t('noAppointmentsToDisplay', 'No appointments to display')}
          subtitle={t('noAppointmentsForDate', 'There are no appointments scheduled for {{date}}.', {
            date: date.format('D MMMM YYYY'),
          })}
          hideCloseButton
          lowContrast
          className={styles.emptyNotification}
        />
      )}

      {/* ── Scrollable body ─────────────────────────────────────────────── */}
      <div className={styles.scrollBody}>
        <div className={styles.gridWrapper}>
          {/* Time labels column */}
          <div className={styles.timeColumn}>
            {HOURS.map((h) => (
              <div key={h} className={styles.timeSlot}>
                {h > 0 && <span className={styles.timeText}>{fmtHour(h)}</span>}
              </div>
            ))}
          </div>

          {/* Single day column */}
          <div className={classNames(styles.dayColumn, { [styles.todayColumn]: isToday })}>
            {/* Hour-line grid */}
            {HOURS.map((h) => (
              <div key={h} className={styles.hourLine}>
                <div className={styles.halfLine} />
              </div>
            ))}

            {/* Current-time indicator */}
            {isToday && (
              <div className={styles.nowIndicator} style={{ top: nowTop }}>
                <div className={styles.nowDot} />
                <div className={styles.nowLine} />
              </div>
            )}

            {/* Appointments — absolutely positioned */}
            {appointments.map((appt, idx) => {
              const start = dayjs(appt.startDateTime);
              const end = appt.endDateTime ? dayjs(appt.endDateTime) : start.add(30, 'minute');
              const color = serviceColorMap.get(appt.service?.uuid) ?? SERVICE_COLORS[0];
              const top = topPx(start);
              const height = heightPx(start, end);
              const duration = end.diff(start, 'minute');

              return (
                <button
                  key={appt.uuid ?? idx}
                  className={styles.apptBlock}
                  style={{
                    top,
                    height,
                    borderLeftColor: color,
                    background: `${color}1e`,
                    color,
                  }}
                  onClick={() =>
                    navigate({
                      to: `${spaHomePage}/appointments/${start.format('YYYY-MM-DD')}/${appt.service?.uuid ?? ''}`,
                    })
                  }>
                  <div className={styles.apptHeader}>
                    <span className={styles.apptTime}>
                      {start.format('h:mm')} – {end.format('h:mm a')}
                    </span>
                    <span className={styles.apptDuration}>{duration} min</span>
                  </div>
                  <span className={styles.apptPatient}>{appt.patient?.name}</span>
                  {height >= 52 && <span className={styles.apptService}>{appt.service?.name}</span>}
                  {height >= 72 && appt.providers?.length > 0 && (
                    <span className={styles.apptProvider}>{appt.providers[0]?.display}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DailyCalendarView;
