declare module 'better-sqlite3' {
  export interface Statement {
    run(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  export interface Database {
    exec(sql: string): void;
    prepare(sql: string): Statement;
  }

  export default class BetterSqlite3 implements Database {
    constructor(filename: string);
    exec(sql: string): void;
    prepare(sql: string): Statement;
  }
}
