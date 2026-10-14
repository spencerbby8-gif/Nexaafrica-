export interface SharedProfileData {
  full_name: string | null
  country: string | null
  headline: string | null
  summary: string | null
}

/** Explicit allowlist: future private columns must never cross the sharing boundary. */
export function toSharedProfile(profile: SharedProfileData): SharedProfileData {
  return {
    full_name: profile.full_name,
    country: profile.country,
    headline: profile.headline,
    summary: profile.summary,
  }
}
