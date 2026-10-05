export type VisitCalendarReminder = 0 | 15 | 60 | 1440;

export interface VisitCalendarExport {
  filename: string;
  calendarText: string;
  fields: {
    title: 'Healthcare appointment';
    dateLabel: string;
    timeLabel: string;
    reminderLabel: string;
    isTimed: boolean;
  };
}

export function createVisitCalendarExport(options: {
  appointmentAt: string;
  time?: string;
  reminderMinutes?: VisitCalendarReminder;
  uid: string;
  dtstamp?: string;
}): VisitCalendarExport;
