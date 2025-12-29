import { Effect, Equal, Equivalence } from 'effect'
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/with-selector'
import { AnyStateActions } from '../index.js'
import { RunningStateMachine } from '../runtime'

export const makeUseSelector =
  <State, Actions extends AnyStateActions>(
    stateMachine: RunningStateMachine<State, Actions>,
  ) =>
  <A>(
    selector: (state: State) => A,
    equivalence?: Equivalence.Equivalence<A>,
  ): A =>
    useSyncExternalStoreWithSelector<State, A>(
      onChange => {
        const subscription = stateMachine
          .subscribe(() => Effect.sync(onChange))
          .pipe(Effect.runSync)
        return () => subscription.unsubscribe.pipe(Effect.runSync)
      },
      () => stateMachine.ref.get.pipe(Effect.runSync),
      undefined,
      selector,
      equivalence ?? Equal.equivalence<A>(),
    )
