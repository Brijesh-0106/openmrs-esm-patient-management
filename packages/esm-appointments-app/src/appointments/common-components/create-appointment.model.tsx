import React, { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Controller, useController, useForm, type Control, type FieldErrors } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ButtonSet,
  Form,
  FormGroup,
  InlineLoading,
  Layer,
  ModalBody,
  ModalFooter,
  ModalHeader,
  MultiSelect,
  NumberInput,
  RadioButton,
  RadioButtonGroup,
  Search,
  Select,
  SelectItem,
  Stack,
  Tag,
  TextArea,
  TimePicker,
  TimePickerSelect,
  Tile,
  Toggle,
} from '@carbon/react';
import { User } from '@carbon/react/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ExtensionSlot,
  OpenmrsDatePicker,
  OpenmrsDateRangePicker,
  ResponsiveWrapper,
  openmrsFetch,
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
import { z } from 'zod';
import { type ConfigObject } from '../../config-schema';
import type { AppointmentPayload, RecurringPattern } from '../../types';
import {
  checkAppointmentConflict,
  saveAppointment,
  saveRecurringAppointments,
  useAppointmentService,
  useMutateAppointments,
} from '../../form/appointments-form.resource';
import { appointmentLocationTagName, dateFormat, moduleName, weekDays } from '../../constants';
import { useAppointmentsStore } from '../../store';
import { useProviders } from '../../hooks/useProviders';
import Workload from '../../workload/workload.component';
import styles from './create-appointment.modal.scss';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CreateAppointmentModalProps {
  closeModal: () => void;
  /** Pre-selected date from calendar click */
  initialDate?: string;
}

