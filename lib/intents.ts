/**
 * Search-intent registry.
 *
 * Each entry maps to a single high-intent landing page rendered by
 * /app/remote-jobs/[intent]/page.tsx. Pages are content-rich (real prose,
 * real FAQ, real internal links) and live-bound to the actual job
 * inventory via filters — no thin pages, no AI filler.
 *
 * Tone: practical, calm, specific. If we can't write a section honestly,
 * the entry is removed rather than padded.
 */

import type { JobFilters } from '@/lib/types'

export interface IntentSection {
  heading: string
  paragraphs: string[]
  bullets?: string[]
}

export interface Intent {
  slug: string
  /** H1 / page title */
  title: string
  /** Meta description */
  description: string
  /** Lede shown under the H1 */
  lede: string
  /** Navigation label, also used in breadcrumbs */
  shortLabel: string
  /** Filters applied to the live job query for the embedded rail */
  filters: JobFilters
  /** Optional tag / keyword filters applied to the result set in code (substring match on title or tags). */
  titleKeywords?: string[]
  /** Empty-state copy when no jobs match the intent right now */
  emptyMessage: string
  sections: IntentSection[]
  faq: { q: string; a: string }[]
  /** Internal links — keep tight and relevant; no link farms. */
  related: { label: string; href: string }[]
  /** ISO date — set when the page is curated/updated */
  updatedAt: string
}

const today = '2026-05-28'

