import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'Are these jobs legitimate?',
    a: 'Source and AI checks inform which listings are shown, but inclusion is not a guarantee of legitimacy. Company identity, vacancy authenticity and hiring eligibility are separate questions. Read published research and confirm terms with the employer.',
  },
  {
    q: 'Do I need to pay to apply?',
    a: 'Nexa does not charge application fees. External employer or platform terms are not guaranteed by Nexa; be cautious of requests for payment.',
  },
  {
    q: 'Are these jobs open to African applicants?',
    a: 'The public feed requires evidence supporting Africa-based applications. Worldwide-remote wording is a hiring signal, not proof of legal hiring permission in every country. Confirm country-specific terms.',
  },
  {
    q: 'How often are jobs updated?',
    a: 'Listings pass freshness and expiry checks, but closure detection is not instantaneous. Check the original listing before applying.',
  },
  {
    q: 'Do I need previous remote experience?',
    a: 'No. Many companies hire candidates new to remote work. Filter by entry-level roles or contract roles to find a starting point.',
  },
]

export function FAQ() {
  return (
    <section
      className="mx-auto max-w-3xl px-4 sm:px-6"
      aria-labelledby="faq-heading"
    >
      <h2
        id="faq-heading"
        className="text-lg font-semibold tracking-tight sm:text-xl"
      >
        Frequently asked
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Quick answers about how Nexa works.
      </p>
      <Accordion
        type="single"
        collapsible
        className="mt-5 divide-y divide-border/60 rounded-lg border border-border/70 bg-card/50"
      >
        {FAQ_ITEMS.map((item, i) => (
          <AccordionItem
            key={i}
            value={`item-${i}`}
            className="border-b-0 px-4 sm:px-5"
          >
            <AccordionTrigger className="py-4 text-left text-[15px] font-medium hover:no-underline">
              {item.q}
            </AccordionTrigger>
            <AccordionContent className="pb-4 text-sm leading-relaxed text-muted-foreground">
              {item.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  )
}
