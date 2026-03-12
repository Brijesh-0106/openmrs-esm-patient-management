import { InlineLoading } from '@carbon/react';
import { showModal } from '@openmrs/esm-framework';
import classNames from 'classnames';
import dayjs, { type Dayjs } from 'dayjs';
import React, { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppointmentsByDateRange } from '../../hooks/Useappointmentsbydaterange';
import { useAppointmentsStore } from '../../store';
import { type DailyAppointmentsCountByService } from '../../types';
import styles from './weekly.scss';

// 0–23 full day, same as Google Calendar
const TOTAL_HOURS = 24;
const HOURS = Array.from({ length: TOTAL_HOURS }, (_, i) => i);
export const HOUR_HEIGHT_PX = 48; // height of one hour row in px — must match scss

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

interface WeeklyCalendarViewProps {
  events: Array<DailyAppointmentsCountByService>;
}

const WeeklyCalendarView: React.FC<WeeklyCalendarViewProps> = () => {
  const { t } = useTranslation();
  const { selectedDate } = useAppointmentsStore();
  const today = dayjs();
  const now = dayjs();
  const scrollRef = useRef<HTMLDivElement>(null);

  const weekStart = dayjs(selectedDate).startOf('week');
  const weekEnd = weekStart.endOf('week');
  const weekDays: Dayjs[] = Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day'));

  const { appointments, isLoading } = useAppointmentsByDateRange(weekStart, weekEnd);

  // consistent colour per service uuid
  const serviceColorMap = useMemo(() => {
    const map = new Map<string, string>();
    appointments.forEach((appt) => {
      if (appt.service?.uuid && !map.has(appt.service.uuid)) {
        map.set(appt.service.uuid, SERVICE_COLORS[map.size % SERVICE_COLORS.length]);
      }
    });
    return map;
  }, [appointments]);

  // group by day string
  const apptsByDay = useMemo(() => {
    const map = new Map<string, typeof appointments>();
    appointments.forEach((appt) => {
      const key = dayjs(appt.startDateTime).format('YYYY-MM-DD');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(appt);
    });
    return map;
  }, [appointments]);

  // Opens the day-view modal for a given day, optionally pre-filtering by service
  const openDayModal = (day: Dayjs, serviceUuid?: string) => {
    const dispose = showModal('calendar-day-view-modal', {
      dateTime: day.startOf('day'),
      serviceUuid: serviceUuid || undefined,
      closeModal: () => dispose(),
    });
  };

  const handleApptClick = (e: React.MouseEvent, appt: (typeof appointments)[0]) => {
    e.stopPropagation();
    openDayModal(dayjs(appt.startDateTime), appt.service?.uuid);
  };

  // position in px from midnight
  const topPx = (dt: Dayjs) => (dt.hour() + dt.minute() / 60) * HOUR_HEIGHT_PX;
  const heightPx = (start: Dayjs, end: Dayjs) => Math.max((end.diff(start, 'minute') / 60) * HOUR_HEIGHT_PX, 20);

  // current-time top from midnight
  const nowTop = (now.hour() + now.minute() / 60) * HOUR_HEIGHT_PX;

  const fmtHour = (h: number) => (h === 0 ? '' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`);

  if (isLoading) {
    return <InlineLoading className={styles.loading} description={t('loadingAppointments', 'Loading appointments…')} />;
  }

  return (
    <div className={styles.outer}>
      {/* ── Sticky day-header row ────────────────────────────────────────── */}
      <div className={styles.headerRow}>
        {/* timezone gutter */}
        <div className={styles.tzLabel}>
          <span>GMT{now.format('Z').replace(':00', '').replace(':30', ':30')}</span>
        </div>
        {weekDays.map((day) => {
          const isToday = day.isSame(today, 'day');
          return (
            <button
              key={day.format('YYYY-MM-DD')}
              className={classNames(styles.dayHeader, { [styles.todayDayHeader]: isToday })}
              onClick={() => openDayModal(day)}>
              <span className={styles.dayName}>{day.format('ddd').toUpperCase()}</span>
              <span className={classNames(styles.dayNum, { [styles.todayDayNum]: isToday })}>{day.format('D')}</span>
            </button>
          );
        })}
      </div>

      {/* ── Scrollable body ──────────────────────────────────────────────── */}
      <div className={styles.scrollBody} ref={scrollRef}>
        {/* Left gutter (hours) + 7 day columns side by side */}
        <div className={styles.gridWrapper}>
          {/* Hour lines + time labels */}
          <div className={styles.timeColumn}>
            {HOURS.map((h) => (
              <div key={h} className={styles.timeSlot}>
                {h > 0 && <span className={styles.timeText}>{fmtHour(h)}</span>}
              </div>
            ))}
          </div>

          {/* 7 day columns */}
          {weekDays.map((day) => {
            const dayKey = day.format('YYYY-MM-DD');
            const isToday = day.isSame(today, 'day');
            const dayAppts = apptsByDay.get(dayKey) ?? [];

            return (
              <div
                key={dayKey}
                className={classNames(styles.dayColumn, { [styles.todayColumn]: isToday })}
                onClick={() => openDayModal(day)}>
                {/* Hour-line grid (background) */}
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
                {dayAppts.map((appt, idx) => {
                  const start = dayjs(appt.startDateTime);
                  const end = appt.endDateTime ? dayjs(appt.endDateTime) : start.add(30, 'minute');
                  const color = serviceColorMap.get(appt.service?.uuid) ?? SERVICE_COLORS[0];
                  const top = topPx(start);
                  const height = heightPx(start, end);

                  return (
                    <button
                      key={appt.uuid ?? idx}
                      className={styles.apptBlock}
                      style={{
                        top,
                        height,
                        borderLeftColor: color,
                        background: `${color}22`,
                        color,
                      }}
                      onClick={(e) => handleApptClick(e, appt)}
                      title={`${appt.patient?.name} · ${appt.service?.name}`}>
                      <span className={styles.apptTime}>{start.format('h:mm')}</span>
                      <span className={styles.apptTitle}>{appt.patient?.name}</span>
                      {height >= 36 && <span className={styles.apptSub}>{appt.service?.name}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default WeeklyCalendarView;
