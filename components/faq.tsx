import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'Are these jobs legitimate?',
    a: 'Every listing is reviewed before going live. We remove postings from companies that show signs of fraud, vague descriptions, or unverifiable details.',
  },
  {
    q: 'Do I need to pay to apply?',
    a: 'No. Applying is always free. Nexa never charges candidates and does not partner with recruiters who do.',
  },
  {
    q: 'Are these jobs open to African applicants?',
    a: 'Most roles on Nexa are remote and open to candidates working from Africa. Where a role has location restrictions, we surface that directly on the listing.',
  },
  {
    q: 'How often are jobs updated?',
    a: 'New roles are added throughout the week. Closed and expired roles are removed automatically so the feed stays current.',
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
