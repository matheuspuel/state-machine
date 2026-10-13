import { Array, Effect, Ref } from 'effect'
import {
  type AnyStateActions,
  makeStore,
  prepareActions,
  type PreparedStateActions,
  type StateMachine,
} from '../definition.js'

type SubscriptionTask<State> = (state: State) => Effect.Effect<void>

export type Instance<State, Actions extends AnyStateActions> = {
  ref: Ref.Ref<State>
  actions: PreparedStateActions<Actions>
  startPromise: Promise<unknown> | undefined
  subscribe: (
    task: SubscriptionTask<State>,
  ) => Effect.Effect<{ unsubscribe: Effect.Effect<void> }>
}

export const run = <State, Actions extends AnyStateActions>(
  machine: StateMachine<State, Actions>,
): Instance<State, Actions> => {
  const subscriptionsRef = Ref.makeUnsafe<SubscriptionTask<State>[]>([])
  const ref = Ref.makeUnsafe(machine.initialState)
  const store = makeStore<State>({
    get: () => Ref.get(ref).pipe(Effect.runSync),
    update: fn =>
      Effect.gen(function* () {
        const previousState = yield* Ref.get(ref)
        const state = fn(previousState)
        yield* Ref.set(ref, state)
        yield* Effect.forEach(yield* Ref.get(subscriptionsRef), _ =>
          _(state),
        ).pipe(Effect.exit)
        void machine.onUpdate?.(state)
      }).pipe(Effect.runSync),
  })
  const actions = prepareActions(machine, store)
  const subscribe = (task: SubscriptionTask<State>) =>
    Effect.gen(function* () {
      yield* Ref.update(subscriptionsRef, Array.append(task))
      return {
        unsubscribe: Ref.update(
          subscriptionsRef,
          Array.filter(_ => _ !== task),
        ),
      }
    })
  const startPromise = machine.start?.({ Store: store })
  return { ref, actions, subscribe, startPromise }
}
