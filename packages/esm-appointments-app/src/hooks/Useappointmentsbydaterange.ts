import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';
import { type Dayjs } from 'dayjs';
import useSWR from 'swr';
import { omrsDateFormat } from '../constants';
import { type Appointment } from '../types';

/**
 * Fetches individual Appointment objects (with startDateTime, patient, service, status)
 * for a given date range. Used by the weekly and daily hour-grid calendar views.
 */
export const useAppointmentsByDateRange = (startDate: Dayjs, endDate: Dayjs) => {
    // The API supports forDate for a single day, so for a week we fetch each day.
    // However appointment/all?startDate&endDate also works in newer builds.
    // We use startDate as forDate and handle multi-day in the weekly view by fetching per-day.
    const startStr = startDate.format(omrsDateFormat);
    const endStr = endDate.format(omrsDateFormat);
    const url = `${restBaseUrl}/appointment/all?startDate=${startStr}&toDate=${endStr}`;

    const { data, error, isLoading, mutate } = useSWR<{ data: Array<Appointment> }, Error>(
        url,
        openmrsFetch,
        { errorRetryCount: 2 },
    );

    return {
        appointments: data?.data ?? [],
        isLoading,
        error,
        mutate,
    };
};

/**
 * Fetches appointments for a single day using the forDate endpoint
 * (guaranteed to work on all OpenMRS builds).
 */
export const useAppointmentsForDay = (date: Dayjs) => {
    const forDate = date.startOf('day').format(omrsDateFormat);
    const url = `${restBaseUrl}/appointment/all?forDate=${forDate}`;

    const { data, error, isLoading, mutate } = useSWR<{ data: Array<Appointment> }, Error>(
        url,
        openmrsFetch,
        { errorRetryCount: 2 },
    );

    return {
        appointments: data?.data ?? [],
        isLoading,
        error,
        mutate,
    };
};