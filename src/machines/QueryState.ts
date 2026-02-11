import { QueryState as QueryState_ } from '@matheuspuel/query-state'
import { DateTime, Effect, pipe, Schedule } from 'effect'
import { make, mapActions, StateMachine } from '../definition.js'
import { of } from './of.js'

export const QueryState = <A, E, P = undefined>() =>
  mapActions(of(QueryState_.initial<A, E, P>()), actions => ({
    ...actions,
    start: (loading: { progress: P }) =>
      actions.update(_ =>
        _.start({
          time: DateTime.unsafeNow(),
          progress: loading.progress,
        } as any),
      ),
    succeed: (success: { data: A }) =>
      actions.update(_ =>
        _.succeed({ time: DateTime.unsafeNow(), data: success.data }),
      ),
    fail: (failure: { error: E }) =>
      actions.update(_ =>
        _.fail({ time: DateTime.unsafeNow(), error: failure.error }),
      ),
    invalidate: () => actions.update(_ => _.invalidate()),
  }))

export const trackEffect: {
  <A, E, P, I = void>(
    effect: (input: I) => Effect.Effect<A, E>,
    options: {
      initialProgress: P
      runOnStart?: { input: I } | (I extends void ? true : never)
      retry?: Schedule.Schedule<any, E>
    },
  ): StateMachine<
    QueryState_<A, E, P>,
    ReturnType<ReturnType<typeof QueryState<A, E, P>>['actions']> & {
      submit: (input: I) => Effect.Effect<A, E>
    }
  >
  <A, E, I = void>(
    effect: (input: I) => Effect.Effect<A, E>,
    options?: {
      initialProgress?: undefined
      runOnStart?: { input: I } | (I extends void ? true : never)
      retry?: Schedule.Schedule<any, E>
    },
  ): StateMachine<
    QueryState_<A, E, undefined>,
    ReturnType<ReturnType<typeof QueryState<A, E, undefined>>['actions']> & {
      submit: (input: I) => Effect.Effect<A, E>
    }
  >
} = <A, E, P, I = void>(
  effect: (input: I) => Effect.Effect<A, E>,
  options?: {
    initialProgress?: P
    runOnStart?: { input: I } | (I extends void ? true : never)
    retry?: Schedule.Schedule<any, E>
  },
): StateMachine<
  QueryState_<A, E, P>,
  ReturnType<ReturnType<typeof QueryState<A, E, P>>['actions']> & {
    submit: (input: I) => Effect.Effect<A, E>
  }
> =>
  pipe(
    mapActions(QueryState<A, E, P>(), actions => ({
      ...actions,
      submit: (input: I) =>
        QueryState_.trackEffect(actions.update, effect, {
          initialProgress: options?.initialProgress as P,
        })(input).pipe(_ =>
          options?.retry ? Effect.retry(_, options.retry) : _,
        ),
    })),
    _ =>
      options?.runOnStart
        ? pipe(options.runOnStart, options =>
            make<typeof _.initialState>()({
              ..._,
              start: machine =>
                _.actions(machine)
                  .submit(options === true ? (undefined as I) : options.input)
                  .pipe(Effect.runPromiseExit),
            }),
          )
        : _,
  )
