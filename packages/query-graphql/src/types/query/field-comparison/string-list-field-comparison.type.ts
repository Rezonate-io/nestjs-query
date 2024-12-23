import { Field, InputType } from '@nestjs/graphql';
import { Class, FilterFieldComparison } from '@rezonate/nestjs-query-core';
import { IsString } from 'class-validator';

import { IsUndefined } from '../../validators';

/** @internal */
let stringListFieldComparison: Class<FilterFieldComparison<string>>;

/** @internal */
export function getOrCreateStringListFieldComparison(): Class<FilterFieldComparison<string>> {
  if (stringListFieldComparison) {
    return stringListFieldComparison;
  }

  @InputType()
  class StringListFieldComparison implements FilterFieldComparison<string> {
    @Field({ nullable: true })
    @IsString()
    @IsUndefined()
    contains?: string;

    @Field({ nullable: true })
    @IsString()
    @IsUndefined()
    notContains?: string;

    @Field({ nullable: true })
    @IsString()
    @IsUndefined()
    containsLike?: string;
  }

  stringListFieldComparison = StringListFieldComparison;
  return stringListFieldComparison;
}
