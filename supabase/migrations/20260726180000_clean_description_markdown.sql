-- Nexa prod hardening 2026-07-26: markdown/HTML leaking into descriptions (#5)
-- Stored description_md contained raw '**', '__', HTML tags and '[label](url)'
-- links (3,848 / 4 / 3,438 rows). Strip them so OG images, excerpts and direct
-- reads render clean. Backup table: _bk_jobs_desc_20260726. Verified: 0 after.
UPDATE public.jobs
SET description_md = regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(description_md, '<[^>]+>', '', 'g'),
          '\[([^\]]+)\]\([^)]+\)', '\1', 'g'),
        '\*\*', '', 'g'),
      '__', '', 'g')
WHERE description_md ~ '\*\*|<[a-zA-Z/][^>]*>|\[[^]]+\]\([^)]+\)|__';
