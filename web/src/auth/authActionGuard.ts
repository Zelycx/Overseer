export const AUTH_ACTION_IN_PROGRESS_MESSAGE = 'An authentication action is already in progress. Please wait for it to finish.'

export type AuthActionOutcome<T> =
  | { status: 'success'; value: T }
  | { status: 'failure'; error: unknown }
  | { status: 'busy' }

export class AuthActionGuard {
  private running = false

  get isRunning(): boolean {
    return this.running
  }

  run<T>(action: () => Promise<T>): Promise<AuthActionOutcome<T>> {
    if (this.running) return Promise.resolve({ status: 'busy' })

    this.running = true
    return this.execute(action)
  }

  private async execute<T>(action: () => Promise<T>): Promise<AuthActionOutcome<T>> {
    try {
      return { status: 'success', value: await action() }
    } catch (error) {
      return { status: 'failure', error }
    } finally {
      this.running = false
    }
  }
}
