import {
	AggregateByTimeIntervalSpan,
	AggregateFields,
	AggregateQuery,
	Filter,
	getFilterFields,
	Paging,
	Query,
	SortDirection,
	SortField,
	SortNulls,
} from '@rezonate/nestjs-query-core';
import merge from 'lodash.merge';
import {
	DeleteQueryBuilder,
	EntityMetadata,
	QueryBuilder,
	Repository,
	SelectQueryBuilder,
	UpdateQueryBuilder,
	WhereExpressionBuilder,
} from 'typeorm';

import { AggregateBuilder } from './aggregate.builder';
import { ColumnMetadata, WhereBuilder } from './where.builder';

/**
 * @internal
 *
 * Interface that for Typeorm query builders that are sortable.
 */
interface Sortable<Entity> extends QueryBuilder<Entity> {
	addOrderBy(sort: string, order?: 'ASC' | 'DESC', nulls?: 'NULLS FIRST' | 'NULLS LAST'): this;
}

interface Groupable<Entity> extends QueryBuilder<Entity> {
	addGroupBy(groupBy: string): this;
}

/**
 * @internal
 *
 * Interface for `typeorm` query builders that are pageable.
 */
interface Pageable<Entity> extends QueryBuilder<Entity> {
	limit(limit?: number): this;

	offset(offset?: number): this;

	skip(skip?: number): this;

	take(take?: number): this;
}

/**
 * @internal
 *
 * Nested record type
 */
export interface NestedRecord<E = unknown> {
	[keys: string]: NestedRecord<E>;
}

/**
 * @internal
 *
 * Class that will convert a Query into a `typeorm` Query Builder.
 */
export class FilterQueryBuilder<Entity> {
	constructor(
		public repo: Repository<Entity>,
		readonly whereBuilder: WhereBuilder<Entity> = new WhereBuilder<Entity>(),
		readonly aggregateBuilder: AggregateBuilder<Entity> = new AggregateBuilder<Entity>(repo),
	) {
	}

	/**
	 * Create a `typeorm` SelectQueryBuilder with `WHERE`, `ORDER BY` and `LIMIT/OFFSET` clauses.
	 *
	 * @param query - the query to apply.
	 * @param repo
	 */
	public select(query: Query<Entity>, repo?: Repository<Entity>): SelectQueryBuilder<Entity> {
		if (repo) this.repo = repo;
		const tableColumns = this.repo.metadata.columns;
		const hasRelations = this.filterHasRelations(query.filter, query.sorting);
		let qb = this.createQueryBuilder();
		qb = hasRelations
			? this.applyRelationJoinsRecursive(
				qb,
				this.getReferencedRelationsRecursive(this.repo.metadata, query.filter, query.sorting),
			)
			: qb;
		qb = this.applyFilter(qb, tableColumns, query.filter, query.sorting, qb.alias);
		qb = this.applySorting(qb, query.sorting, qb.alias);
		qb = this.applyPaging(qb, query.paging, hasRelations);
		return qb;
	}

	public selectById(id: string | number | (string | number)[], query: Query<Entity>): SelectQueryBuilder<Entity> {
		const hasRelations = this.filterHasRelations(query.filter);
		const tableColumns = this.repo.metadata.columns;
		let qb = this.createQueryBuilder();
		qb = hasRelations
			? this.applyRelationJoinsRecursive(qb, this.getReferencedRelationsRecursive(this.repo.metadata, query.filter))
			: qb;
		qb = qb.andWhereInIds(Array.isArray(id) ? id : [id]);
		qb = this.applyFilter(qb, tableColumns, query.filter, [], qb.alias);
		qb = this.applySorting(qb, query.sorting, qb.alias);
		qb = this.applyPaging(qb, query.paging, hasRelations);
		return qb;
	}

