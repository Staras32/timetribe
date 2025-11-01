export type Profile = {
  id: string;
  display_name: string | null;
  languages: string[] | null;
  skills: string[] | null;
  reputation?: number | null;
  role?: string | null;
};

export function scoreMatch(learner: Profile, mentor: Profile) {
  let score = 0;
  const lLangs = learner.languages || [];
  const mLangs = mentor.languages || [];
  const lSkills = learner.skills || [];
  const mSkills = mentor.skills || [];

  // Kalbų sutapimas
  const langOverlap = mLangs.filter((l) => lLangs.includes(l)).length;
  score += langOverlap * 3;

  // Įgūdžių atitikimas (mentorius turi tai, ko nori learneris)
  const skillOverlap = mSkills.filter((s) => lSkills.includes(s)).length;
  score += skillOverlap * 5;

  // Reputacija
  score += mentor.reputation || 0;

  return score;
}

export function pickTopMentors(learner: Profile, mentors: Profile[], k = 5) {
  return mentors
    .map((m) => ({ ...m, _score: scoreMatch(learner, m) as number }))
    .sort((a, b) => (b._score as number) - (a._score as number))
    .slice(0, k);
}
