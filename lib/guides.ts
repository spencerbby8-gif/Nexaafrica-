/**
 * Authority-content registry.
 *
 * Guides are structured TypeScript objects — not a CMS — so they ship with
 * the codebase, get strong type safety, and stay solo-founder maintainable.
 * Each guide is rendered through a single dynamic route (/guides/[slug]) and
 * gets full Article + FAQPage JSON-LD.
 *
 * Tone rules: practical, specific, calm. No SEO filler. No keyword stuffing.
 * If a guide can't be written usefully, it doesn't get added.
 */

export interface GuideSection {
  /** Short heading rendered as <h2>. */
  heading: string
  /** One or more paragraphs. Markdown is intentionally not parsed — keep it plain. */
  paragraphs: string[]
  /** Optional list of bullets rendered after paragraphs. */
  bullets?: string[]
}

export interface Guide {
  slug: string
  title: string
  description: string
  /** Lede shown under the headline. 1-2 sentences. */
  lede: string
  /** Author credit shown in the footer. Keep simple. */
  author?: string
  /** ISO date strings. */
  publishedAt: string
  updatedAt?: string
  /** Reading time in minutes — calculated, not faked. */
  readMinutes: number
  sections: GuideSection[]
  /** Question + answer pairs powering FAQPage JSON-LD. */
  faq?: { q: string; a: string }[]
  /** Internal links shown in the related rail. */
  related?: { label: string; href: string }[]
}

const today = '2026-05-27'

