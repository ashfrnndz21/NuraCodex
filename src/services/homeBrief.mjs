import { parseHealthDate } from '../utils/healthDate.mjs';

export function buildHomeCarePreview(visits, now = new Date()) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const todayTimestamp = startOfToday.getTime();
  const upcoming = [];

  for (const visit of visits) {
    if (visit.status === 'upcoming') {
      const appointmentDate = parseHealthDate(visit.appointmentAt);
      if (appointmentDate && appointmentDate.getTime() >= todayTimestamp) {
        const detail = [visit.clinician, visit.location, visit.questions?.length ? `${visit.questions.length} saved questions` : '']
          .filter(Boolean).join(' · ') || 'Visit added by you';
        upcoming.push({ id: `visit:${visit.id}`, visitId: visit.id, title: visit.purpose || 'Care visit', detail, date: visit.appointmentAt, kind: 'VISIT' });
      }
    }

    for (const action of visit.followUpActions ?? []) {
      const dueDate = parseHealthDate(action.dueOn);
      if (action.status === 'open' && dueDate && dueDate.getTime() >= todayTimestamp) {
        upcoming.push({ id: `follow-up:${action.id}`, visitId: visit.id, title: action.title, detail: `Follow-up · ${visit.purpose || 'your care plan'}`, date: action.dueOn, kind: 'FOLLOW-UP' });
      }
    }
  }

  return upcoming
    .sort((a, b) => (parseHealthDate(a.date)?.getTime() ?? 0) - (parseHealthDate(b.date)?.getTime() ?? 0))
    .slice(0, 2);
}

export function firstUserContextFact(facts, excludedFactId) {
  return facts.find((fact) => fact.id !== excludedFactId
    && (fact.source?.trim().toLocaleLowerCase() === 'written by you' || /self.report/i.test(fact.category ?? '')));
}
