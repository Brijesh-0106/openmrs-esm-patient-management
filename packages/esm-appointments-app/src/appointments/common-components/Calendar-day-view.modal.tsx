import {
  Button,
  ContentSwitcher,
  Form,
  FormGroup,
  InlineLoading,
  Layer,
  ModalBody,
  MultiSelect,
  NumberInput,
  RadioButton,
  RadioButtonGroup,
  Search,
  Select,
  SelectItem,
  Stack,
  Switch,
  Tag,
  TextArea,
  Tile,
  TimePicker,
  TimePickerSelect,
  Toggle,
} from '@carbon/react';
import { ArrowLeft, Close, Hospital, User } from '@carbon/react/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ExtensionSlot,
  OpenmrsDatePicker,
  OpenmrsDateRangePicker,
  ResponsiveWrapper,
  formatDate,
  isDesktop,
  openmrsFetch,
  parseDate,
  restBaseUrl,
  showSnackbar,
  translateFrom,
  useConfig,
  useLayoutType,
  useLocations,
  usePatient,
  useSession,
  type FetchResponse,
} from '@openmrs/esm-framework';
import dayjs, { type Dayjs } from 'dayjs';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useController, useForm, type Control, type FieldErrors } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import AppointmentsTable from '../../appointments/common-components/appointments-table.component';
import { type ConfigObject } from '../../config-schema';
import { appointmentLocationTagName, dateFormat, moduleName, weekDays } from '../../constants';
import {
  checkAppointmentConflict,
  saveAppointment,
  saveRecurringAppointments,
  useAppointmentService,
  useMutateAppointments,
} from '../../form/appointments-form.resource';
import { useAppointmentList } from '../../hooks/useAppointmentList';
import { useAppointmentServices } from '../../hooks/useAppointmentService';
import { useAllAppointmentsByDate, useClinicalMetrics } from '../../hooks/useClinicalMetrics';
import { useProviders } from '../../hooks/useProviders';
import type { AppointmentPayload, RecurringPattern } from '../../types';
import Workload from '../../workload/workload.component';
import styles from './calendar-day-view.modal.scss';

// ─── View state type ──────────────────────────────────────────────────────────
type ModalView = 'dayView' | 'patientSearch' | 'appointmentForm';

interface PatientResult {
  uuid: string;
  display: string;
  person: { age: number; gender: string; birthdate: string };
  identifiers: Array<{ display: string }>;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface CalendarDayViewModalProps {
  dateTime: Dayjs;
  serviceUuid?: string;
  closeModal: () => void;
}

// ─── Metrics card (day view) ──────────────────────────────────────────────────
const MetricCard: React.FC<{
  headerLabel: string;
  label: string;
  value: number | string;
  count?: { pendingAppointments: Array<any>; arrivedAppointments: Array<any> };
  isLoading?: boolean;
}> = ({ headerLabel, label, value, count, isLoading }) => {
  const { t } = useTranslation();
  return (
    <article className={styles.metricCard}>
      <div className={styles.metricHeader}>
        <span className={styles.metricHeaderLabel}>{headerLabel}</span>
      </div>
      <div className={styles.metricGrid}>
        <div>
          <span className={styles.metricLabel}>{label}</span>
          {isLoading ? <InlineLoading /> : <p className={styles.metricValue}>{value}</p>}
        </div>
        {count && (
          <div className={styles.countGrid}>
            <span>{t('checkedIn', 'Checked in')}</span>
            <span>{t('notArrived', 'Not arrived')}</span>
            <p style={{ color: '#22651B' }}>{count.arrivedAppointments?.length ?? 0}</p>
            <p style={{ color: '#da1e28' }}>{count.pendingAppointments?.length ?? 0}</p>
          </div>
        )}
      </div>
    </article>
  );
};

// ─── Time & Duration (form sub-component) ─────────────────────────────────────
const time12HourFormatRegexPattern = '^(1[0-2]|0?[1-9]):[0-5][0-9]$';
const time12HourFormatRegex = /^(1[0-2]|0?[1-9]):[0-5][0-9]$/;
const isValidTime = (s: string) => time12HourFormatRegex.test(s);

function TimeAndDuration({
  t,
  control,
  errors,
}: {
  t: ReturnType<typeof useTranslation>['t'];
  control: Control<Record<string, any>>;
  errors: FieldErrors<Record<string, any>>;
}) {
  return (
    <>
      <ResponsiveWrapper>
        <Controller
          name="startTime"
          control={control}
          render={({ field: { onChange, value } }) => (
            <TimePicker
              id="time-picker"
              pattern={time12HourFormatRegexPattern}
              invalid={!!errors?.startTime}
              invalidText={errors?.startTime?.message ? String(errors.startTime.message) : undefined}
              labelText={t('time', 'Time')}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
              style={{ marginLeft: '0.125rem', flex: 'none' }}
              value={value}>
              <Controller
                name="timeFormat"
                control={control}
                render={({ field: { value, onChange } }) => (
                  <TimePickerSelect
                    id="time-picker-select-1"
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value as 'AM' | 'PM')}
                    value={value}
                    aria-label={t('time', 'Time')}>
                    <SelectItem value="AM" text="AM" />
                    <SelectItem value="PM" text="PM" />
                  </TimePickerSelect>
                )}
              />
            </TimePicker>
          )}
        />
      </ResponsiveWrapper>
      <ResponsiveWrapper>
        <Controller
          name="duration"
          control={control}
          render={({ field: { onChange, onBlur, value, ref } }) => (
            <NumberInput
              allowEmpty
              disableWheel
              hideSteppers
              id="duration"
              invalid={!!errors?.duration}
              invalidText={errors?.duration?.message ? String(errors.duration.message) : undefined}
              label={t('durationInMinutes', 'Duration (minutes)')}
              onBlur={onBlur}
              onChange={(event, state) => {
                const val = state?.value ?? (event.target as HTMLInputElement).value;
                onChange(val === '' ? null : Number(val));
              }}
              ref={ref}
              value={value ?? ''}
            />
          )}
        />
      </ResponsiveWrapper>
    </>
  );
}

