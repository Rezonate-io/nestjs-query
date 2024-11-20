import { Class, QueryService } from '@rezonate/nestjs-query-core';

import { getRelations } from '../../decorators';
import { getReferences } from '../../decorators/reference.decorator';
import { BaseResolverOptions } from '../../decorators/resolver-method.decorator';
import { ServiceResolver } from '../resolver.interface';
import { AggregateRelationsMixin } from './aggregate-relations.resolver';
import { ReadRelationsMixin } from './read-relations.resolver';
import { ReferencesRelationMixin } from './references-relation.resolver';
import { RemoveRelationsMixin } from './remove-relations.resolver';
import { UpdateRelationsMixin } from './update-relations.resolver';

export interface RelatableOpts extends BaseResolverOptions {
  enableTotalCount?: boolean
  enableAggregate?: boolean
  maxRowsForAggregate?: number
  maxRowsForAggregateWithIndex?: number
  limitAggregateByTableSize?: boolean
}

export const Relatable =
  <DTO, QS extends QueryService<DTO, unknown, unknown> = QueryService<DTO, unknown, unknown>>(
    DTOClass: Class<DTO>,
    opts: RelatableOpts,
  ) =>
  <B extends Class<ServiceResolver<DTO, QS>>>(Base: B): B => {
    const { enableTotalCount, enableAggregate } = opts;
    const relations = getRelations(DTOClass, opts);
    const references = getReferences(DTOClass, opts);

    const referencesMixin = ReferencesRelationMixin(DTOClass, references);
    const aggregateRelationsMixin = AggregateRelationsMixin(DTOClass, { ...relations, enableAggregate, limitAggregateByTableSize: opts.limitAggregateByTableSize, maxRowsForAggregate: opts.maxRowsForAggregate, maxRowsForAggregateWithIndex: opts.maxRowsForAggregateWithIndex });
    const readRelationsMixin = ReadRelationsMixin(DTOClass, { ...relations, enableTotalCount });
    const updateRelationsMixin = UpdateRelationsMixin(DTOClass, relations);

    return referencesMixin(
      aggregateRelationsMixin(readRelationsMixin(updateRelationsMixin(RemoveRelationsMixin(DTOClass, relations)(Base)))),
    );
  };
