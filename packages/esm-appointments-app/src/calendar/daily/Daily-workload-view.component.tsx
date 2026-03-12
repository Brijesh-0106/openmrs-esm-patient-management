import { User } from '@carbon/react/icons';
import { showModal } from '@openmrs/esm-framework';
import classNames from 'classnames';
import { type Dayjs } from 'dayjs';
import React from 'react';
import { useTranslation } from 'react-i18next';
import styles from './daily.scss';

interface DailyWorkloadViewProps {
  serviceName: string;
  serviceUuid: string;
  count: number;
  date: Dayjs;
}

const DailyWorkloadView: React.FC<DailyWorkloadViewProps> = ({ serviceName, serviceUuid, count, date }) => {
  const { t } = useTranslation();

  const handleClick = () => {
    const dispose = showModal('calendar-day-view-modal', {
      dateTime: date.startOf('day'),
      serviceUuid: serviceUuid || undefined,
      closeModal: () => dispose(),
    });
  };

  const loadClass = count >= 20 ? styles.loadHigh : count >= 10 ? styles.loadMedium : styles.loadLow;

  return (
    <div
      role="button"
      tabIndex={0}
      className={classNames(styles.serviceRow, loadClass)}
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}>
      <div className={styles.colorStripe} />
      <div className={styles.serviceInfo}>
        <span className={styles.serviceName}>{serviceName}</span>
      </div>
      <div className={styles.countBlock}>
        <User size={16} />
        <span className={styles.count}>{count}</span>
        <span className={styles.countLabel}>{t('appointments_lower', 'appointments')}</span>
      </div>
    </div>
  );
};

export default DailyWorkloadView;
