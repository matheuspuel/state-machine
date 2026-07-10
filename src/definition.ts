import { Optic } from '@matheuspuel/optic'

type IsAny<T> = 0 extends 1 & T ? true : false

export type StoreBase<State> = {
  get: () => State
  update: (stateUpdate: (_: State) => State) => void
}

export type Store<State> = StoreBase<State> & {
  zoom: IsAny<State> extends true
    ? any
    : <A, Optional extends boolean>(
        f: (optic: Optic<State, State>) => Optic<A, State, Optional>,
      ) => StoreBase<A>
}

export const makeStore = <State>(base: StoreBase<State>): Store<State> => ({
  ...base,
  zoom: zoomF => ({
    get: () => (zoomF(Optic.id<State>()) as any).get(base.get()),
    getOption: () => zoomF(Optic.id<State>()).getOption(base.get()),
    update: f => base.update(zoomF(Optic.id<State>()).update(f)),
  }),
})

export type StateAction<A extends unknown[], B> = (...args: A) => B

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyStateAction = StateAction<any[], unknown>

export type AnyStateActions = {
  [key: string]: AnyStateAction | AnyStateActions
}

export type StateMachineProperties<State, Actions extends AnyStateActions> = {
  initialState: State
  actions: (machine: { Store: Store<State> }) => Actions
  start?: (machine: { Store: Store<State> }) => undefined | Promise<unknown>
  onUpdate?: (state: State) => void | Promise<void>
}

export type StateMachine<
  State,
  Actions extends AnyStateActions,
> = StateMachineProperties<State, Actions> & {
  mapActions: <NextActions extends AnyStateActions>(
    f: (actions: Actions, machine: { Store: Store<State> }) => NextActions,
  ) => StateMachine<State, NextActions>
}

export type AnyStateMachineWithActions<Actions extends AnyStateActions> = {
  initialState: any
  actions: (machine: { Store: any }) => Actions
  start?: (machine: { Store: any }) => undefined | Promise<unknown>
  onUpdate?: (state: any) => void | Promise<void>
  mapActions: <NextActions extends AnyStateActions>(
    f: (actions: Actions, machine: { Store: Store<any> }) => NextActions,
  ) => StateMachine<any, NextActions>
}

export const make = <State, Actions extends AnyStateActions>(
  args: StateMachineProperties<State, Actions>,
): StateMachine<State, Actions> => ({
  ...args,
  mapActions: f =>
    make({
      ...args,
      actions: machine => ({ ...f(args.actions(machine), machine) }),
    }),
})

export const withState = <State>() => ({
  make: <Actions extends AnyStateActions>(
    args: StateMachineProperties<State, Actions>,
  ): StateMachine<State, Actions> => make(args),
})

export type PreparedStateActions<Actions extends AnyStateActions> = Actions

export const prepareActions = <State, Actions extends AnyStateActions>(
  machine: StateMachine<State, Actions>,
  store: Store<State>,
): PreparedStateActions<Actions> => machine.actions({ Store: store })
