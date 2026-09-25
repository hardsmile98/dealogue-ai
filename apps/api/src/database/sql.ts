import { EntityManager } from 'typeorm';
import type { DataSource, ObjectLiteral, Repository } from 'typeorm';

/** Результат сырого запроса: строки (SELECT или RETURNING) и сколько строк затронуто. */
export interface SqlResult<Row> {
  rows: Row[];
  affected: number;
}

/**
 * Сырой SQL с единым видом результата. `DataSource.query` для UPDATE/DELETE
 * отдаёт пару `[rows, count]`, а для SELECT/INSERT — просто строки; здесь
 * всегда `{ rows, affected }`, в том числе для `UPDATE … RETURNING`.
 * Менеджер транзакции передаётся как есть — запрос уйдёт в её соединение.
 */
export async function execute<Row = Record<string, unknown>>(
  db: DataSource | EntityManager,
  sql: string,
  params: unknown[] = [],
): Promise<SqlResult<Row>> {
  const transactional =
    db instanceof EntityManager ? db.queryRunner : undefined;
  const dataSource = db instanceof EntityManager ? db.connection : db;
  const runner = transactional ?? dataSource.createQueryRunner();
  try {
    const result = await runner.query(sql, params, true);
    return {
      rows: (result.records ?? []) as Row[],
      affected: result.affected ?? 0,
    };
  } finally {
    if (!transactional) await runner.release();
  }
}

/**
 * Строка из `RETURNING *` → сущность, как её собрал бы сам TypeORM
 * (имена колонок → свойства, типы — через драйвер).
 */
export function hydrate<Entity extends ObjectLiteral>(
  repository: Repository<Entity>,
  row: Record<string, unknown>,
): Entity {
  const entity = repository.create();
  const driver = repository.manager.connection.driver;
  for (const column of repository.metadata.columns) {
    if (!(column.databaseName in row)) continue;
    column.setEntityValue(
      entity,
      driver.prepareHydratedValue(row[column.databaseName], column),
    );
  }
  return entity;
}