interface PatientResult {
  uuid: string;
  display: string;
  person: {
    age: number;
    gender: string;
    birthdate: string;
  };
  identifiers: Array<{ display: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 – Patient Search
// ─────────────────────────────────────────────────────────────────────────────

interface PatientSearchStepProps {
  onSelectPatient: (patient: PatientResult) => void;
  closeModal: () => void;
}

const PatientSearchStep: React.FC<PatientSearchStepProps> = ({ onSelectPatient, closeModal }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PatientResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    try {
      const res = await openmrsFetch(
        `${restBaseUrl}/patient?q=${encodeURIComponent(query)}&v=default&limit=10`,
      );
      setResults(res.data?.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <>
      <ModalHeader closeModal={closeModal} className={styles.modalHeader}>
        <span className={styles.modalTitle}>{t('createNewAppointment', 'Create new appointment')}</span>
      </ModalHeader>

      <ModalBody className={styles.searchBody}>
        <div className={styles.searchRow}>
          <Search
            id="patient-search"
            labelText={t('searchPatient', 'Search for a patient by name or ID')}
            placeholder={t('searchPatient', 'Search for a patient by name or ID')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            size="lg"
          />
          <Button onClick={handleSearch} size="lg">
            {t('search', 'Search')}
          </Button>
        </div>

        {isSearching && <InlineLoading description={`${t('searching', 'Searching')}...`} />}

        {!isSearching && results.length === 0 && query && (
          <Layer>
            <Tile className={styles.emptyTile}>
              <p>{t('noResultsFound', 'No results found')}</p>
              <p>{t('tryDifferentSearch', 'Try a different search term')}</p>
            </Tile>
          </Layer>
        )}

        {results.length > 0 && (
          <p className={styles.resultCount}>
            {t('searchResults', '{{count}} search result(s)', { count: results.length })}
          </p>
        )}

        <div className={styles.resultsList}>
          {results.map((patient) => {
            const identifier = patient.identifiers?.[0]?.display ?? '';
            const gender = patient.person?.gender === 'M' ? t('male', 'Male') : t('female', 'Female');
            const age = patient.person?.age;
            const dob = patient.person?.birthdate
              ? dayjs(patient.person.birthdate).format('DD-MMM-YYYY')
              : '';

            return (
              <Tile
                key={patient.uuid}
                className={styles.patientTile}
                onClick={() => onSelectPatient(patient)}>
                <div className={styles.patientRow}>
                  <div className={styles.patientAvatar}>
                    <User size={24} />
                  </div>
                  <div className={styles.patientInfo}>
                    <span className={styles.patientName}>{patient.display}</span>
                    <div className={styles.patientMeta}>
                      <span>{gender}</span>
                      {age && <span>{age} {t('yrs', 'yrs')}</span>}
                      {dob && <span>{dob}</span>}
                    </div>
                    {identifier && (
                      <Tag type="gray" size="sm">
                        {identifier}
                      </Tag>
                    )}
                  </div>
                </div>
              </Tile>
            );
          })}
        </div>
      </ModalBody>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Time & Duration sub-component (shared with form)
// ─────────────────────────────────────────────────────────────────────────────

const time12HourFormatRegexPattern = '^(1[0-2]|0?[1-9]):[0-5][0-9]$';
const time12HourFormatRegex = /^(1[0-2]|0?[1-9]):[0-5][0-9]$/;
const isValidTime = (timeStr: string) => time12HourFormatRegex.test(timeStr);

interface TimeAndDurationProps {
  t: ReturnType<typeof useTranslation>['t'];
  control: Control<Record<string, any>>;
  errors: FieldErrors<Record<string, any>>;
}

function TimeAndDuration({ t, control, errors }: TimeAndDurationProps) {
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

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 – Appointment Form
// ─────────────────────────────────────────────────────────────────────────────

interface AppointmentFormStepProps {
  patientUuid: string;
  closeModal: () => void;
  onBack: () => void;
  initialDate?: string;
}

const AppointmentFormStep: React.FC<AppointmentFormStepProps> = ({
  patientUuid,
  closeModal,
  onBack,
  initialDate,
}) => {
  const { t } = useTranslation();
  const { patient } = usePatient(patientUuid);
  const { mutateAppointments } = useMutateAppointments();
  const locations = useLocations(appointmentLocationTagName);
  const providers = useProviders();
  const session = useSession();
  const { selectedDate } = useAppointmentsStore();
  const { data: services, isLoading } = useAppointmentService();
  const { appointmentStatuses, appointmentTypes, allowAllDayAppointments } = useConfig<ConfigObject>();

  const [isRecurringAppointment, setIsRecurringAppointment] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const effectiveDate = initialDate ?? selectedDate ?? new Date().toISOString();
  const defaultStartDate = new Date(effectiveDate);
  const defaultStartDateText = dayjs(defaultStartDate).format(dateFormat);
  const defaultAppointmentStartTime = dayjs(new Date()).format('hh:mm');
  const defaultTimeFormat = new Date().getHours() >= 12 ? 'PM' : 'AM';

  const appointmentsFormSchema = z
    .object({
      duration: z.union([z.number(), z.null()]).optional(),
      isAllDayAppointment: z.boolean(),
      location: z.string().refine((v) => v !== '', {
        message: translateFrom(moduleName, 'locationRequired', 'Location is required'),
      }),
      provider: z.string().refine((v) => v !== '', {
        message: translateFrom(moduleName, 'providerRequired', 'Provider is required'),
      }),
      appointmentStatus: z.string().optional(),
      appointmentNote: z.string(),
      appointmentType: z.string().refine((v) => v !== '', {
        message: translateFrom(moduleName, 'appointmentTypeRequired', 'Appointment type is required'),
      }),
      selectedService: z.string().refine((v) => v !== '', {
        message: translateFrom(moduleName, 'serviceRequired', 'Service is required'),
      }),
      recurringPatternType: z.enum(['DAY', 'WEEK']),
      recurringPatternPeriod: z.number(),
      recurringPatternDaysOfWeek: z.array(z.string()),
      selectedDaysOfWeekText: z.string().optional(),
      startTime: z.string().refine((v) => isValidTime(v), {
        message: translateFrom(moduleName, 'invalidTime', 'Invalid time'),
      }),
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
      (data) => {
        if (data.formIsRecurringAppointment) {
          return z.date().safeParse(data.appointmentDateTime.recurringPatternEndDate).success;
        }
        return true;
      },
      {
        path: ['appointmentDateTime.recurringPatternEndDate'],
        message: t('recurringAppointmentShouldHaveEndDate', 'A recurring appointment should have an end date'),
      },
    )
    .superRefine((data, ctx) => {
      if (!data.isAllDayAppointment && (!data.duration || data.duration <= 0)) {
        ctx.addIssue({
          path: ['duration'],
          code: z.ZodIssueCode.custom,
          message: translateFrom(moduleName, 'durationErrorMessage', 'Duration should be greater than zero'),
        });
      }
    });

  type AppointmentFormData = z.infer<typeof appointmentsFormSchema>;

  const {
    control,
    getValues,
    setValue,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<AppointmentFormData>({
    mode: 'all',
    resolver: zodResolver(appointmentsFormSchema),
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
      timeFormat: defaultTimeFormat as 'AM' | 'PM',
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
    const startEl = document.getElementById('startDatePickerInput');
    const endEl = document.getElementById('endDatePickerInput');
    startDateRef(startEl);
    endDateRef(endEl);
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
    const apptDate = getValues('appointmentDateTime');
    setValue('appointmentDateTime', { ...apptDate, startDate: date });
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

  const constructAppointmentPayload = (data: AppointmentFormData): AppointmentPayload => {
    const {
      selectedService,
      startTime,
      timeFormat,
      appointmentDateTime: { startDate },
      duration,
      appointmentType,
      location,
      provider,
      appointmentNote,
      appointmentStatus,
      dateAppointmentScheduled,
      isAllDayAppointment,
    } = data;

    const serviceUuid = services?.find((s) => s.name === selectedService)?.uuid;
    const [h, m] = startTime.split(':').map(Number);
    const hours = (h % 12) + (timeFormat === 'PM' ? 12 : 0);
    const startDatetime = new Date(startDate).setHours(hours, m);
    const endDatetime = isAllDayAppointment
      ? dayjs(startDate).endOf('day').toDate()
      : dayjs(startDatetime).add(duration, 'minutes').toDate();

    return {
      appointmentKind: appointmentType,
      status: appointmentStatus,
      serviceUuid,
      startDateTime: dayjs(startDatetime).format(),
      endDateTime: dayjs(endDatetime).format(),
      locationUuid: location,
      providers: [{ uuid: provider }],
      patientUuid,
      comments: appointmentNote,
      dateAppointmentScheduled: dayjs(dateAppointmentScheduled).format(),
    };
  };

  const constructRecurringPattern = (data: AppointmentFormData): RecurringPattern => {
    const {
      appointmentDateTime: { recurringPatternEndDate },
      recurringPatternType,
      recurringPatternPeriod,
      recurringPatternDaysOfWeek,
    } = data;
    const endDate = recurringPatternEndDate?.setHours(23, 59);
    return {
      type: recurringPatternType,
      period: recurringPatternPeriod,
      endDate: endDate ? dayjs(endDate).format() : null,
      daysOfWeek: recurringPatternDaysOfWeek,
    };
  };

  const handleSave = async (data: AppointmentFormData) => {
    setIsSubmitting(true);
    const payload = constructAppointmentPayload(data);

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
    const save = isRecurringAppointment
      ? saveRecurringAppointments(
          { appointmentRequest: payload, recurringPattern: constructRecurringPattern(data) },
          abortController,
        )
      : saveAppointment(payload, abortController);

    save.then(
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

  if (isLoading) {
    return (
      <>
        <ModalHeader closeModal={closeModal} className={styles.modalHeader}>
          <span className={styles.modalTitle}>{t('createNewAppointment', 'Create new appointment')}</span>
        </ModalHeader>
        <ModalBody>
          <InlineLoading description={`${t('loading', 'Loading')}...`} />
        </ModalBody>
      </>
    );
  }

  return (
    <>
      <ModalHeader closeModal={closeModal} className={styles.modalHeader}>
        <div className={styles.formHeaderRow}>
          <Button kind="ghost" size="sm" onClick={onBack} className={styles.backButton}>
            ← {t('back', 'Back')}
          </Button>
          <span className={styles.modalTitle}>{t('createNewAppointment', 'Create new appointment')}</span>
        </div>
      </ModalHeader>

      <ModalBody className={styles.formBody}>
        <Form id="appointment-form" onSubmit={handleSubmit(handleSave)}>
          {/* Patient header banner */}
          {patient && (
            <ExtensionSlot
              name="patient-header-slot"
              state={{ patient, patientUuid, hideActionsOverflow: true }}
            />
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
                      {locations?.map((loc) => (
                        <SelectItem key={loc.uuid} text={loc.display} value={loc.uuid} />
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

            {/* Recurring toggle */}
            <FormGroup className={styles.formGroup} legendText={t('recurringAppointment', 'Recurring Appointment')}>
              <Toggle
                id="recurringToggle"
                labelA={t('no', 'No')}
                labelB={t('yes', 'Yes')}
                labelText={t('isRecurringAppointment', 'Is this a recurring appointment?')}
                onClick={() => setIsRecurringAppointment((prev) => !prev)}
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
                            onChange={(dateRange) => {
                              const [startDate, endDate] = dateRange;
                              onChange({
                                ...value,
                                startDate,
                                startDateText: startDate ? dayjs(startDate).format(dateFormat) : '',
                                recurringPatternEndDate: endDate,
                                recurringPatternEndDateText: endDate ? dayjs(endDate).format(dateFormat) : '',
                              });
                            }}
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

      <ModalFooter className={styles.footer}>
        <Button kind="secondary" onClick={closeModal}>
          {t('discard', 'Discard')}
        </Button>
        <Button type="submit" form="appointment-form" disabled={isSubmitting}>
          {isSubmitting ? <InlineLoading description={`${t('saving', 'Saving')}...`} /> : t('saveAndClose', 'Save and close')}
        </Button>
      </ModalFooter>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Root modal – orchestrates steps
// ─────────────────────────────────────────────────────────────────────────────

const CreateAppointmentModal: React.FC<CreateAppointmentModalProps> = ({ closeModal, initialDate }) => {
  const [selectedPatient, setSelectedPatient] = useState<PatientResult | null>(null);

  if (selectedPatient) {
    return (
      <AppointmentFormStep
        patientUuid={selectedPatient.uuid}
        closeModal={closeModal}
        onBack={() => setSelectedPatient(null)}
        initialDate={initialDate}
      />
    );
  }

  return (
    <PatientSearchStep
      onSelectPatient={(p) => setSelectedPatient(p)}
      closeModal={closeModal}
    />
  );
};

export default CreateAppointmentModal;