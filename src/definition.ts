import { Optic } from '@matheuspuel/optic'

export type StoreBase<State> = {
  get: () => State
  update: (stateUpdate: (_: State) => State) => void
}

export type Store<State> = StoreBase<State> & {
  zoom: <A, Optional extends boolean>(
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

export type StateMachine<State, Actions extends AnyStateActions> = {
  initialState: State
  actions: (machine: { Store: Store<State> }) => Actions
  start?: (machine: { Store: Store<State> }) => undefined | Promise<unknown>
  onUpdate?: (state: State) => void | Promise<void>
}

export type AnyStateMachineWithActions<Actions extends AnyStateActions> = {
  initialState: any
  actions: (machine: { Store: any }) => Actions
  start?: (machine: { Store: any }) => undefined | Promise<unknown>
  onUpdate?: (state: any) => void | Promise<void>
}

export const make = <State, Actions extends AnyStateActions>(
  args: StateMachine<State, Actions>,
) => args

export const withState = <State>() => ({
  make: <Actions extends AnyStateActions>(args: StateMachine<State, Actions>) =>
    args,
})

export type PreparedStateActions<Actions extends AnyStateActions> = Actions

export const prepareActions = <State, Actions extends AnyStateActions>(
  machine: StateMachine<State, Actions>,
  store: Store<State>,
): PreparedStateActions<Actions> => machine.actions({ Store: store })

export const mapActions = <
  State,
  Actions extends AnyStateActions,
  NextActions extends AnyStateActions,
>(
  self: StateMachine<State, Actions>,
  f: (actions: Actions, machine: { Store: Store<State> }) => NextActions,
): StateMachine<State, NextActions> =>
  make({
    ...self,
    actions: machine => ({ ...f(self.actions(machine), machine) }),
  })
