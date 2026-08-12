/**
 * Type shims for operator-only scripts. `pg` is an app dependency that ships
 * no bundled types (and @types/pg is not installed), so it is declared here;
 * playwright is installed ad-hoc (npm i --no-save) when running
 * scripts/evidence-worker.ts — these declarations keep `next build`
 * type-checking green without it installed.
 */
declare module "playwright" {
  export const chromium: any
}
declare module "pg" {
  const pg: any
  export default pg
  export const Client: any
  export const Pool: any
}
