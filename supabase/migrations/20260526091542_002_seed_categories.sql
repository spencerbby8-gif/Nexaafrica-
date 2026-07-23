-- Nexa Phase 2: seed categories
insert into public.categories (slug, title, description) values
  ('engineering', 'Engineering', 'Software, infrastructure, and platform roles building modern products.'),
  ('design', 'Design', 'Product design, UX, and brand roles at companies that take craft seriously.'),
  ('product', 'Product', 'Product management roles across early-stage and growth-stage teams.'),
  ('data', 'Data', 'Data engineering, analytics, and machine learning roles.'),
  ('marketing', 'Marketing', 'Growth, content, and lifecycle marketing roles.'),
  ('operations', 'Operations', 'People, finance, and business operations roles.'),
  ('customer-support', 'Customer Support', 'Support and customer experience roles for global teams.'),
  ('sales', 'Sales', 'Sales, partnerships, and revenue roles.')
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description;
