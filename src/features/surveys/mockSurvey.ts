/**
 * MOCK DATA — only used while VITE_USE_MOCK_DATA=true.
 *
 * Kept for isolated UI development. Real mode never falls back to these records:
 * `surveyService` uses the live `public.survey_bookings` table exclusively when
 * mock mode is off.
 *
 * The shapes mirror what the real mapper produces, including the two system
 * states (attached system vs. booking with no system yet).
 */

import type { SurveyRecord } from '../../types/domain';

export const DEMO_SURVEY_REFERENCE = 'KA-SRV-2026-00128';

/** Booking-only demo, used to exercise the "System Summary not available" state. */
export const DEMO_SURVEY_WITHOUT_SYSTEM = 'KA-0000CAFE';

export const mockSurveyRecords: SurveyRecord[] = [
  {
    details: {
      referenceId: DEMO_SURVEY_REFERENCE,
      bookingId: '00000000-0000-4000-8000-000000000128',
      customerName: 'Ahmed Raza',
      phone: '+92 300 1234567',
      city: 'Lahore',
      address: 'House 214, Street 7, DHA Phase 5',
      bookingType: 'Solar Survey',
      serviceType: 'Solar Survey',
      preferredDate: '2026-02-18',
      timeSlot: 'Morning (9am – 12pm)',
      status: 'Survey Scheduled',
      statusKey: 'survey_scheduled',
      confirmedSurveyDate: '2026-02-18T09:30:00.000Z',
      plannedInstallationDate: null,
      requestedAt: '2026-02-11T06:15:00.000Z',
      progressNote: 'Roof access from rear stairs. Meter room on ground floor.',
    },
    system: {
      systemSizeKw: 12,
      panels: { name: 'JA Solar 625W', detail: '625W × 20' },
      inverter: { name: 'Solis 12kW Hybrid', detail: '12 kW × 1' },
      battery: { name: 'Pylontech', detail: '16 kWh total' },
      structureType: 'Elevated Structure',
      source: 'mock',
    },
  },
  {
    details: {
      referenceId: DEMO_SURVEY_WITHOUT_SYSTEM,
      bookingId: '0000cafe-0000-4000-8000-000000000001',
      customerName: 'Osama',
      phone: '03351351472',
      city: 'Islamabad',
      address: 'Misrial',
      bookingType: 'Solar Survey',
      serviceType: 'Solar Survey',
      preferredDate: '2026-09-15',
      timeSlot: null,
      status: 'Request Received',
      statusKey: 'request_received',
      confirmedSurveyDate: null,
      plannedInstallationDate: null,
      requestedAt: '2026-09-14T08:05:00.000Z',
    },
    system: null,
  },
];
