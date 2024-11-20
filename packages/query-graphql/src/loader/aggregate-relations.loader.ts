import { AggregateQuery, AggregateResponse, Class, Filter, QueryService } from '@rezonate/nestjs-query-core';

import { NestjsQueryDataloader } from './relations.loader';

type AggregateRelationsArgs<DTO, Relation> = {
  dto: DTO
  filter: Filter<Relation>
  aggregate: AggregateQuery<Relation>
};
type AggregateRelationsMap<DTO, Relation> = Map<string, (AggregateRelationsArgs<DTO, Relation> & { index: number })[]>;

export class AggregateRelationsLoader<DTO, Relation>
  implements NestjsQueryDataloader<DTO, AggregateRelationsArgs<DTO, Relation>, (AggregateResponse<Relation> | Error)[]> {
  constructor(
    readonly RelationDTO: Class<Relation>,
    readonly relationName: string,
  ) {}

  createLoader(
    service: QueryService<DTO, unknown, unknown>,
    groupByLimit?: number,
    maxRowsAggregationLimit?: number,
    maxRowsAggregationWithIndexLimit?: number,
    limitAggregateByTableSize?: boolean,
  ) {
    return async (
      queryArgs: ReadonlyArray<AggregateRelationsArgs<DTO, Relation>>,
    ): Promise<(AggregateResponse<Relation> | Error)[][]> => {
      // group
      const queryMap = this.groupQueries(queryArgs);
      return this.loadResults(
        service,
        queryMap,
        groupByLimit,
        maxRowsAggregationLimit,
        maxRowsAggregationWithIndexLimit,
        limitAggregateByTableSize,
      );
    };
  }

  private async loadResults(
    service: QueryService<DTO, unknown, unknown>,
    queryRelationsMap: AggregateRelationsMap<DTO, Relation>,
    groupByLimit?: number,
    maxRowsAggregationLimit?: number,
    maxRowsAggregationWithIndexLimit?: number,
    limitAggregateByTableSize?: boolean,
  ): Promise<AggregateResponse<Relation>[][]> {
    const results: AggregateResponse<Relation>[][] = [];
    await Promise.all(
      [...queryRelationsMap.values()].map(async (args) => {
        const { filter, aggregate } = args[0];
        const dtos = args.map((a) => a.dto);
        const aggregationResults = await service.aggregateRelations(
          this.RelationDTO,
          this.relationName,
          dtos,
          filter,
          aggregate,
          groupByLimit,
          maxRowsAggregationLimit,
          maxRowsAggregationWithIndexLimit,
          limitAggregateByTableSize,
        );
        const dtoRelationAggregates = dtos.map((dto) => aggregationResults.get(dto) ?? []);
        dtoRelationAggregates.forEach((relationAggregate, index) => {
          results[args[index].index] = relationAggregate;
        });
      }),
    );
    return results;
  }

  private groupQueries(queryArgs: ReadonlyArray<AggregateRelationsArgs<DTO, Relation>>): AggregateRelationsMap<DTO, Relation> {
    // group
    return queryArgs.reduce((map, args, index) => {
      const queryJson = JSON.stringify({ filter: args.filter, aggregate: args.aggregate });
      if (!map.has(queryJson)) {
        map.set(queryJson, []);
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      map.get(queryJson).push({ ...args, index });
      return map;
    }, new Map<string, (AggregateRelationsArgs<DTO, Relation> & { index: number })[]>());
  }
}
