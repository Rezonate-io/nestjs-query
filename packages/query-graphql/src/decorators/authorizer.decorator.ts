import { Class, MetaValue, ValueReflector } from '@rezonate/nestjs-query-core';

import { Authorizer, AuthorizerOptions, createDefaultAuthorizer, CustomAuthorizer } from '../auth';
import { AUTHORIZER_KEY, AUTHORIZER_PROVIDER_KEY, CUSTOM_AUTHORIZER_KEY } from './constants';

const reflector = new ValueReflector(AUTHORIZER_KEY);
const authorizerProviderReflector = new ValueReflector(AUTHORIZER_PROVIDER_KEY);
const customAuthorizerReflector = new ValueReflector(CUSTOM_AUTHORIZER_KEY);

export function Authorize<DTO>(
  optsOrAuthorizerOrClass: Class<CustomAuthorizer<DTO>> | CustomAuthorizer<DTO> | AuthorizerOptions<DTO>,
) {
  return (DTOClass: Class<DTO>): void => {
    if (!('authorize' in optsOrAuthorizerOrClass)) {
      // If the user provided a class, provide the custom authorizer and create a default authorizer that injects the custom authorizer
      customAuthorizerReflector.set(DTOClass, optsOrAuthorizerOrClass);
      return reflector.set(DTOClass, createDefaultAuthorizer(DTOClass));
    }
    return reflector.set(DTOClass, createDefaultAuthorizer(DTOClass, optsOrAuthorizerOrClass));
  };
}

export const getAuthorizer = <DTO>(DTOClass: Class<DTO>): MetaValue<Class<Authorizer<DTO>>> => reflector.get(DTOClass);
export const getCustomAuthorizer = <DTO>(DTOClass: Class<DTO>): MetaValue<Class<CustomAuthorizer<DTO>>> =>
  customAuthorizerReflector.get(DTOClass);

export const setHasAuthorizerProvider  = <DTO>(DTOClass: Class<DTO>): void => authorizerProviderReflector.set(DTOClass, true);

export const getHasAuthorizerProvider  = <DTO>(DTOClass: Class<DTO>): MetaValue<boolean> => authorizerProviderReflector.get(DTOClass);