export const GUIDES: Guide[] = [
  {
    slug: 'how-africans-get-remote-jobs',
    title: 'How Africans get remote jobs in 2026',
    description:
      'A practical breakdown of how candidates from Nigeria, Kenya, South Africa and across the continent are getting hired by remote-first companies — what works, what doesn\'t, and how to start.',
    lede: 'Most candidates don\'t lose remote roles to skill gaps. They lose them to formatting, timezone fit, and trust signals recruiters can\'t verify in 30 seconds.',
    publishedAt: today,
    readMinutes: 7,
    sections: [
      {
        heading: 'The shift is real, but uneven',
        paragraphs: [
          'Remote hiring across Africa has changed materially since 2022. Companies like GitLab, Toptal, Andela, Turing, and a long tail of YC startups now actively employ engineers, designers, and operators based in Lagos, Nairobi, Cape Town, and Cairo. Pay is in USD or EUR. Onboarding is fully remote.',
          'But the bar is higher than it looks. Recruiters get hundreds of applications per role. They scan, they don\'t read. The candidates who get interviews aren\'t the most credentialed — they\'re the easiest to assess in 30 seconds.',
        ],
      },
      {
        heading: 'What actually gets you hired',
        paragraphs: [
          'There are five things recruiters consistently look for, and any African candidate who handles them well is already in the top 20% of applicants:',
        ],
        bullets: [
          'A CV in English, formatted for global ATS systems (no photos, no graphics, no two-column layouts).',
          'A clear professional headline — what you do, not where you went to school.',
          'Public proof of work — GitHub, Dribbble, a personal site, or a real product with your name on it.',
          'Timezone clarity — say where you work from and what hours you keep. Don\'t let recruiters guess.',
          'A real reason you\'re a fit. Not "I\'m passionate about your mission." A specific reason.',
        ],
      },
      {
        heading: 'Where to find legitimate opportunities',
        paragraphs: [
          'Avoid Telegram channels, paid "remote job" newsletters, and recruiters who ask for application fees. Real remote jobs are listed on company career sites and a handful of public boards.',
          'Nexa indexes reviewed remote roles open to candidates in Africa, with direct apply links to the company\'s own ATS. We never charge candidates and we don\'t hide salary information when the company published it.',
        ],
      },
      {
        heading: 'How to start, this week',
        paragraphs: [
          'Pick three companies that actually hire from your country. Check their career page. Apply to one role per week with a tailored note. Track every application in a simple spreadsheet. Most people who get hired remotely sent fewer than 30 applications — but each was specific, well-written, and on-target.',
        ],
      },
    ],
    faq: [
      {
        q: 'Do I need a US or EU work visa for these jobs?',
        a: 'No. The roles on Nexa are remote-first. You work from your home country. Companies pay you in USD or EUR through international payroll providers like Deel or Remote.',
      },
      {
        q: 'Do African candidates get paid less than US or EU candidates?',
        a: 'Sometimes, depending on the company. Many remote-first startups pay flat rates regardless of location. Others apply geographic adjustments. Always ask directly during the interview — companies expect this question.',
      },
      {
        q: 'How long does it take to get a first remote job?',
        a: 'For experienced candidates with a clear portfolio, often 4-8 weeks. For entry-level candidates, plan for 3-6 months. The biggest variable is application quality, not skill level.',
      },
    ],
    related: [
      { label: 'Improve your CV for global remote jobs', href: '/guides/cv-optimization-for-remote-jobs' },
      { label: 'Remote interview preparation', href: '/guides/remote-interview-preparation' },
      { label: 'Companies hiring remote in Africa', href: '/companies' },
    ],
  },
  {
    slug: 'cv-optimization-for-remote-jobs',
    title: 'How to format your CV for global remote jobs',
    description:
      'Most CVs from African candidates fail in the first 10 seconds — not because of weak experience, but because of formatting recruiters can\'t parse. Here\'s how to fix that.',
    lede: 'A globally readable CV is one page, plain, and structured. No photos. No graphics. No two-column layouts. Recruiters skim — make it easy.',
    publishedAt: today,
    readMinutes: 6,
    sections: [
      {
        heading: 'Why most CVs get rejected before being read',
        paragraphs: [
          'Most companies use an ATS — applicant tracking system — that parses your CV into structured fields before a human sees it. If your file is a designer-style PDF with two columns, icons, and a profile photo, the ATS often pulls in garbage. Your application is filtered out before anyone reads it.',
          'The fix is boring and effective: a single-column, plain-text-friendly CV with clear section headings. This is how senior engineers at Stripe, Vercel, and Linear format theirs.',
        ],
      },
      {
        heading: 'The structure that works',
        paragraphs: [
          'Top to bottom, in this order:',
        ],
        bullets: [
          'Name, role headline, location (city + country), email, one professional link (LinkedIn or personal site).',
          'A 2-3 line summary of what you do and what you\'re looking for.',
          'Experience, most recent first. Company, role, dates, 2-4 bullets per role focused on outcomes, not duties.',
          'Skills — a short, honest list. No skill bars. No percentages.',
          'Education and certifications — short, factual.',
        ],
      },
      {
        heading: 'What to remove',
        paragraphs: [
          'Profile photos. Date of birth. Marital status. Religion. Nationality (unless directly relevant). Hobbies. References available on request. Skill bars. Star ratings. Anything that makes the file harder to parse.',
        ],
      },
      {
        heading: 'What recruiters actually want to see',
        paragraphs: [
          'Outcomes, not duties. Replace "Responsible for managing customer queries" with "Resolved 40+ customer queries per day with 95% satisfaction." Numbers, scope, and impact — even when small.',
          'If you\'ve never had a remote job before, that\'s fine. Recruiters know how to read CVs from candidates breaking in. What they don\'t want is to spend 30 seconds decoding a fancy template.',
        ],
      },
    ],
    faq: [
      {
        q: 'Should I use a Canva or Notion CV template?',
        a: 'Avoid Canva templates with two-column layouts, icons, and color blocks. They look polished but break ATS parsing. A plain Google Docs or Word template is better. Nexa\'s CV transformation tool generates an ATS-safe version automatically.',
      },
      {
        q: 'How long should my CV be?',
        a: 'One page if you have under 8 years of experience. Two pages maximum after that. Longer CVs almost always signal weak editing.',
      },
      {
        q: 'Do I need a cover letter?',
        a: 'Most remote-first companies don\'t require one. When they do, keep it under 200 words and make it specific to the role. Generic cover letters hurt more than they help.',
      },
    ],
    related: [
      { label: 'How Africans get remote jobs', href: '/guides/how-africans-get-remote-jobs' },
      { label: 'Remote interview preparation', href: '/guides/remote-interview-preparation' },
      { label: 'Transform your CV with Nexa', href: '/onboarding' },
    ],
  },
  {
    slug: 'remote-interview-preparation',
    title: 'How to prepare for a remote job interview',
    description:
      'Remote interviews are different. Camera quality, internet stability, and async communication signals matter as much as technical skill. A practical guide.',
    lede: 'In a remote interview, recruiters are also evaluating whether you can survive remote work. The interview is the first signal.',
    publishedAt: today,
    readMinutes: 5,
    sections: [
      {
        heading: 'What\'s actually being assessed',
        paragraphs: [
          'A remote interview tests three things: your skill, your communication, and your remote-work readiness. Most candidates prepare for the first and ignore the other two.',
          'Companies have learned the hard way that a great engineer who can\'t communicate async, or whose internet drops every five minutes, is not actually hireable remotely.',
        ],
      },
      {
        heading: 'Setup that signals professionalism',
        paragraphs: [
          'Test the basics 30 minutes before the call:',
        ],
        bullets: [
          'A wired headset or known-good Bluetooth headphones — never laptop speakers.',
          'A wired internet connection if possible, or a known-good 5G/4G hotspot as backup.',
          'Camera at eye level. Good lighting on your face, not behind you.',
          'A quiet, plain background. Generators, traffic, and family noise are normal across Africa — recruiters know this. Mute aggressively.',
        ],
      },
      {
        heading: 'Communication signals that matter',
        paragraphs: [
          'Speak in clear, complete sentences. If you don\'t understand a question, say so and ask for clarification — this is a positive signal in remote work, not a weakness.',
          'When you don\'t know something, say "I don\'t know, but here\'s how I\'d find out." Faking knowledge is the fastest way to lose a remote offer.',
        ],
      },
      {
        heading: 'Questions you should ask back',
        paragraphs: [
          'How is the team structured across timezones? What does an average week look like async? How are decisions made and documented? What does the first 30 days look like? These questions signal that you understand remote work and care about doing the job well.',
        ],
      },
    ],
    faq: [
      {
        q: 'My power and internet are unreliable. Should I disclose that?',
        a: 'Yes, calmly. Most African remote workers have backup setups — generators, inverters, multiple ISPs. Mention what your backup looks like. Recruiters respect candidates who plan for this rather than hide it.',
      },
      {
        q: 'Should I dress formally?',
        a: 'A clean shirt and decent lighting outperform a suit. Most remote teams are casual. Match the company\'s vibe — check their about page.',
      },
    ],
    related: [
      { label: 'Improve your CV for global remote jobs', href: '/guides/cv-optimization-for-remote-jobs' },
      { label: 'Browse open remote roles', href: '/jobs' },
    ],
  },
  {
    slug: 'remote-salary-expectations-africa',
    title: 'Remote salary expectations for African candidates',
    description:
      'Honest pay ranges for remote engineering, design, and operations roles open to candidates from Nigeria, Kenya, South Africa, and across the continent.',
    lede: 'Remote pay for African candidates varies more than any other variable in hiring. Knowing the actual ranges is the difference between underselling and getting ignored.',
    publishedAt: today,
    readMinutes: 6,
    sections: [
      {
        heading: 'How remote pay actually works',
        paragraphs: [
          'There are three pay models you\'ll encounter as a remote candidate:',
        ],
        bullets: [
          'Flat global pay — the company pays the same regardless of location. Common at GitLab, Buffer, and many YC startups. Best outcome for African candidates.',
          'Geographic adjustment — the company pays a percentage of US salary based on cost of living. Typical at Stripe, Vercel, and most growth-stage startups. African candidates usually receive 50-70% of the US base.',
          'Local-rate contracting — paid as a contractor in local currency or USD at local market rates. Most common via agencies like Andela or Toptal. Lowest comp, highest volume.',
        ],
      },
      {
        heading: 'Typical USD ranges in 2026',
        paragraphs: [
          'These are real ranges from public sources and observed offers, not theoretical maxes. Numbers below are annual base, in USD, for fully-remote roles open to African candidates.',
        ],
        bullets: [
          'Junior software engineer (0-2 years): $20,000 - $45,000',
          'Mid-level software engineer (3-5 years): $45,000 - $85,000',
          'Senior software engineer (6+ years): $80,000 - $160,000',
          'Junior designer (0-2 years): $18,000 - $40,000',
          'Senior product designer: $70,000 - $130,000',
          'Customer support specialist: $15,000 - $35,000',
          'Operations manager: $40,000 - $90,000',
        ],
      },
      {
        heading: 'How to negotiate from Africa',
        paragraphs: [
          'Always ask: "Is this role flat-pay or geographically adjusted?" before naming a number. If they refuse to share the model, that\'s a signal.',
          'Anchor in USD, not local currency. Don\'t convert to your local salary expectations — that\'s how candidates end up at $1,200/month for senior work.',
        ],
      },
    ],
    faq: [
      {
        q: 'How do I get paid in USD legally from my country?',
        a: 'Most companies use international payroll services like Deel, Remote, Oyster, or Payoneer. They handle local tax compliance and pay you directly in USD or EUR to a local or global account.',
      },
      {
        q: 'Are these numbers realistic for entry-level candidates?',
        a: 'Entry-level remote roles open to African candidates exist but are competitive. Expect to start at the lower end of these ranges and move up quickly with one solid year of remote work experience.',
      },
    ],
    related: [
      { label: 'How Africans get remote jobs', href: '/guides/how-africans-get-remote-jobs' },
      { label: 'Engineering roles', href: '/jobs/engineering/worldwide' },
      { label: 'Companies hiring remote in Africa', href: '/companies' },
    ],
  },
  {
    slug: 'best-remote-companies-hiring-africa',
    title: 'Companies that genuinely hire remote talent from Africa',
    description:
      'A short, honest list of companies with track records of hiring engineers, designers, and operators based in Africa — with notes on what each is actually like.',
    lede: 'Most "remote companies" don\'t actually hire from Africa. These do — and we\'ve verified each one through public hiring activity.',
    publishedAt: today,
    readMinutes: 5,
    sections: [
      {
        heading: 'How we built this list',
        paragraphs: [
          'We tracked public hiring announcements, employee location signals on LinkedIn, and direct apply pages over the past 18 months. Every company below has hired at least one person based in Africa for a fully-remote role within that window.',
          'This list is not exhaustive and not paid placement. Nexa never accepts payment for inclusion.',
        ],
      },
      {
        heading: 'Engineering-heavy teams',
        paragraphs: [
          'Vercel, Linear, Supabase, GitLab, Sourcegraph, PostHog, Plausible, Hashnode, Cal.com, and Cloudflare have all hired engineers based in Nigeria, Kenya, or South Africa. Pay is typically flat-global or lightly geographically adjusted.',
        ],
      },
      {
        heading: 'African-led companies hiring globally',
        paragraphs: [
          'Paystack (Stripe), Flutterwave, Yoco, Chipper Cash, Kuda, Mono, and Moove run large remote engineering and operations teams across the continent. These are the most accessible employers for entry- and mid-level African candidates.',
        ],
      },
      {
        heading: 'Specialised remote employers',
        paragraphs: [
          'Toptal, Turing, Andela, Crossover, and Deel\'s own engineering team specifically hire across Africa. Pay models vary — research before applying.',
        ],
      },
    ],
    faq: [
      {
        q: 'How do I tell if a company actually hires from my country?',
        a: 'Check LinkedIn for current employees in your country. Read their public engineering blog for "we hired in [country]" announcements. Ask directly in the interview — legitimate companies will tell you.',
      },
    ],
    related: [
      { label: 'Browse all companies', href: '/companies' },
      { label: 'Open to Africa roles', href: '/jobs?africa=1' },
    ],
  },
  {
    slug: 'ai-jobs-open-to-africa',
    title: 'AI and machine-learning jobs open to African applicants',
    description:
      'Where AI and ML companies are actually hiring African talent in 2026 — and what skills get you in the door.',
    lede: 'AI hiring has expanded faster than any other category in 2026. Most teams are hiring globally — including from Africa — but the skill bar is real.',
    publishedAt: today,
    readMinutes: 5,
    sections: [
      {
        heading: 'What AI teams actually hire for',
        paragraphs: [
          'The "AI engineer" market splits into three categories:',
        ],
        bullets: [
          'Foundation model research — PhD-heavy, mostly US-based. Hard to break into remotely from anywhere.',
          'Applied AI engineering — building production systems on top of OpenAI, Anthropic, and open-source models. The biggest hiring category, and the most accessible globally.',
          'AI evaluation, data, and operations — fast-growing, lower entry bar, often open to entry-level candidates.',
        ],
      },
      {
        heading: 'Skills that get interviews',
        paragraphs: [
          'For applied AI engineering: solid Python, real LLM API experience (OpenAI, Anthropic, Vercel AI SDK), vector databases, evals, and at least one shipped project you can show. A strong GitHub matters more than a degree.',
        ],
      },
      {
        heading: 'Companies hiring openly',
        paragraphs: [
          'Vercel, Anthropic (selectively), Hugging Face, Replit, Mintlify, and a long tail of YC AI startups have hired remotely from Africa. Salary ranges typically follow the senior engineering bands above.',
        ],
      },
    ],
    faq: [
      {
        q: 'Do I need a Master\'s or PhD to work in AI?',
        a: 'Not for applied AI engineering, which is the largest hiring category. A strong portfolio of shipped LLM-powered projects matters more than credentials.',
      },
    ],
    related: [
      { label: 'Engineering roles', href: '/jobs/engineering/worldwide' },
      { label: 'Companies hiring remote in Africa', href: '/companies' },
    ],
  },
  {
    slug: 'usd-payments-from-africa',
    title: 'How to receive USD salaries from Africa, legally',
    description:
      'A practical breakdown of how international payroll, tax, and currency actually work for African candidates earning in USD or EUR — covering Deel, Remote, Payoneer, Wise, and local-bank options.',
    lede:
      'Getting paid in USD from a remote job is the easy part. The infrastructure exists, it works, and millions of African workers already use it. Here is how it actually flows.',
    publishedAt: today,
    readMinutes: 6,
    sections: [
      {
        heading: 'Three ways the money reaches you',
        paragraphs: [
          'There are three legitimate channels for receiving USD or EUR salaries in Africa, and most remote-first companies will offer at least one of them:',
        ],
        bullets: [
          'Employer of Record (EoR) payroll — the company hires you through Deel, Remote, Oyster, Multiplier, or Velocity Global. The EoR is your legal employer in your country, files local tax on your behalf, and pays you in USD or local currency at the day\'s exchange rate.',
          'International contractor payments — you sign a contractor agreement and invoice the company directly. Funds land in a Payoneer, Wise, or Mercury USD account. You handle tax declaration locally.',
          'Direct USD wire to a domiciliary account — many Nigerian, Kenyan, and Ghanaian banks now offer USD-denominated accounts. The company wires you directly. Slower and more expensive in fees, but cuts out third parties.',
        ],
      },
      {
        heading: 'How to choose between EoR and contractor',
        paragraphs: [
          'EoR payroll is more expensive for the company but gives you employee benefits — paid time off, sometimes health stipends, sometimes equity vesting that works the same as a US employee. Choose this if the company offers it and you want stability.',
          'Contractor status is cheaper for the company and gives you slightly more flexibility, but you lose employee protections and you are responsible for your own tax filing. Most senior remote engineers start as EoR employees and convert later if it makes sense.',
        ],
      },
      {
        heading: 'Tax, honestly',
        paragraphs: [
          'You owe tax in your country of residence — not the US, not the UK, not the country where the company is based. International tax treaties prevent double taxation in almost all cases. If you are an EoR employee, the EoR usually files local tax for you. If you are a contractor, you declare it yourself.',
          'In Nigeria, this means filing with FIRS. In Kenya, with KRA. In South Africa, with SARS. The amounts and brackets vary, but the principle is the same: declare global income, pay local tax. Use a local accountant for your first year — it costs little and saves a lot.',
        ],
      },
      {
        heading: 'Currency and conversion',
        paragraphs: [
          'When the dollar reaches your local bank, you usually get converted at the official interbank rate, not the parallel market rate. In Nigeria specifically, this matters — keeping funds in a Payoneer or Wise USD wallet and converting only what you need each month often nets a meaningfully better effective rate.',
          'Wise gives the cleanest conversion globally. Payoneer is more widely supported by US-based payroll. Mercury is engineering-friendly but harder to open from some African countries.',
        ],
      },
    ],
    faq: [
      {
        q: 'Do I need a US LLC or company to receive USD?',
        a: 'No. None of the legitimate channels above require a US entity. People sometimes set up Delaware LLCs to access US banking, but for ordinary salary payments it is unnecessary overhead.',
      },
      {
        q: 'Will the bank flag my incoming USD payments?',
        a: 'Sometimes — usually only on the first one or two. Most African banks now have established categories for international remote-work income. Keep your contract and the EoR\'s payment notice handy in case compliance asks.',
      },
      {
        q: 'How long does the money take to arrive?',
        a: 'Through Deel or Remote, typically 1-3 business days from payday. Direct international wire, 3-7 business days. Payoneer, near-instant from the company side, 1-2 days for you to withdraw locally.',
      },
      {
        q: 'Do I need a Domiciliary account in Nigeria?',
        a: 'Helpful but not required. A Payoneer or Wise USD wallet works for almost all use cases. Domiciliary accounts are useful if you receive large lump sums or want to keep funds in USD long-term.',
      },
    ],
    related: [
      { label: 'Remote salary expectations for African candidates', href: '/guides/remote-salary-expectations-africa' },
      { label: 'USD-paying remote roles', href: '/remote-jobs/search/usd-paying' },
      { label: 'Open-to-Africa roles', href: '/remote-jobs/search/open-to-africa' },
    ],
  },
]

export const GUIDES_BY_SLUG = new Map(GUIDES.map((g) => [g.slug, g]))

export function getGuide(slug: string): Guide | null {
  return GUIDES_BY_SLUG.get(slug) ?? null
}
