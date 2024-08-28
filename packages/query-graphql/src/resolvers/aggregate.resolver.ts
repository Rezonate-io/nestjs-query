import { Args, ArgsType, Resolver } from '@nestjs/graphql'
import { AggregateQuery, AggregateResponse, Class, Filter, mergeFilter, QueryService } from '@rezonate/nestjs-query-core'
import omit from 'lodash.omit'

import { OperationGroup } from '../auth'
import { getDTONames } from '../common'
import { AggregateQueryParam, AuthorizerFilter, ResolverMethodOpts, ResolverQuery } from '../decorators'
import { AuthorizerInterceptor } from '../interceptors'
import { AggregateArgsType, AggregateResponseType } from '../types'
import { transformAndValidate } from './helpers'
import { BaseServiceResolver, ResolverClass, ServiceResolver } from './resolver.interface'

export type AggregateResolverOpts = {
  enabled?: boolean
  maxRowsForAggregate?: number
  maxRowsForAggregateWithIndex?: number
} & ResolverMethodOpts

export interface AggregateResolver<DTO, QS extends QueryService<DTO, unknown, unknown>> extends ServiceResolver<DTO, QS> {
  aggregate(
    filter: AggregateArgsType<DTO>,
    aggregateQuery: AggregateQuery<DTO>,
    authFilter?: Filter<DTO>
  ): Promise<AggregateResponse<DTO>[]>
}

/**
 * @internal
 * Mixin to add `aggregate` graphql endpoints.
 */
export const Aggregateable =
  <DTO, QS extends QueryService<DTO, unknown, unknown>>(DTOClass: Class<DTO>, opts?: AggregateResolverOpts) =>
  <B extends Class<ServiceResolver<DTO, QS>>>(BaseClass: B): Class<AggregateResolver<DTO, QS>> & B => {
    if (!opts || !opts.enabled) {
      return BaseClass as never
    }

    const { baseNameLower, baseName } = getDTONames(DTOClass)
    const commonResolverOpts = omit(opts, 'dtoName', 'one', 'many', 'QueryArgs', 'Connection')
    const queryName = `${baseNameLower}Aggregate`
    const AR = AggregateResponseType(DTOClass)

    @ArgsType()
    class AA extends AggregateArgsType(DTOClass) {}

    @Resolver(() => AR, { isAbstract: true })
    class AggregateResolverBase extends BaseClass {
      @ResolverQuery(
        () => [AR],
        { name: queryName },
        commonResolverOpts,
        { interceptors: [AuthorizerInterceptor(DTOClass)] },
        opts ?? {}
      )
      async aggregate(
        @Args({ type: () => AA }) args: AA,
        @AggregateQueryParam() query: AggregateQuery<DTO>,
        @AuthorizerFilter({
          operationGroup: OperationGroup.AGGREGATE,
          many: true
        })
        authFilter?: Filter<DTO>
      ): Promise<AggregateResponse<DTO>[]> {
        const qa = await transformAndValidate(AA, args)
        const filter = mergeFilter(qa.filter || {}, authFilter ?? {})

        return this.service.aggregate(filter, query, qa.groupByLimit, opts.maxRowsForAggregate, opts.maxRowsForAggregateWithIndex)
      }
    }

    return AggregateResolverBase
  }
// eslint-disable-next-line @typescript-eslint/no-redeclare -- intentional
export const AggregateResolver = <DTO, QS extends QueryService<DTO, unknown, unknown> = QueryService<DTO, unknown, unknown>>(
  DTOClass: Class<DTO>,
  opts?: AggregateResolverOpts
): ResolverClass<DTO, QS, AggregateResolver<DTO, QS>> => Aggregateable(DTOClass, opts)(BaseServiceResolver)
