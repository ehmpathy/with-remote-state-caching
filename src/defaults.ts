import { KeySerializationMethod, WithSimpleCachingAsyncOptions } from 'with-simple-caching';

import shajs from 'sha.js';
import { RemoteStateCache } from '.';

export const defaultKeySerializationMethod: KeySerializationMethod<any> = ({ forInput }) =>
  [
    // display a preview of the request
    JSON.stringify(forInput)
      .replace(/[{}[\]:]/gi, '_')
      .replace(/[^0-9a-z_]/gi, '')
      .replace(/__+/g, '_')
      .slice(0, 50)
      .replace(/^_/, '')
      .replace(/_$/, ''), // stringify + replace all non-alphanumeric input

    // add a unique token, from the hashed inputs
    shajs('sha256').update(JSON.stringify(forInput)).digest('hex'),
  ].join('.');

export const defaultValueSerializationMethod: Required<WithSimpleCachingAsyncOptions<any, RemoteStateCache>>['serialize']['value'] = (output) =>
  JSON.stringify(output);

export const defaultValueDeserializationMethod: Required<WithSimpleCachingAsyncOptions<any, RemoteStateCache>>['deserialize']['value'] = (cached) =>
  JSON.parse(cached);
