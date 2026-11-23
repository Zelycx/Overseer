export const EMULATOR_PROJECT_ID = 'demo-overseer-web'

const FIREBASE_CONFIG_FIELDS = [
  ['VITE_FIREBASE_API_KEY', 'apiKey'],
  ['VITE_FIREBASE_AUTH_DOMAIN', 'authDomain'],
  ['VITE_FIREBASE_PROJECT_ID', 'projectId'],
  ['VITE_FIREBASE_APP_ID', 'appId'],
]

/** Resolve optional Firebase configuration without supplying fallback values. */
export function resolveFirebaseConfiguration(environment, isProduction) {
  const emulatorSetting = environment.VITE_USE_FIREBASE_EMULATORS

  if (emulatorSetting !== undefined && emulatorSetting !== 'true' && emulatorSetting !== 'false') {
    return {
      config: null,
      error: 'VITE_USE_FIREBASE_EMULATORS must be exactly "true" or "false"; casing, whitespace, and empty values are not accepted.',
    }
  }

  if (isProduction && emulatorSetting === 'true') {
    return {
      config: null,
      error: 'VITE_USE_FIREBASE_EMULATORS cannot be "true" in a production build. Set it to "false" to use the explicitly configured production project.',
    }
  }

  const providedFields = FIREBASE_CONFIG_FIELDS.filter(([environmentName]) => environment[environmentName] !== undefined)
  if (providedFields.length === 0) {
    if (emulatorSetting !== undefined) {
      return {
        config: null,
        error: `Firebase mode "${emulatorSetting}" was explicitly selected, but Firebase configuration is missing. Set all required VITE_FIREBASE_* variables; no production fallback is used.`,
      }
    }
    return { config: null, error: null }
  }

  const missingFields = FIREBASE_CONFIG_FIELDS
    .filter(([environmentName]) => !environment[environmentName]?.trim())
    .map(([environmentName]) => environmentName)
  if (missingFields.length > 0) {
    return {
      config: null,
      error: `Firebase configuration is incomplete. Provide non-empty values for: ${missingFields.join(', ')}. No production fallback is used.`,
    }
  }

  if (emulatorSetting !== 'true' && emulatorSetting !== 'false') {
    const mode = isProduction ? 'production' : 'development'
    return {
      config: null,
      error: `Firebase is configured for ${mode}, so VITE_USE_FIREBASE_EMULATORS must be explicitly set to "true" or "false".`,
    }
  }

  const config = Object.fromEntries(
    FIREBASE_CONFIG_FIELDS.map(([environmentName, configName]) => [configName, environment[environmentName].trim()]),
  )
  const useEmulators = emulatorSetting === 'true'

  return {
    config: {
      ...config,
      projectId: useEmulators ? EMULATOR_PROJECT_ID : config.projectId,
      useEmulators,
    },
    error: null,
  }
}

/** Initialize only when configuration is complete; SDK initialization errors propagate. */
export function initializeIfConfigured(result, initialize, reportError) {
  if (result.error) {
    reportError(result.error)
    return false
  }
  if (!result.config) return false

  initialize(result.config)
  return true
}

/** Fail with the original configuration diagnostic when a Firebase service is requested. */
export function requireFirebaseConfiguration(result) {
  if (result.error) throw new Error(`Firebase is unavailable: ${result.error}`)
  if (!result.config) {
    throw new Error('Firebase is unavailable because no Firebase configuration was supplied. Configure the required VITE_FIREBASE_* variables before using a Firebase-dependent operation.')
  }
  return result.config
}