// ─── Appointment Form (view 3) ────────────────────────────────────────────────
function AppointmentFormView({
  patientUuid,
  closeModal,
  onBack,
  initialDate,
}: {
  patientUuid: string;
  closeModal: () => void;
  onBack: () => void;
  initialDate: string;
}) {
  const { t } = useTranslation();
  const { patient } = usePatient(patientUuid);
  const { mutateAppointments } = useMutateAppointments();
  const locations = useLocations(appointmentLocationTagName);
  const providers = useProviders();
  const session = useSession();
  const { data: services, isLoading } = useAppointmentService();
  const { appointmentStatuses, appointmentTypes, allowAllDayAppointments } = useConfig<ConfigObject>();
  const [isRecurringAppointment, setIsRecurringAppointment] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const defaultStartDate = new Date(initialDate);
  const defaultStartDateText = dayjs(defaultStartDate).format(dateFormat);
  const defaultAppointmentStartTime = dayjs(new Date()).format('hh:mm');
  const defaultTimeFormat: 'AM' | 'PM' = new Date().getHours() >= 12 ? 'PM' : 'AM';

  const schema = z
    .object({
      duration: z.union([z.number(), z.null()]).optional(),
      isAllDayAppointment: z.boolean(),
      location: z
        .string()
        .refine((v) => v !== '', { message: translateFrom(moduleName, 'locationRequired', 'Location is required') }),
      provider: z
        .string()
        .refine((v) => v !== '', { message: translateFrom(moduleName, 'providerRequired', 'Provider is required') }),
      appointmentStatus: z.string().optional(),
      appointmentNote: z.string(),
      appointmentType: z
        .string()
        .refine((v) => v !== '', {
          message: translateFrom(moduleName, 'appointmentTypeRequired', 'Appointment type is required'),
        }),
      selectedService: z
        .string()
        .refine((v) => v !== '', { message: translateFrom(moduleName, 'serviceRequired', 'Service is required') }),
      recurringPatternType: z.enum(['DAY', 'WEEK']),
      recurringPatternPeriod: z.number(),
      recurringPatternDaysOfWeek: z.array(z.string()),
      selectedDaysOfWeekText: z.string().optional(),
      startTime: z.string().refine(isValidTime, { message: translateFrom(moduleName, 'invalidTime', 'Invalid time') }),
      timeFormat: z.enum(['AM', 'PM']),
      appointmentDateTime: z.object({
        startDate: z.date(),
        startDateText: z.string(),
        recurringPatternEndDate: z.date().nullable(),
        recurringPatternEndDateText: z.string().nullable(),
      }),
      formIsRecurringAppointment: z.boolean(),
      dateAppointmentScheduled: z.date().optional(),
    })
    .refine(
      (d) =>
        d.formIsRecurringAppointment ? z.date().safeParse(d.appointmentDateTime.recurringPatternEndDate).success : true,
      {
        path: ['appointmentDateTime.recurringPatternEndDate'],
        message: t('recurringAppointmentShouldHaveEndDate', 'A recurring appointment should have an end date'),
      },
    )
    .superRefine((d, ctx) => {
      if (!d.isAllDayAppointment && (!d.duration || d.duration <= 0)) {
        ctx.addIssue({
          path: ['duration'],
          code: z.ZodIssueCode.custom,
          message: translateFrom(moduleName, 'durationErrorMessage', 'Duration should be greater than zero'),
        });
      }
    });

  type FormData = z.infer<typeof schema>;

  const {
    control,
    getValues,
    setValue,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    mode: 'all',
    resolver: zodResolver(schema),
    defaultValues: {
      location: session?.sessionLocation?.uuid ?? '',
      provider: session?.currentProvider?.uuid ?? '',
      appointmentNote: '',
      appointmentStatus: '',
      appointmentType: appointmentTypes?.length === 1 ? appointmentTypes[0] : '',
      selectedService: services?.length === 1 ? services[0].name : '',
      recurringPatternType: 'DAY',
      recurringPatternPeriod: 1,
      recurringPatternDaysOfWeek: [],
      startTime: defaultAppointmentStartTime,
      duration: undefined,
      timeFormat: defaultTimeFormat,
      appointmentDateTime: {
        startDate: defaultStartDate,
        startDateText: defaultStartDateText,
        recurringPatternEndDate: null,
        recurringPatternEndDateText: null,
      },
      formIsRecurringAppointment: false,
      dateAppointmentScheduled: new Date(),
      isAllDayAppointment: allowAllDayAppointments ?? false,
    },
  });

  useEffect(() => setValue('formIsRecurringAppointment', isRecurringAppointment), [isRecurringAppointment, setValue]);

  const {
    field: { ref: startDateRef },
  } = useController({ name: 'appointmentDateTime.startDate', control });
  const {
    field: { ref: endDateRef },
  } = useController({ name: 'appointmentDateTime.recurringPatternEndDate', control });
  useEffect(() => {
    startDateRef(document.getElementById('startDatePickerInput'));
    endDateRef(document.getElementById('endDatePickerInput'));
  }, [startDateRef, endDateRef]);

  const defaultSelectedDaysOfWeekText = (() => {
    const days = getValues('recurringPatternDaysOfWeek');
    if (!days?.length) return t('daysOfWeek', 'Days of the week');
    return weekDays
      .filter((d) => days.includes(d.id))
      .map((d) => d.label)
      .join(', ');
  })();

  const handleWorkloadDateChange = (date: Date) => {
    setValue('appointmentDateTime', { ...getValues('appointmentDateTime'), startDate: date });
  };

  const handleSelectChange = (e) => {
    setValue(
      'selectedDaysOfWeekText',
      e?.selectedItems?.length < 1
        ? t('daysOfWeek', 'Days of the week')
        : e.selectedItems.map((d) => d.label).join(', '),
    );
    setValue(
      'recurringPatternDaysOfWeek',
      e.selectedItems.map((s) => s.id),
    );
  };

  const handleSave = async (data: FormData) => {
    setIsSubmitting(true);
    const serviceUuid = services?.find((s) => s.name === data.selectedService)?.uuid;
    const [h, m] = data.startTime.split(':').map(Number);
    const hours = (h % 12) + (data.timeFormat === 'PM' ? 12 : 0);
    const startDatetime = new Date(data.appointmentDateTime.startDate).setHours(hours, m);
    const endDatetime = data.isAllDayAppointment
      ? dayjs(data.appointmentDateTime.startDate).endOf('day').toDate()
      : dayjs(startDatetime).add(data.duration, 'minutes').toDate();

    const payload: AppointmentPayload = {
      appointmentKind: data.appointmentType,
      status: data.appointmentStatus,
      serviceUuid,
      startDateTime: dayjs(startDatetime).format(),
      endDateTime: dayjs(endDatetime).format(),
      locationUuid: data.location,
      providers: [{ uuid: data.provider }],
      patientUuid,
      comments: data.appointmentNote,
      dateAppointmentScheduled: dayjs(data.dateAppointmentScheduled).format(),
    };

    const conflictRes: FetchResponse = await checkAppointmentConflict(payload);
    if (conflictRes.status === 200) {
      setIsSubmitting(false);
      let msg = t('appointmentConflict', 'Appointment conflict');
      if (conflictRes.data?.SERVICE_UNAVAILABLE)
        msg = t('serviceUnavailable', 'Appointment time is outside of service hours');
      else if (conflictRes.data?.PATIENT_DOUBLE_BOOKING)
        msg = t('patientDoubleBooking', 'Patient already booked at this time');
      showSnackbar({ kind: 'error', isLowContrast: true, title: msg });
      return;
    }

    const abortController = new AbortController();
    const recurringPattern: RecurringPattern = {
      type: data.recurringPatternType,
      period: data.recurringPatternPeriod,
      endDate: data.appointmentDateTime.recurringPatternEndDate
        ? dayjs(data.appointmentDateTime.recurringPatternEndDate.setHours(23, 59)).format()
        : null,
      daysOfWeek: data.recurringPatternDaysOfWeek,
    };

    (isRecurringAppointment
      ? saveRecurringAppointments({ appointmentRequest: payload, recurringPattern }, abortController)
      : saveAppointment(payload, abortController)
    ).then(
      ({ status }) => {
        setIsSubmitting(false);
        if (status === 200) {
          mutateAppointments();
          showSnackbar({
            kind: 'success',
            isLowContrast: true,
            title: t('appointmentScheduled', 'Appointment scheduled'),
            subtitle: t('appointmentNowVisible', 'It is now visible on the Appointments page'),
          });
          closeModal();
        } else {
          showSnackbar({
            kind: 'error',
            isLowContrast: false,
            title: t('appointmentFormError', 'Error scheduling appointment'),
          });
        }
      },
      (err) => {
        setIsSubmitting(false);
        showSnackbar({
          kind: 'error',
          isLowContrast: false,
          title: t('appointmentFormError', 'Error scheduling appointment'),
          subtitle: err?.message,
        });
      },
    );
  };

  if (isLoading) return <InlineLoading description={`${t('loading', 'Loading')}...`} className={styles.loader} />;

  return (
    <>
      <div className={styles.customHeader}>
        <div className={styles.headerTitleRow}>
          <button type="button" className={styles.backBtn} onClick={onBack}>
            <ArrowLeft size={16} />
            {t('back', 'Back')}
          </button>
          <h3 className={styles.headerTitle}>{t('createNewAppointment', 'Create new appointment')}</h3>
        </div>
        <button type="button" className={styles.closeBtn} onClick={closeModal} aria-label={t('close', 'Close')}>
          <Close size={20} />
        </button>
      </div>

      <ModalBody className={styles.formBody}>
        <Form id="appt-form" onSubmit={handleSubmit(handleSave)}>
          {patient && (
            <ExtensionSlot name="patient-header-slot" state={{ patient, patientUuid, hideActionsOverflow: true }} />
          )}
          <Stack className={styles.formStack} gap={6}>
            {/* Location */}
            <FormGroup className={styles.formGroup} legendText={t('location', 'Location')}>
              <ResponsiveWrapper>
                <Controller
                  name="location"
                  control={control}
                  render={({ field: { onChange, value, onBlur, ref } }) => (
                    <Select
                      id="location"
                      invalid={!!errors?.location}
                      invalidText={errors?.location?.message}
                      labelText={t('selectALocation', 'Select a location')}
                      onChange={onChange}
                      onBlur={onBlur}
                      ref={ref}
                      value={value}>
                      <SelectItem text={t('chooseLocation', 'Choose a location')} value="" />
                      {locations?.map((l) => (
                        <SelectItem key={l.uuid} text={l.display} value={l.uuid} />
                      ))}
                    </Select>
                  )}
                />
              </ResponsiveWrapper>
            </FormGroup>

            {/* Service */}
            <FormGroup className={styles.formGroup} legendText={t('service', 'Service')}>
              <ResponsiveWrapper>
                <Controller
                  name="selectedService"
                  control={control}
                  render={({ field: { onBlur, onChange, value, ref } }) => (
                    <Select
                      id="service"
                      invalid={!!errors?.selectedService}
                      invalidText={errors?.selectedService?.message}
                      labelText={t('selectService', 'Select a service')}
                      onBlur={onBlur}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                        setValue('duration', services?.find((s) => s.name === e.target.value)?.durationMins);
                        onChange(e);
                      }}
                      ref={ref}
                      value={value}>
                      <SelectItem text={t('chooseService', 'Select service')} value="" />
                      {services?.map((s) => (
                        <SelectItem key={s.uuid} text={s.name} value={s.name} />
                      ))}
                    </Select>
                  )}
                />
              </ResponsiveWrapper>
            </FormGroup>

            {/* Appointment Type */}
            <FormGroup className={styles.formGroup} legendText={t('appointmentType_title', 'Appointment Type')}>
              <ResponsiveWrapper>
                <Controller
                  name="appointmentType"
                  control={control}
                  render={({ field: { onBlur, onChange, value, ref } }) => (
                    <Select
                      disabled={!appointmentTypes?.length}
                      id="appointmentType"
                      invalid={!!errors?.appointmentType}
                      invalidText={errors?.appointmentType?.message}
                      labelText={t('selectAppointmentType', 'Select the type of appointment')}
                      onBlur={onBlur}
                      onChange={onChange}
                      ref={ref}
                      value={value}>
                      <SelectItem text={t('chooseAppointmentType', 'Choose appointment type')} value="" />
                      {appointmentTypes?.map((type, i) => (
                        <SelectItem key={i} text={type} value={type} />
                      ))}
                    </Select>
                  )}
                />
              </ResponsiveWrapper>
            </FormGroup>

            {/* Recurring */}
            <FormGroup className={styles.formGroup} legendText={t('recurringAppointment', 'Recurring Appointment')}>
              <Toggle
                id="recurringToggle"
                labelA={t('no', 'No')}
                labelB={t('yes', 'Yes')}
                labelText={t('isRecurringAppointment', 'Is this a recurring appointment?')}
                onClick={() => setIsRecurringAppointment((p) => !p)}
              />
            </FormGroup>

            {/* Date & Time */}
            <FormGroup className={styles.formGroup} legendText={t('dateTime', 'Date & Time')}>
              <div className={styles.dateTimeFields}>
                {isRecurringAppointment ? (
                  <div className={styles.inputContainer}>
                    {allowAllDayAppointments && (
                      <Controller
                        name="isAllDayAppointment"
                        control={control}
                        render={({ field: { value, onChange } }) => (
                          <Toggle
                            id="allDayToggle"
                            labelA={t('no', 'No')}
                            labelB={t('yes', 'Yes')}
                            labelText={t('allDay', 'All day')}
                            toggled={value}
                            onToggle={onChange}
                          />
                        )}
                      />
                    )}
                    <ResponsiveWrapper>
                      <Controller
                        name="appointmentDateTime"
                        control={control}
                        render={({ field: { onChange, value }, fieldState }) => (
                          <OpenmrsDateRangePicker
                            value={
                              value.startDate && value.recurringPatternEndDate
                                ? [value.startDate, value.recurringPatternEndDate]
                                : null
                            }
                            onChange={([startDate, endDate]) =>
                              onChange({
                                ...value,
                                startDate,
                                startDateText: startDate ? dayjs(startDate).format(dateFormat) : '',
                                recurringPatternEndDate: endDate,
                                recurringPatternEndDateText: endDate ? dayjs(endDate).format(dateFormat) : '',
                              })
                            }
                            startName="start"
                            endName="end"
                            id="appointmentRecurringDateRangePicker"
                            labelText={t('dateRange', 'Set date range')}
                            invalid={!!fieldState?.error?.message}
                            invalidText={fieldState?.error?.message}
                            isRequired
                          />
                        )}
                      />
                    </ResponsiveWrapper>
                    {!watch('isAllDayAppointment') && <TimeAndDuration t={t} control={control} errors={errors} />}
                    <ResponsiveWrapper>
                      <Controller
                        name="recurringPatternPeriod"
                        control={control}
                        render={({ field: { onBlur, onChange, value } }) => (
                          <NumberInput
                            hideSteppers
                            id="repeatNumber"
                            min={1}
                            max={356}
                            label={t('repeatEvery', 'Repeat every')}
                            invalidText={t('invalidNumber', 'Number is not valid')}
                            value={value}
                            onBlur={onBlur}
                            onChange={(e, state) => {
                              const v = state?.value ?? (e.target as HTMLInputElement).value;
                              onChange(v === '' ? null : Number(v));
                            }}
                          />
                        )}
                      />
                    </ResponsiveWrapper>
                    <ResponsiveWrapper>
                      <Controller
                        name="recurringPatternType"
                        control={control}
                        render={({ field: { onChange, value } }) => (
                          <RadioButtonGroup
                            legendText={t('period', 'Period')}
                            name="radio-button-group"
                            onChange={onChange}
                            valueSelected={value}>
                            <RadioButton labelText={t('day', 'Day')} value="DAY" id="radioDay" />
                            <RadioButton labelText={t('week', 'Week')} value="WEEK" id="radioWeek" />
                          </RadioButtonGroup>
                        )}
                      />
                    </ResponsiveWrapper>
                    {watch('recurringPatternType') === 'WEEK' && (
                      <Controller
                        name="selectedDaysOfWeekText"
                        control={control}
                        defaultValue={defaultSelectedDaysOfWeekText}
                        render={({ field: { onChange } }) => (
                          <MultiSelect
                            className={styles.weekSelect}
                            id="daysOfWeek"
                            initialSelectedItems={weekDays.filter((d) =>
                              getValues('recurringPatternDaysOfWeek').includes(d.id),
                            )}
                            items={weekDays}
                            itemToString={(item) => (item ? t(item.labelCode, item.label) : '')}
                            label={getValues('selectedDaysOfWeekText')}
                            onChange={(e) => {
                              onChange(e);
                              handleSelectChange(e);
                            }}
                            selectionFeedback="top-after-reopen"
                            sortItems={(items) => [...items].sort((a, b) => a.order - b.order)}
                          />
                        )}
                      />
                    )}
                  </div>
                ) : (
                  <div className={styles.inputContainer}>
                    {allowAllDayAppointments && (
                      <Controller
                        name="isAllDayAppointment"
                        control={control}
                        render={({ field: { value, onChange } }) => (
                          <Toggle
                            id="allDayToggle"
                            labelA={t('no', 'No')}
                            labelB={t('yes', 'Yes')}
                            labelText={t('allDay', 'All day')}
                            toggled={value}
                            onToggle={onChange}
                          />
                        )}
                      />
                    )}
                    <ResponsiveWrapper>
                      <Controller
                        name="appointmentDateTime"
                        control={control}
                        render={({ field, fieldState }) => (
                          <OpenmrsDatePicker
                            data-testid="datePickerInput"
                            id="datePickerInput"
                            invalid={!!fieldState?.error?.message}
                            invalidText={fieldState?.error?.message}
                            labelText={t('date', 'Date')}
                            onBlur={field.onBlur}
                            onChange={(date) => field.onChange({ ...field.value, startDate: date })}
                            style={{ width: '100%' }}
                            value={field.value.startDate}
                          />
                        )}
                      />
                    </ResponsiveWrapper>
                    {!watch('isAllDayAppointment') && <TimeAndDuration t={t} control={control} errors={errors} />}
                  </div>
                )}
              </div>
            </FormGroup>

            {/* Workload */}
            {getValues('selectedService') && (
              <FormGroup className={styles.formGroup} legendText="">
                <ResponsiveWrapper>
                  <Workload
                    appointmentDate={watch('appointmentDateTime').startDate}
                    onWorkloadDateChange={handleWorkloadDateChange}
                    selectedService={watch('selectedService')}
                  />
                </ResponsiveWrapper>
              </FormGroup>
            )}

            {/* Provider */}
            <FormGroup className={styles.formGroup} legendText={t('provider', 'Provider')}>
              <ResponsiveWrapper>
                <Controller
                  name="provider"
                  control={control}
                  render={({ field: { onChange, value, onBlur, ref } }) => (
                    <Select
                      id="provider"
                      labelText={t('selectProvider', 'Select a provider')}
                      onChange={onChange}
                      onBlur={onBlur}
                      ref={ref}
                      value={value}>
                      <SelectItem text={t('chooseProvider', 'Choose a provider')} value="" />
                      {providers?.providers?.map((p) => (
                        <SelectItem key={p.uuid} text={p.display} value={p.uuid} />
                      ))}
                    </Select>
                  )}
                />
              </ResponsiveWrapper>
            </FormGroup>

            {/* Date appointment scheduled */}
            <FormGroup
              className={styles.formGroup}
              legendText={t('dateAppointmentScheduled', 'Date appointment scheduled')}>
              <ResponsiveWrapper>
                <Controller
                  name="dateAppointmentScheduled"
                  control={control}
                  render={({ field, fieldState }) => (
                    <OpenmrsDatePicker
                      data-testid="dateAppointmentScheduledPickerInput"
                      id="dateAppointmentScheduledPickerInput"
                      invalid={!!fieldState?.error?.message}
                      invalidText={fieldState?.error?.message}
                      labelText={t('dateAppointmentIssued', 'Date appointment issued')}
                      maxDate={new Date()}
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                      style={{ width: '100%' }}
                      value={field.value}
                    />
                  )}
                />
              </ResponsiveWrapper>
            </FormGroup>

            {/* Note */}
            <FormGroup className={styles.formGroup} legendText={t('note', 'Note')}>
              <ResponsiveWrapper>
                <Controller
                  name="appointmentNote"
                  control={control}
                  render={({ field: { onChange, onBlur, value, ref } }) => (
                    <TextArea
                      enableCounter
                      id="appointmentNote"
                      value={value}
                      labelText={t('appointmentNoteLabel', 'Write an additional note')}
                      placeholder={t('appointmentNotePlaceholder', 'Write any additional points here')}
                      maxCount={255}
                      onChange={onChange}
                      onBlur={onBlur}
                      ref={ref}
                    />
                  )}
                />
              </ResponsiveWrapper>
            </FormGroup>
          </Stack>
        </Form>
      </ModalBody>

      <div className={styles.customFooter}>
        <button type="button" className={styles.footerBtnSecondary} onClick={closeModal}>
          {t('discard', 'Discard')}
        </button>
        <button type="submit" form="appt-form" disabled={isSubmitting} className={styles.footerBtnPrimary}>
          {isSubmitting ? (
            <InlineLoading description={`${t('saving', 'Saving')}...`} />
          ) : (
            t('saveAndClose', 'Save and close')
          )}
        </button>
      </div>
    </>
  );
}

