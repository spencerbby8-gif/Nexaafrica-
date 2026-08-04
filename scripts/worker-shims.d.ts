/**
 * Type shims for the operator-only evidence worker. Playwright/pg are
 * installed ad-hoc (npm i --no-save) when running scripts/evidence-worker.ts
 * and are NOT app dependencies — these declarations keep `next build`
 * type-checking green without them installed.
 */
declare module "playwright" {
  export const chromium: any
}
declare module "pg" {
  const pg: any
  export default pg
}
