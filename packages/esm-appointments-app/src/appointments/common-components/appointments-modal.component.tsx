import React from 'react';
import { Modal } from '@carbon/react';
import dayjs from 'dayjs';

interface Props {
  open: boolean;
  date: string;
  appointments: any[];
  onClose: () => void;
}

const AppointmentsModal: React.FC<Props> = ({ open, date, appointments, onClose }) => {
  return (
    <Modal
      open={open}
      modalHeading={`Appointments for ${dayjs(date).format('DD MMM YYYY')}`}
      primaryButtonText="Close"
      onRequestClose={onClose}
      onRequestSubmit={onClose}
      passiveModal
    >
      {appointments.length === 0 && (
        <p>No appointments found.</p>
      )}

      {appointments.map((appt) => (
        <div key={appt.uuid} style={{ marginBottom: '8px' }}>
          <strong>{dayjs(appt.startDateTime).format('HH:mm')}</strong>
          {' - '}
          {appt.patient?.display}
        </div>
      ))}
    </Modal>
  );
};

export default AppointmentsModal;