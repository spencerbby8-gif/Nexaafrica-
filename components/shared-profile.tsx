import type { ProfileExperience } from '@/lib/profile/types'

import type { SharedProfileData } from "@/lib/profile/public"

/** Server-only presentation. No owner controls, raw CV, storage path, or share token. */
export function SharedProfile({ profile, skills, experience }: {
  profile: SharedProfileData
  skills: string[]
  experience: ProfileExperience[]
}) {
  return (
    <article className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
      <header className="border-b border-border pb-6">
        <h1 className="text-3xl font-semibold">{profile.full_name || 'Professional profile'}</h1>
        {profile.headline && <p className="mt-3 text-lg">{profile.headline}</p>}
        {profile.country && <p className="mt-2 text-sm text-muted-foreground">{profile.country}</p>}
      </header>
      {profile.summary && <section className="mt-8"><h2 className="text-lg font-semibold">Summary</h2><p className="mt-3 whitespace-pre-line text-muted-foreground">{profile.summary}</p></section>}
      {skills.length > 0 && <section className="mt-8"><h2 className="text-lg font-semibold">Skills</h2><ul className="mt-3 flex flex-wrap gap-2">{skills.map(skill => <li key={skill} className="rounded-full border border-border px-3 py-1 text-sm">{skill}</li>)}</ul></section>}
      {experience.length > 0 && <section className="mt-8"><h2 className="text-lg font-semibold">Experience</h2><div className="mt-4 space-y-6">{experience.map((role, index) => <section key={index}><h3 className="font-medium">{role.title}</h3><p className="text-sm text-muted-foreground">{role.company} · {[role.start_date, role.end_date].filter(Boolean).join(' — ')}</p>{role.description && <p className="mt-2 whitespace-pre-line text-sm">{role.description}</p>}</section>)}</div></section>}
    </article>
  )
}