	public aggregate(
		query: Query<Entity>,
		aggregate: AggregateQuery<Entity>,
		failOnMissingIndex = false,
		allowEmptySelect = false,
	): SelectQueryBuilder<Entity> {
		const hasRelations = this.filterHasRelations(query.filter);
		const hasAggregatedRelations = this.aggregateHasRelations(aggregate);
		const tableColumns = this.repo.metadata.columns;
		const relationsMap = {
			...(hasRelations ? this.getReferencedRelationsRecursive(this.repo.metadata, query.filter) : {}),
			...(hasAggregatedRelations ? this.getAggregatedRelations(aggregate) : {}),
		};

		let qb = this.createQueryBuilder();
		qb = hasRelations || hasAggregatedRelations ? this.applyRelationJoinsRecursive(qb, relationsMap) : qb;
		qb = this.applyAggregate(qb, aggregate, qb.alias, failOnMissingIndex, allowEmptySelect);
		qb = this.applyFilter(qb, tableColumns, query.filter, [], qb.alias);
		qb = this.applyAggregateSorting(qb, aggregate.groupBy, qb.alias);
		qb = this.applyAggregateGroupBy(qb, aggregate.groupBy, qb.alias);
		return qb;
	}

	public aggregateByTime(
		query: Query<Entity>,
		aggregate: AggregateQuery<Entity>,
		accumulate: boolean,
		timeField: string,
		from: Date,
		to: Date,
		interval: number,
		span: AggregateByTimeIntervalSpan,
		failOnMissingIndex = false,
	): Promise<(Entity & { timeInterval: Date })[]> {
		const qb = this.aggregate(query, aggregate, failOnMissingIndex, true);
		return this.applyAggregateByTimeJoinSeries(qb, timeField, accumulate, from, to, interval, span) as Promise<
			(Entity & {
				timeInterval: Date
			})[]
		>;
	}

	/**
	 * Create a `typeorm` DeleteQueryBuilder with a WHERE clause.
	 *
	 * @param query - the query to apply.
	 */
	public delete(query: Query<Entity>): DeleteQueryBuilder<Entity> {
		const tableColumns = this.repo.metadata.columns;
		return this.applyFilter(this.repo.createQueryBuilder().delete(), tableColumns, query.filter);
	}

	/**
	 * Create a `typeorm` DeleteQueryBuilder with a WHERE clause.
	 *
	 * @param query - the query to apply.
	 */
	public softDelete(query: Query<Entity>) {
		const tableColumns = this.repo.metadata.columns;
		return this.applyFilter(
			this.repo.createQueryBuilder().softDelete(),
			tableColumns,
			query.filter,
		);
	}

	/**
	 * Create a `typeorm` UpdateQueryBuilder with `WHERE` and `ORDER BY` clauses
	 *
	 * @param query - the query to apply.
	 */
	public update(query: Query<Entity>): UpdateQueryBuilder<Entity> {
		const tableColumns = this.repo.metadata.columns;
		const qb = this.applyFilter(this.repo.createQueryBuilder().update(), tableColumns, query.filter);
		return this.applySorting(qb, query.sorting);
	}

	/**
	 * Applies paging to a Pageable `typeorm` query builder
	 * @param qb - the `typeorm` QueryBuilder
	 * @param paging - the Paging options.
	 * @param useSkipTake - if skip/take should be used instead of limit/offset.
	 */
	public applyPaging<P extends Pageable<Entity>>(qb: P, paging?: Paging, useSkipTake?: boolean): P {
		if (!paging) {
			return qb;
		}

		if (useSkipTake) {
			return qb.take(paging.limit).skip(paging.offset);
		}

		return qb.limit(paging.limit).offset(paging.offset);
	}

	/**
	 * Applies the filter from a Query to a `typeorm` QueryBuilder.
	 *
	 * @param qb - the `typeorm` QueryBuilder.
	 * @param aggregate - the aggregates to select.
	 * @param alias - optional alias to use to qualify an identifier
	 */
	public applyAggregate<Qb extends SelectQueryBuilder<Entity>>(
		qb: Qb,
		aggregate: AggregateQuery<Entity>,
		alias?: string,
		failOnMissingIndex = false,
		allowEmptySelect = false,
	): Qb {
		return this.aggregateBuilder.build(qb, aggregate, alias, failOnMissingIndex, allowEmptySelect);
	}