// ─── Root modal ───────────────────────────────────────────────────────────────
const CalendarDayViewModal: React.FC<CalendarDayViewModalProps> = ({ dateTime, serviceUuid, closeModal }) => {
  const { t } = useTranslation();
  const layout = useLayoutType();
  const responsiveSize = isDesktop(layout) ? 'sm' : 'md';

  // ── Navigation state ─────────────────────────────────────────────────────
  const [view, setView] = useState<ModalView>('dayView');
  const [selectedPatient, setSelectedPatient] = useState<PatientResult | null>(null);

  // ── Patient search state ─────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PatientResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    try {
      const res = await openmrsFetch(`${restBaseUrl}/patient?q=${encodeURIComponent(query)}&v=default&limit=10`);
      setSearchResults(res.data?.results ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // ── Day view data ─────────────────────────────────────────────────────────
  const formattedDate = dayjs(dateTime).startOf('day').format('YYYY-MM-DDTHH:mm:ss.SSSZZ');
  const displayDate = formatDate(parseDate(formattedDate), { mode: 'standard', time: false });
  const { serviceTypes } = useAppointmentServices();
  const [selectedServiceUuids, setSelectedServiceUuids] = useState<string[]>(serviceUuid ? [serviceUuid] : []);
  const serviceTypeOptions = useMemo(
    () => serviceTypes?.map((s) => ({ id: s.uuid, label: s.name })) ?? [],
    [serviceTypes],
  );
  const handleServiceTypeChange = useCallback(
    ({ selectedItems }) => setSelectedServiceUuids(selectedItems.map((i) => i.id)),
    [],
  );

  const { appointmentList: scheduledList, isLoading: loadingScheduled } = useAppointmentList(
    'Scheduled',
    formattedDate,
  );
  const { appointmentList: checkedInList } = useAppointmentList('CheckedIn', formattedDate);
  const { appointmentList: cancelledList, isLoading: loadingCancelled } = useAppointmentList(
    'Cancelled',
    formattedDate,
  );
  const { highestServiceLoad } = useClinicalMetrics();
  const { totalProviders } = useAllAppointmentsByDate();

  const filterByService = useCallback(
    (list: Array<any>) => {
      const withIds = list.map((a) => ({ id: a.uuid, ...a }));
      return selectedServiceUuids.length === 0
        ? withIds
        : withIds.filter((a) => selectedServiceUuids.includes(a.service?.uuid));
    },
    [selectedServiceUuids],
  );

  const filteredScheduled = useMemo(() => filterByService(scheduledList), [filterByService, scheduledList]);
  const filteredCheckedIn = useMemo(() => filterByService(checkedInList), [filterByService, checkedInList]);
  const filteredCancelled = useMemo(() => filterByService(cancelledList), [filterByService, cancelledList]);
  const expectedAppointments = useMemo(
    () => [...filteredScheduled, ...filteredCheckedIn],
    [filteredScheduled, filteredCheckedIn],
  );
  const [activeTab, setActiveTab] = useState(0);

  // ── View: Appointment Form ────────────────────────────────────────────────
  if (view === 'appointmentForm' && selectedPatient) {
    return (
      <AppointmentFormView
        patientUuid={selectedPatient.uuid}
        closeModal={closeModal}
        onBack={() => setView('patientSearch')}
        initialDate={formattedDate}
      />
    );
  }

  // ── View: Patient Search ──────────────────────────────────────────────────
  if (view === 'patientSearch') {
    return (
      <>
        <div className={styles.customHeader}>
          <div className={styles.headerTitleRow}>
            <button type="button" className={styles.backBtn} onClick={() => setView('dayView')}>
              <ArrowLeft size={16} />
              {t('back', 'Back')}
            </button>
            <h3 className={styles.headerTitle}>{t('createNewAppointment', 'Create new appointment')}</h3>
          </div>
          <button type="button" className={styles.closeBtn} onClick={closeModal} aria-label={t('close', 'Close')}>
            <Close size={20} />
          </button>
        </div>

        <ModalBody className={styles.searchBody}>
          <div className={styles.searchRow}>
            <Search
              id="patient-search"
              labelText={t('searchPatient', 'Search for a patient by name or ID')}
              placeholder={t('searchPatient', 'Search for a patient by name or ID')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              size="lg"
            />
            <Button onClick={handleSearch} size="lg">
              {t('search', 'Search')}
            </Button>
          </div>

          {isSearching && <InlineLoading description={`${t('searching', 'Searching')}...`} />}

          {!isSearching && searchResults.length === 0 && query && (
            <Layer>
              <Tile className={styles.emptyTile}>
                <p>{t('noResultsFound', 'No results found')}</p>
              </Tile>
            </Layer>
          )}

          {searchResults.length > 0 && (
            <p className={styles.resultCount}>
              {t('searchResults', '{{count}} search result(s)', { count: searchResults.length })}
            </p>
          )}

          <div className={styles.resultsList}>
            {searchResults.map((patient) => (
              <Tile
                key={patient.uuid}
                className={styles.patientTile}
                onClick={() => {
                  setSelectedPatient(patient);
                  setView('appointmentForm');
                }}>
                <div className={styles.patientRow}>
                  <div className={styles.patientAvatar}>
                    <User size={24} />
                  </div>
                  <div className={styles.patientInfo}>
                    <span className={styles.patientName}>{patient.display}</span>
                    <div className={styles.patientMeta}>
                      <span>{patient.person?.gender === 'M' ? t('male', 'Male') : t('female', 'Female')}</span>
                      {patient.person?.age && (
                        <span>
                          {patient.person.age} {t('yrs', 'yrs')}
                        </span>
                      )}
                      {patient.person?.birthdate && (
                        <span>{dayjs(patient.person.birthdate).format('DD-MMM-YYYY')}</span>
                      )}
                    </div>
                    {patient.identifiers?.[0]?.display && (
                      <Tag type="gray" size="sm">
                        {patient.identifiers[0].display}
                      </Tag>
                    )}
                  </div>
                </div>
              </Tile>
            ))}
          </div>
        </ModalBody>
      </>
    );
  }

  // ── View: Day View (default) ──────────────────────────────────────────────
  return (
    <>
      <div className={styles.customHeader}>
        <button type="button" className={styles.closeBtn} onClick={closeModal} aria-label={t('close', 'Close')}>
          <Close size={20} />
        </button>
        <div className={styles.dayHeaderRow1}>
          <h3 className={styles.headerTitle}>
            {t('appointmentsOn', 'Appointments on')} {dayjs(dateTime).format('DD MMM YYYY')}
          </h3>
        </div>
        <div className={styles.dayHeaderRow2}>
          <Button kind="primary" renderIcon={Hospital} size="sm" onClick={() => setView('patientSearch')}>
            {t('createNewAppointment', 'Create new appointment')}
          </Button>
          <div className={styles.filterRow}>
            <MultiSelect
              id="modalServiceTypeFilter"
              items={serviceTypeOptions}
              itemToString={(item) => (item ? item.label : '')}
              label={t('filterByServiceType', 'Filter appointments by service type')}
              onChange={handleServiceTypeChange}
              type="inline"
              size="sm"
              selectedItems={serviceTypeOptions.filter((opt) => selectedServiceUuids.includes(opt.id))}
            />
            {selectedServiceUuids.length > 0 && (
              <Tag type="blue" size="sm">
                {selectedServiceUuids.length}
              </Tag>
            )}
          </div>
        </div>
      </div>

      <ModalBody className={styles.modalBody}>
        <div className={styles.metricsRow}>
          <MetricCard
            headerLabel={t('scheduledAppointments', 'Scheduled appointments')}
            label={t('appointments', 'Appointments')}
            value={expectedAppointments.length}
            count={{ arrivedAppointments: filteredCheckedIn, pendingAppointments: filteredScheduled }}
            isLoading={loadingScheduled}
          />
          <MetricCard
            headerLabel={t('highestServiceVolume', 'Highest volume service: {{time}}', { time: displayDate })}
            label={highestServiceLoad ? highestServiceLoad.serviceName : t('serviceName', 'Service name')}
            value={highestServiceLoad?.count ?? '--'}
          />
          <MetricCard
            headerLabel={t('providersBooked', 'Providers booked: {{time}}', { time: displayDate })}
            label={t('providers', 'Providers')}
            value={totalProviders}
          />
        </div>

        <div className={styles.switcherRow}>
          <ContentSwitcher size="md" selectedIndex={activeTab} onChange={({ index }) => setActiveTab(index as number)}>
            <Switch name="expected" text={t('expected', 'Expected')} />
            <Switch name="cancelled" text={t('cancelled', 'Cancelled')} />
          </ContentSwitcher>
        </div>

        {activeTab === 0 && (
          <AppointmentsTable
            appointments={expectedAppointments}
            hasActiveFilters={selectedServiceUuids.length > 0}
            isLoading={loadingScheduled}
            tableHeading={t('scheduledApts', 'Scheduled Apts')}
          />
        )}
        {activeTab === 1 && (
          <AppointmentsTable
            appointments={filteredCancelled}
            hasActiveFilters={selectedServiceUuids.length > 0}
            isLoading={loadingCancelled}
            tableHeading={t('cancelledApts', 'Cancelled Apts')}
          />
        )}
      </ModalBody>
    </>
  );
};

export default CalendarDayViewModal;