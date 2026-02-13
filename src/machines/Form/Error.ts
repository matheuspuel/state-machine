import { Data } from 'effect'

export class ValidationError<E> extends Data.TaggedError(
  'FormValidationError',
)<{ error: E }> {}