	public applyAggregateByTimeJoinSeries<Qb extends SelectQueryBuilder<Entity>>(
		qb: Qb,
		timeField: string,
		accumulate: boolean,
		from: Date,
		to: Date,
		interval: number,
		span: AggregateByTimeIntervalSpan,
		alias?: string,
	) {
		const column = this.repo.metadata.columns.find((c) => c.propertyName === timeField);
		if (!column) throw new Error('Could not find column');
		const fullColumnName = alias ? `"${alias}"."${column.databaseName}"` : `"${column.databaseName}"`;
		const intervalColumnName = 'timeInterval';
		const timeSeries = `
    generate_series( 
    '${from.toISOString()}'::timestamp, 
    '${to.toISOString()}'::timestamp, 
    '${interval} ${span}'::interval)
    `;
		let joinCondition = `${fullColumnName} <= "${intervalColumnName}" + '${interval} ${span}'::interval`;
		if (!accumulate) joinCondition = `${fullColumnName} > "${intervalColumnName}" AND ${joinCondition}`;

		qb.innerJoinAndSelect(
			'TIME_SERIES_PLACEHOLDER',
			intervalColumnName,
			joinCondition,
		);

		qb.addOrderBy('"timeInterval"', 'ASC');
		qb.addGroupBy('"timeInterval"');

		const query = qb.getQuery().replace('INNER JOIN "TIME_SERIES_PLACEHOLDER"', `RIGHT JOIN ${timeSeries}`);

		return this.repo.query(query);
	}

	/**
	 * Applies the filter from a Query to a `typeorm` QueryBuilder.
	 *
	 * @param qb - the `typeorm` QueryBuilder.
	 * @param filter - the filter.
	 * @param alias - optional alias to use to qualify an identifier
	 */
	public applyFilter<Where extends WhereExpressionBuilder>(
		qb: Where,
		columns: ColumnMetadata[],
		filter?: Filter<Entity>,
		sort: SortField<any>[] = [],
		alias?: string,
	): Where {
		if (!filter) {
			return qb;
		}
		return this.whereBuilder.build(
			qb,
			filter,
			this.getReferencedRelationsRecursive(this.repo.metadata, filter, sort),
			columns,
			alias,
		);
	}

	/**
	 * Applies the ORDER BY clause to a `typeorm` QueryBuilder.
	 * @param qb - the `typeorm` QueryBuilder.
	 * @param sorts - an array of SortFields to create the ORDER BY clause.
	 * @param alias - optional alias to use to qualify an identifier
	 */
	public applySorting<T extends Sortable<Entity>>(qb: T, sorts?: SortField<Entity>[], alias?: string): T {
		const relations = new Set(this.repo.metadata.relations.map((r) => r.propertyName));
		if (!sorts) {
			return qb;
		}
		return sorts.reduce((prevQb, {
			field,
			direction,
			nulls = this.getNullsOrderBasedOnSortDirection(direction),
		}) => {
			const fieldName = field.toString();
			const [relationName, ...relationFields] = fieldName.split('_');
			let col: string;
			if (relationName && relations.has(relationName)) col = `${relationName}.${relationFields.join('')}`;
			else col = alias ? `${alias}.${fieldName}` : `${fieldName}`;
			return prevQb.addOrderBy(col, direction, nulls);
		}, qb);
	}

	public applyAggregateGroupBy<T extends Groupable<Entity>>(qb: T, groupBy?: AggregateFields<Entity>, alias?: string): T {
		if (!groupBy) {
			return qb;
		}
		return groupBy.reduce<T>((prevQb, field) => this.aggregateBuilder
			.getCorrectedField(alias, field)
			.reduce<T>((prevQbInner, fieldInner) => prevQbInner.addGroupBy(fieldInner), prevQb), qb);
	}

	public applyAggregateSorting<T extends Sortable<Entity>>(qb: T, groupBy?: AggregateFields<Entity>, alias?: string): T {
		if (!groupBy) {
			return qb;
		}
		return groupBy.reduce<T>((prevQb, field) => this.aggregateBuilder
			.getCorrectedField(alias, field)
			.reduce<T>((prevQbInner, fieldInner) => prevQbInner.addOrderBy(fieldInner, 'ASC'), prevQb), qb);
	}

	/**
	 * Create a `typeorm` SelectQueryBuilder which can be used as an entry point to create update, delete or insert
	 * QueryBuilders.
	 */
	private createQueryBuilder(): SelectQueryBuilder<Entity> {
		return this.repo.createQueryBuilder();
	}

