import { Field, Int, ObjectType, Directive } from '@nestjs/graphql';
import { Class, UpdateManyResponse } from '@rezonate/nestjs-query-core';

/** @internal */
let updateManyResponseType: Class<UpdateManyResponse> | null = null;

export const UpdateManyResponseType = (): Class<UpdateManyResponse> => {
  if (updateManyResponseType) {
    return updateManyResponseType;
  }

  @ObjectType('UpdateManyResponse')
  @Directive('@shareable')
  class UpdateManyResponseTypeImpl implements UpdateManyResponse {
    @Field(() => Int, { description: 'The number of records updated.' })
    updatedCount!: number;
  }

  updateManyResponseType = UpdateManyResponseTypeImpl;
  return updateManyResponseType;
};
