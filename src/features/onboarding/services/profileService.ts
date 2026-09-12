import { supabase } from '../../../lib/supabase/client.ts';
import type { Tables } from '../../../lib/supabase/types.generated.ts';

/**
 * The student's own profile. One row, owned by them, guarded by `own_profile`.
 *
 * There is no database trigger creating this row on sign-up, deliberately: the
 * row is written when onboarding is answered, so an unanswered profile is
 * simply absent rather than present and empty.
 */

export type Profile = Tables<'profiles'>;

export type LevelScale = 'ielts' | 'cefr' | 'unsure';
export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface OnboardingAnswers {
  fullName: string;
  levelScale: LevelScale;
  /** Present only when the scale is 'ielts'. */
  currentBand: number | null;
  /** Present only when the scale is 'cefr'. */
  cefrLevel: CefrLevel | null;
  targetBand: number | null;
}

export async function fetchMyProfile(): Promise<Profile | null> {
  const { data: auth } = await supabase.auth.getUser();
  const id = auth.user?.id;
  if (!id) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Writes the answers and marks onboarding finished in one upsert.
 *
 * The columns the chosen scale does not use are written as null rather than
 * left alone, so re-running onboarding after switching from CEFR to IELTS
 * cannot leave both populated — which the table's own check constraint would
 * reject anyway.
 */
export async function completeOnboarding(answers: OnboardingAnswers): Promise<Profile> {
  const { data: auth } = await supabase.auth.getUser();
  const id = auth.user?.id;
  if (!id) throw new Error('You must be signed in to finish setting up your account.');

  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      id,
      full_name: answers.fullName.trim(),
      level_scale: answers.levelScale,
      current_band: answers.levelScale === 'ielts' ? answers.currentBand : null,
      cefr_level: answers.levelScale === 'cefr' ? answers.cefrLevel : null,
      target_band: answers.targetBand,
      onboarded_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}