	/**
	 * Gets relations referenced in the filter and adds joins for them to the query builder
	 * @param qb - the `typeorm` QueryBuilder.
	 * @param relationsMap - the relations map.
	 *
	 * @returns the query builder for chaining
	 */
	public applyRelationJoinsRecursive(
		qb: SelectQueryBuilder<Entity>,
		relationsMap?: NestedRecord,
		alias?: string,
	): SelectQueryBuilder<Entity> {
		if (!relationsMap) {
			return qb;
		}
		const referencedRelations = Object.keys(relationsMap);
		return referencedRelations.reduce((rqb, relation) => this.applyRelationJoinsRecursive(
			rqb.leftJoinAndSelect(`${alias ?? rqb.alias}.${relation}`, relation),
			relationsMap[relation],
			relation,
		), qb);
	}

	/**
	 * Checks if a filter references any relations.
	 * @param filter
	 * @private
	 *
	 * @returns true if there are any referenced relations
	 */
	public filterHasRelations(filter?: Filter<Entity>, sort?: SortField<Entity>[]): boolean {
		if (!filter && !sort) {
			return false;
		}
		return this.getReferencedRelations(filter, sort).length > 0;
	}

	public aggregateHasRelations(aggregate?: AggregateQuery<Entity>): boolean {
		if (!aggregate) {
			return false;
		}
		return Boolean(Object.values(aggregate).find((v) => typeof v !== 'string'));
	}

	private getReferencedRelations(filter: Filter<Entity>, sort: SortField<Entity>[] = []): string[] {
		const { relationNames } = this;
		const referencedFields = getFilterFields(filter);
		const referencedSortFields = [...new Set(sort.map((f) => f.field.toString().split('_')[0]))];
		return [...referencedFields, ...referencedSortFields].filter((f) => relationNames.includes(f));
	}

	getAggregatedRelations(aggregate: AggregateQuery<Entity>): NestedRecord {
		return Object.values(aggregate).reduce((obj, relationsObj) => ({
			...obj,
			...relationsObj.reduce((objInner, item) => {
				const newField =
					typeof item === 'string'
						? {}
						: Object.keys(item).reduce((objInner1, key) => ({
							...objInner1,
							[key]: {},
						}), {} as NestedRecord);
				return { ...objInner, ...newField } as NestedRecord;
			}, {} as NestedRecord),
		} as NestedRecord), {} as NestedRecord);
	}

	getReferencedRelationsRecursive(
		metadata: EntityMetadata,
		filter: Filter<unknown> = {},
		sort: SortField<any>[] = [],
	): NestedRecord {
		const referencedFields = Array.from(
			new Set([...(Object.keys(filter) as (keyof Filter<unknown>)[]), ...sort.map((s) => s.field.toString())]),
		);
		return referencedFields.reduce((prev, curr) => {
			const currFilterValue = filter[curr];
			if ((curr === 'and' || curr === 'or') && Array.isArray(currFilterValue)) {
				// eslint-disable-next-line no-param-reassign
				prev = currFilterValue.reduce((acc, subFilter) => merge(acc, this.getReferencedRelationsRecursive(metadata, subFilter, [])), prev);
			}
			const [relationField] = curr.split('_');
			let isSortRelation = false;
			const referencedRelation = metadata.relations.find((r) => {
				if (r.propertyName === curr) return true;
				if (r.propertyName === relationField) {
					isSortRelation = true;
					return true;
				}
				return false;
			});
			if (!referencedRelation) return prev;
			return {
				...prev,
				[isSortRelation ? relationField : curr]: merge(
					(prev as NestedRecord)[curr],
					this.getReferencedRelationsRecursive(referencedRelation.inverseEntityMetadata, currFilterValue, []),
				),
			};
		}, {});
	}

	private get relationNames(): string[] {
		return this.repo.metadata.relations.map((r) => r.propertyName);
	}

	private getNullsOrderBasedOnSortDirection(sortDirection: SortDirection): SortNulls {
		if (sortDirection === SortDirection.ASC) {
			return SortNulls.NULLS_FIRST;
		}
		return SortNulls.NULLS_LAST;
	}
}
