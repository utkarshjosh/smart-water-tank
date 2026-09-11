import Constants from 'expo-constants';

/**
 * The only module that reads configuration. Everything comes from
 * app.config.ts via `expo.extra`; nothing in src/ touches process.env, so
 * there is no second mechanism to disagree with this one.
 */

type Extra = {
  apiUrl?: string;
  googleWebClientId?: string | null;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

function required(name: keyof Extra): string {
  const value = extra[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `Missing config "${name}". It is set in app.config.ts; a dev client built ` +
        'before it was added must be rebuilt.'
    );
  }
  return value;
}

// Expo turns a null `extra` value into {}, so presence is not enough — this
// has to be a non-empty string before the Google button is offered.
const googleWebClientId =
  typeof extra.googleWebClientId === 'string' && extra.googleWebClientId.length > 0
    ? extra.googleWebClientId
    : null;

export const env = {
  apiUrl: required('apiUrl'),
  /** Null until the OAuth web client id is wired; Google sign-in hides itself. */
  googleWebClientId,
} as const;
