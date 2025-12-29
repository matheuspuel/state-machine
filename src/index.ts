import { Optic } from '@matheuspuel/optic'

export type MachineStoreBase<State> = {
  get: () => State
  update: (stateUpdate: (_: State) => State) => void
}

export type MachineStore<State> = MachineStoreBase<State> & {
  zoom: <A, Optional extends boolean>(
    f: (optic: Optic<State, State>) => Optic<A, State, Optional>,
  ) => MachineStoreBase<A>
}

export const makeMachineStore = <State>(
  base: MachineStoreBase<State>,
): MachineStore<State> => ({
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

export type AnyStateActions = Record<string, AnyStateAction>

export type StateMachine<State, Actions extends AnyStateActions> = {
  initialState: State
  actions: (machine: { Store: MachineStore<State> }) => Actions
  start?: (machine: {
    Store: MachineStore<State>
  }) => undefined | Promise<unknown>
  onUpdate?: (state: State) => void | Promise<void>
}

export const makeStateMachine =
  <State>() =>
  <Actions extends AnyStateActions>(args: StateMachine<State, Actions>) =>
    args

export type PreparedStateActions<Actions extends AnyStateActions> = Actions

export const prepareStateMachineActions = <
  State,
  Actions extends AnyStateActions,
>(
  machine: StateMachine<State, Actions>,
  store: MachineStore<State>,
): PreparedStateActions<Actions> => machine.actions({ Store: store })
