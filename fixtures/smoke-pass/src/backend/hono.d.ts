declare module "hono" {
  interface Context {
    req: {
      param(name: string): string
    }
    json(value: unknown): unknown
  }

  export class Hono {
    get(path: string, handler: (context: Context) => unknown): this
  }
}
