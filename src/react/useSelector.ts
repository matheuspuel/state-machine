import { Effect, Equal, type Equivalence, Ref } from 'effect'
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/with-selector'
import type { AnyStateActions } from '../definition.js'
import type { Instance } from '../runtime/index.js'

export const makeUseSelector =
  <State, Actions extends AnyStateActions>(
    stateMachine: Instance<State, Actions>,
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
      () => Ref.getUnsafe(stateMachine.ref),
      undefined,
      selector,
      equivalence ?? Equal.asEquivalence<A>(),
    )
