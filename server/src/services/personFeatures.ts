/**
 * Parts of the app that can be switched off for one person (IDEAS.md idea 11)
 * — on their page, under "Show on this page". Switched off, the section leaves
 * their page and the checklists stop asking about it for them. Nothing is
 * deleted. The switches in Settings → Features still apply to everyone.
 */
export const PERSON_FEATURES = ["payg", "pay-tracking", "insurance", "super", "estate"] as const;
export type PersonFeature = (typeof PERSON_FEATURES)[number];

/** The features switched off for a person (Person.featuresOff, a JSON list). */
export function personFeaturesOff(raw: string | null | undefined): Set<PersonFeature> {
  if (!raw) return new Set();
  try {
    const list = JSON.parse(raw);
    return new Set((Array.isArray(list) ? list : []).filter((f): f is PersonFeature => (PERSON_FEATURES as readonly string[]).includes(f)));
  } catch {
    return new Set();
  }
}

export const personFeatureOn = (person: { featuresOff?: string | null }, feature: PersonFeature) => !personFeaturesOff(person.featuresOff).has(feature);