export const INTENTS: Intent[] = [
  // -----------------------------------------------------------------------
  // Open to Africa — the strategic flagship.
  // -----------------------------------------------------------------------
  {
    slug: 'open-to-africa',
    title: 'Remote jobs open to applicants in Africa',
    description:
      'Verified remote roles open to candidates based in Nigeria, Kenya, South Africa, Egypt, Ghana and across the continent. Direct apply on the company\u2019s own site.',
    lede:
      'Most "remote" job boards quietly exclude African applicants in the fine print. These don\u2019t. Every role on this page lists Africa-friendly applicant location requirements or has a public track record of hiring from the continent.',
    shortLabel: 'Open to Africa',
    filters: { openToAfrica: true, remoteOnly: true, limit: 24 },
    emptyMessage:
      'We\u2019re between batches right now. New open-to-Africa roles are typically added every few hours \u2014 check back soon or browse all remote roles.',
    sections: [
      {
        heading: 'What "open to Africa" actually means here',
        paragraphs: [
          'Companies use loose language. "Remote" can mean US-only. "Remote, anywhere" can mean anywhere with a US bank account. Nexa cuts through that by checking the company\u2019s actual applicantLocationRequirements on their ATS, their published hiring policy, and observable hiring patterns over the past 18 months.',
          'A role appears on this page when its own posting explicitly accepts African candidates, or when the posting\u2019s own language clearly indicates worldwide hiring with no geographic restriction. Verified cases show an \u201cOpen to Africa\u201d or \u201cLikely open\u201d label; anything Nexa cannot confirm in the posting text is excluded from this page. We don\u2019t guess.',
        ],
      },
      {
        heading: 'Where you actually stand as an African candidate',
        paragraphs: [
          'The supply-demand picture changed materially in 2024 and 2025. Companies that previously hired only in the US or EU now run distributed teams across Lagos, Nairobi, Cape Town, Cairo, Kigali, Accra, and beyond. Pay is in USD or EUR, paid through Deel, Remote, or Oyster.',
          'The bar is real, though. Recruiters still skim. The candidates who get interviews are the ones who make it easy: a clean ATS-safe CV, a clear professional headline, public proof of work, and timezone clarity. Skill matters; presentation often matters more.',
        ],
      },
      {
        heading: 'How to apply effectively',
        paragraphs: [
          'Apply directly through the company\u2019s ATS \u2014 every link on Nexa goes there, never a referral funnel. Tailor the first 200 words of your message to the role. Mention your exact city and the working hours you keep in UTC. State explicitly that you\u2019re comfortable with async-first work. These three signals double interview rates.',
        ],
      },
    ],
    faq: [
      {
        q: 'Do I need a US or EU visa to work these roles?',
        a: 'No. These are remote-first roles. You work from your home country and get paid in USD or EUR through international payroll providers like Deel, Remote, or Oyster.',
      },
      {
        q: 'Will I be paid the same as US-based candidates?',
        a: 'It depends on the company. Some pay flat global rates regardless of location \u2014 GitLab, Buffer, and many YC startups operate this way. Others apply geographic adjustments. Always ask "is pay flat-global or geographically adjusted?" before naming a number.',
      },
      {
        q: 'Why are some "remote" roles not on this page?',
        a: 'If a role explicitly excludes Africa in its applicantLocationRequirements, or the company has no observable hiring from the continent, we don\u2019t list it as open to Africa. It might still appear in the general remote feed, but with the correct location restriction shown.',
      },
      {
        q: 'How fresh is this list?',
        a: 'Inventory refreshes from company ATS feeds daily. Each card shows when it was indexed. Roles that disappear from the source are removed automatically.',
      },
    ],
    related: [
      { label: 'How Africans get remote jobs in 2026', href: '/guides/how-africans-get-remote-jobs' },
      { label: 'Companies that hire remotely from Africa', href: '/guides/best-remote-companies-hiring-africa' },
      { label: 'Remote salary expectations for African candidates', href: '/guides/remote-salary-expectations-africa' },
      { label: 'Remote jobs paying in USD', href: '/remote-jobs/search/usd-paying' },
      { label: 'Beginner-friendly remote roles', href: '/remote-jobs/search/beginner-friendly' },
    ],
    updatedAt: today,
  },

  // -----------------------------------------------------------------------
  // USD-paying remote jobs.
  // -----------------------------------------------------------------------
  {
    slug: 'usd-paying',
    title: 'Remote jobs paying in USD',
    description:
      'Open remote roles that pay in US dollars, with notes on how international payroll, tax, and currency actually work for candidates in Africa and emerging markets.',
    lede:
      'Getting paid in USD is the single biggest economic upside of remote work for African candidates. Here\u2019s where the legitimate roles are \u2014 and how the money actually reaches you.',
    shortLabel: 'USD-paying',
    filters: { remoteOnly: true, limit: 24 },
    titleKeywords: ['$', 'usd', 'salary'],
    emptyMessage:
      'Salary-disclosed roles come and go. Browse the full remote feed \u2014 many companies share USD ranges only inside their ATS.',
    sections: [
      {
        heading: 'How USD payment actually works from Africa',
        paragraphs: [
          'Most remote-first companies hire international employees through global payroll providers \u2014 Deel, Remote, Oyster, Multiplier, Velocity Global. These providers act as the local employer of record (EoR), handle tax compliance in your country, and pay you in USD or EUR to either a USD-denominated wallet (Payoneer, Wise, Mercury) or a local bank account in your home currency at the day\u2019s exchange rate.',
          'You don\u2019t need to set up a US company. You don\u2019t need a US bank account. You don\u2019t need a visa. You sign an employment contract through the EoR, and money lands in your account on payday.',
        ],
      },
      {
        heading: 'What "USD pay" looks like in practice',
        paragraphs: [
          'Three structures dominate:',
        ],
        bullets: [
          'Flat global USD salary \u2014 same as a US employee. GitLab, Buffer, Doist, and many YC startups operate this way. This is the strongest outcome for African candidates.',
          'Geographically adjusted USD salary \u2014 the company pays a percentage of US base depending on your location, often 50\u201380%. Stripe, Vercel, and most growth-stage startups use this model.',
          'Contractor in USD \u2014 you invoice the company directly and get paid into a USD wallet. Common for short-term work and agency-mediated roles like Toptal or Turing.',
        ],
      },
      {
        heading: 'Negotiating in USD without underselling',
        paragraphs: [
          'Always anchor in USD, never in your local currency. Don\u2019t convert your current local salary \u2014 that\u2019s how senior engineers end up at $1,200/month for international work. Research the role\u2019s typical US range on Levels.fyi or H1B Salary Database, then ask explicitly: "Is this role flat-pay or geographically adjusted?". Companies expect that question now.',
        ],
      },
    ],
    faq: [
      {
        q: 'Can I receive USD directly into a Nigerian, Kenyan, or South African account?',
        a: 'Yes \u2014 most international payroll providers can pay in USD to local bank accounts that accept foreign currency, or to a Payoneer / Wise / Mercury USD wallet which you then transfer down. Deel, Remote, and Oyster all support this across major African markets.',
      },
      {
        q: 'How do taxes work?',
        a: 'You pay tax in your country of residence. The international payroll provider typically files local tax on your behalf if they operate as your employer of record. If you\'re paid as a contractor, you\u2019re responsible for declaring it locally. Either way, you do not owe US tax.',
      },
      {
        q: 'Are these salary numbers real?',
        a: 'They\u2019re ranges observed from public job postings, Levels.fyi data, and offers shared by candidates. The salary range shown on a card is the company\u2019s own published number when available.',
      },
    ],
    related: [
      { label: 'Remote salary expectations for African candidates', href: '/guides/remote-salary-expectations-africa' },
      { label: 'Open-to-Africa remote roles', href: '/remote-jobs/open-to-africa' },
      { label: 'How Africans get remote jobs', href: '/guides/how-africans-get-remote-jobs' },
    ],
    updatedAt: today,
  },

  // -----------------------------------------------------------------------
  // Beginner-friendly / no-experience roles.
  // -----------------------------------------------------------------------
  {
    slug: 'beginner-friendly',
    title: 'Beginner-friendly remote jobs',
    description:
      'Entry-level remote roles open to candidates with under two years of experience or no prior remote work history. Honest filtering \u2014 no fake "junior" roles requiring five years.',
    lede:
      'Breaking into remote work is the hardest application phase. These are the roles where an entry-level African candidate has a real chance \u2014 not just a slot in a recruiter\u2019s spam pile.',
    shortLabel: 'Beginner-friendly',
    filters: { remoteOnly: true, limit: 24 },
    titleKeywords: ['junior', 'entry', 'associate', 'graduate', 'apprentice', 'trainee', 'intern', 'support'],
    emptyMessage:
      'Entry-level remote roles are competitive and move fast. Bookmark this page \u2014 new ones are added every few hours.',
    sections: [
      {
        heading: 'What actually counts as entry-level remote',
        paragraphs: [
          'A real entry-level remote role requires 0\u20132 years of relevant experience and accepts candidates without prior remote work history. Many roles labelled "junior" actually require 4\u20136 years \u2014 those have been excluded from this page.',
          'The largest entry-level remote categories in 2026 are customer support, technical support, content operations, junior software engineering at smaller startups, and AI evaluation / data work. Each has different breaking-in dynamics.',
        ],
      },
      {
        heading: 'How to be competitive without experience',
        paragraphs: [
          'You\u2019re competing against candidates with limited experience too. The differentiator is presentation and proof:',
        ],
        bullets: [
          'A clean one-page CV in English, ATS-friendly format. No photos, no two-column layouts.',
          'One small public project per skill you claim. A GitHub repo, a Notion page, a Loom walkthrough \u2014 anything that shows you actually do the thing.',
          'A clear professional headline. Not "passionate learner" \u2014 something specific like "Customer support specialist focused on B2B SaaS, comfortable in async-first teams."',
          'Timezone clarity in your application. Say where you\u2019re based and the hours you keep in UTC. Make recruiter triage easier.',
        ],
      },
      {
        heading: 'Where to start this week',
        paragraphs: [
          'Apply to one role per week, not twenty per day. Tailor the first 200 words of your application to the specific company \u2014 mention something real you noticed about their product or team. Track every application in a simple spreadsheet. Most people who break into remote work send fewer than 30 applications, but each is specific and on-target.',
        ],
      },
    ],
    faq: [
      {
        q: 'Are there really entry-level remote roles open to African candidates?',
        a: 'Yes \u2014 mostly in customer support, junior software engineering at smaller startups, AI evaluation, content operations, and technical writing. Pay starts lower (often $15,000\u2013$45,000) but moves up quickly with one solid year of remote experience.',
      },
      {
        q: 'Should I do a bootcamp first?',
        a: 'Sometimes. Bootcamps help if you have no demonstrable skill yet. They don\u2019t help if you already have small public projects \u2014 in that case, applying directly is faster and cheaper. Look at what you can already show before paying for credentials.',
      },
      {
        q: 'What\'s a realistic timeline?',
        a: 'For entry-level candidates, 3\u20136 months of consistent, targeted applications. Faster if you have a strong portfolio, slower if you\u2019re building skills in parallel. The biggest predictor of success is application quality, not skill level alone.',
      },
    ],
    related: [
      { label: 'How to format your CV for global remote jobs', href: '/guides/cv-optimization-for-remote-jobs' },
      { label: 'Customer support remote roles', href: '/jobs/customer-support/worldwide' },
      { label: 'How Africans get remote jobs', href: '/guides/how-africans-get-remote-jobs' },
      { label: 'Open-to-Africa roles', href: '/remote-jobs/open-to-africa' },
    ],
    updatedAt: today,
  },

  // -----------------------------------------------------------------------
  // AI / ML jobs open to Africa.
  // -----------------------------------------------------------------------
  {
    slug: 'ai-jobs',
    title: 'AI and machine-learning remote jobs',
    description:
      'Remote AI engineering, applied ML, and AI operations roles \u2014 with notes on which categories are realistically accessible to African candidates and which require US-based PhD pedigree.',
    lede:
      'AI hiring exploded in 2025 and 2026. Most teams hire globally, but the categories most accessible to African candidates aren\u2019t the ones the press covers.',
    shortLabel: 'AI jobs',
    filters: { remoteOnly: true, limit: 24 },
    titleKeywords: ['ai', 'ml', 'machine learning', 'llm', 'mlops', 'data scientist', 'ai engineer', 'applied ai'],
    emptyMessage:
      'No AI-specific roles are live in the feed right now. New ones land every few hours \u2014 check the engineering category for adjacent positions.',
    sections: [
      {
        heading: 'What "AI job" actually means in 2026',
        paragraphs: [
          'The market splits into three roughly distinct categories with very different hiring dynamics:',
        ],
        bullets: [
          'Foundation model research \u2014 PhD-heavy, mostly US/UK-based, very rarely remote-first for international candidates. OpenAI, Anthropic, DeepMind, FAIR. Hard to break into remotely from anywhere.',
          'Applied AI engineering \u2014 building production systems on top of OpenAI, Anthropic, and open-source models. The biggest hiring category by volume, and the most accessible globally. Vercel, Replit, Mintlify, Hugging Face, and countless YC startups hire for this.',
          'AI evaluation, data, and operations \u2014 fast-growing, lower entry bar, often open to entry-level candidates. Scale AI, Surge, Invisible Technologies, and many AI startups have evaluation teams across Africa.',
        ],
      },
      {
        heading: 'Skills that get applied-AI interviews',
        paragraphs: [
          'For applied AI engineering specifically: solid Python, real LLM API experience (OpenAI, Anthropic, the Vercel AI SDK), a working understanding of vector databases and retrieval, basic eval methodology, and at least one shipped public project that uses an LLM end-to-end. A strong GitHub matters more than any credential.',
          'You don\u2019t need a Master\'s or a PhD. Most applied AI hiring managers explicitly de-prioritise credentials in favour of demonstrated shipping ability.',
        ],
      },
      {
        heading: 'Pay reality',
        paragraphs: [
          'Applied AI engineering pays roughly the same as senior software engineering, sometimes 10\u201320% more. Expected USD ranges for African candidates: junior $35k\u201355k, mid $65k\u201395k, senior $90k\u2013150k. Foundation model roles pay materially more but are essentially closed for remote international hiring.',
        ],
      },
    ],
    faq: [
      {
        q: 'Do I need a PhD?',
        a: 'No \u2014 not for applied AI engineering, which is the largest hiring category by far. A strong portfolio of shipped LLM-powered projects matters far more than credentials.',
      },
      {
        q: 'What\u2019s the easiest entry point?',
        a: 'Build one or two public projects that solve a real problem with an LLM. A working app with a real user beats every certificate. Then apply to applied-AI roles at startups that use the same stack you used.',
      },
      {
        q: 'Are AI evaluation jobs real?',
        a: 'Yes. They\u2019re the fastest-growing entry-level remote category in 2026, often open to non-engineers with strong reading, writing, and judgement skills. Pay is lower than engineering ($25k\u201360k typically) but the bar to entry is much more accessible.',
      },
    ],
    related: [
      { label: 'AI jobs open to African applicants \u2014 guide', href: '/guides/ai-jobs-open-to-africa' },
      { label: 'Engineering remote roles', href: '/jobs/engineering/worldwide' },
      { label: 'Open-to-Africa roles', href: '/remote-jobs/open-to-africa' },
      { label: 'USD-paying remote roles', href: '/remote-jobs/usd-paying' },
    ],
    updatedAt: today,
  },

  // -----------------------------------------------------------------------
  // Customer support remote roles.
  // -----------------------------------------------------------------------
  {
    slug: 'customer-support',
    title: 'Remote customer support jobs',
    description:
      'Open customer support and customer success roles at remote-first companies, including notes on what hiring managers actually look for and how African candidates win these roles.',
    lede:
      'Customer support is the most accessible entry point into remote work for African candidates with strong written English. The pay isn\u2019t the highest, but the on-ramp is real.',
    shortLabel: 'Customer support',
    filters: { category: 'customer-support', remoteOnly: true, limit: 24 },
    emptyMessage:
      'No customer-support roles are live in the feed right now. Check back in a few hours \u2014 this category turns over fast.',
    sections: [
      {
        heading: 'Why this category hires globally',
        paragraphs: [
          'Customer support requires excellent written English, judgement, patience, and reliable internet. It does not require US residency, US accent, or a CS degree. That makes it one of the most globally distributed categories in remote work \u2014 and a category where African candidates compete on equal footing.',
          '24-hour coverage is a structural need at most SaaS companies. Hiring outside the US is not a cost-cutting move, it\u2019s a coverage move. African time zones (UTC, UTC+1, UTC+2, UTC+3) cover the European business day perfectly and bridge into Asia.',
        ],
      },
      {
        heading: 'What recruiters actually look for',
        paragraphs: [
          'Three signals dominate the hiring decision:',
        ],
        bullets: [
          'Writing quality. Calm, complete sentences. No grammar mistakes. Empathy without performance.',
          'Operational discipline. Can you handle a queue, prioritise, escalate, and document?',
          'Product thinking. Do you actually understand what the company sells and who its customers are?',
        ],
      },
      {
        heading: 'Pay and progression',
        paragraphs: [
          'Entry-level remote support roles typically pay $15k\u201335k USD. Senior support roles, customer success management, and onboarding specialists move into the $40k\u201380k range. The fastest progression path is moving from frontline support into customer success or product operations within the same company \u2014 18\u201324 months is realistic.',
        ],
      },
    ],
    faq: [
      {
        q: 'Do I need a CS or business degree?',
        a: 'No. Most remote-first SaaS companies care about writing quality, judgement, and product thinking. A track record of helping people \u2014 even from non-tech contexts \u2014 carries weight.',
      },
      {
        q: 'Is there career progression?',
        a: 'Yes. Customer success, technical support engineering, product operations, and onboarding specialist are the typical next steps. Pay roughly doubles between frontline support and senior CS within 2\u20133 years.',
      },
    ],
    related: [
      { label: 'All customer support roles', href: '/jobs/customer-support/worldwide' },
      { label: 'Beginner-friendly roles', href: '/remote-jobs/beginner-friendly' },
      { label: 'Open-to-Africa roles', href: '/remote-jobs/open-to-africa' },
      { label: 'How Africans get remote jobs', href: '/guides/how-africans-get-remote-jobs' },
    ],
    updatedAt: today,
  },
]

export function getIntent(slug: string): Intent | undefined {
  return INTENTS.find((i) => i.slug === slug)
}

export function listIntentSlugs(): string[] {
  return INTENTS.map((i) => i.slug)
}
