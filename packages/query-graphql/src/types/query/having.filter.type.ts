import { Field, InputType } from '@nestjs/graphql'
import {
  Class,
  CommonFieldComparisonType,
  FilterComparisons,
  FilterFieldComparison,
  HavingFilter,
  MapReflector
} from '@rezonate/nestjs-query-core'
import { Type } from 'class-transformer'
import { ValidateNested } from 'class-validator'
import { getDTONames, getGraphqlObjectName } from '../../common'
import { FilterableFieldDescriptor, getFilterableFields } from "../../decorators";
import { createFilterComparisonType } from './field-comparison'
import { upperCaseFirst } from 'upper-case-first'
import { HasRequiredFilter } from '../../decorators/has-required.filter'

const reflector = new MapReflector('nestjs-query:having-filter-type')

export interface HavingFilterConstructor<T> {
  hasRequiredFilters: boolean

  new (): HavingFilter<T>
}
function createHavingFilterComparison<T>(FieldType: Class<T>, fieldName: string): Class<CommonFieldComparisonType<T>> {
  const name = `${fieldName}HavingFilterComparison`

  @InputType(name)
  class HavingFilterComparison {
    @Field(() => Number, { nullable: true })
    @Type(() => FieldType)
    eq?: number

    @Field(() => Number, { nullable: true })
    @Type(() => FieldType)
    neq?: number

    @Field(() => Number, { nullable: true })
    @Type(() => FieldType)
    gt?: number

    @Field(() => Number, { nullable: true })
    @Type(() => FieldType)
    gte?: number

    @Field(() => Number, { nullable: true })
    @Type(() => FieldType)
    lt?: number

    @Field(() => Number, { nullable: true })
    @Type(() => FieldType)
    lte?: number
  }

  return HavingFilterComparison as Class<CommonFieldComparisonType<T>>
}
function createHavingFilter(name: string, fields: FilterableFieldDescriptor[] ) {

  @InputType(name)
  class HavingFilterAggFunc {}

  fields.forEach((field) => {
    const { target, advancedOptions, propertyName } = field

    const FC = createHavingFilterComparison(target, `${name}${upperCaseFirst(propertyName)}`)

    Field(() => FC, { nullable: true })(HavingFilterAggFunc.prototype, propertyName)
    Type(() => FC)(HavingFilterAggFunc.prototype, propertyName)
  })

  return HavingFilterAggFunc
}

function getObjectTypeName<DTO>(DTOClass: Class<DTO>): string {
  return getGraphqlObjectName(DTOClass, 'No fields found to create FilterType.')
}

function getOrCreateHavingFilterType<T>(TClass: Class<T>, name: string): HavingFilterConstructor<T> {
  return reflector.memoize(TClass, name, () => {
    const fields = getFilterableFields(TClass)

    if (!fields.length) {
      throw new Error(`No fields found to create GraphQLHavingFilter for ${TClass.name}`)
    }

    //TODO: need a better way of creating the filter object
    @InputType(`${name}HavingComparison${Date.now()}`)
    class GraphqlHavingFieldsFilterComparison {}

    const SumFilter = createHavingFilter(`${name}Sum`, fields)
    const MinFilter = createHavingFilter(`${name}Min`, fields)
    const MaxFilter = createHavingFilter(`${name}Max`, fields)
    const CountFilter = createHavingFilter(`${name}Count`, fields)
    const DistinctCountFilter = createHavingFilter(`${name}DistinctCount`, fields)
    const AvgFilter = createHavingFilter(`${name}Avg`, fields)

    @InputType(name)
    class GraphQLHavingFilter {
      @ValidateNested()
      @Field(() => SumFilter, { nullable: true })
      @Type(() => SumFilter)
      sum?: FilterComparisons<T>

      @ValidateNested()
      @Field(() => MaxFilter, { nullable: true })
      @Type(() => MaxFilter)
      max?: FilterComparisons<T>

      @ValidateNested()
      @Field(() => MinFilter, { nullable: true })
      @Type(() => MinFilter)
      min?: FilterComparisons<T>

      @ValidateNested()
      @Field(() => CountFilter, { nullable: true })
      @Type(() => CountFilter)
      count?: FilterComparisons<T>

      @ValidateNested()
      @Field(() => DistinctCountFilter, { nullable: true })
      @Type(() => DistinctCountFilter)
      distinctCount?: FilterComparisons<T>

      @ValidateNested()
      @Field(() => AvgFilter, { nullable: true })
      @Type(() => AvgFilter)
      avg?: FilterComparisons<T>
    }

    return GraphQLHavingFilter as HavingFilterConstructor<T>
  })
}

export function AggregateHavingFilterType<T>(TClass: Class<T>): HavingFilterConstructor<T> {
  return getOrCreateHavingFilterType(TClass, `${getObjectTypeName(TClass)}AggregateHavingFilter`)
}
