import { Effect, Schema } from 'effect'
import { ParseError } from 'effect/ParseResult'

export type AnyForm = {
  [key: string]: AnyForm | FormField<any, any, any>
}

export type FormField<A, I, E> = {
  initial: I
  validate: (value: I) => Effect.Effect<A, E>
  fromData: (data: A) => I
}

export const field = <A, I, E>(args: FormField<A, I, E>) => args

export const fieldSchema = <A, I>(args: {
  initial: I
  schema: Schema.Schema<A, I>
}) =>
  field<A, I, ParseError>({
    initial: args.initial,
    validate: Schema.decode(args.schema),
    fromData: Schema.encodeSync(args.schema),
  })

export const fieldSuccess = <A>(args: { initial: A }) =>
  field<A, A, never>({
    initial: args.initial,
    validate: Effect.succeed,
    fromData: _ => _,
  })

export const Struct = <Fields extends AnyForm>(fields: Fields) => fields
