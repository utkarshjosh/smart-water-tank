import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { describeAuthError, useAuth } from '@/auth/AuthProvider';
import { googleSignInAvailable } from '@/auth/google';
import { Button, Divider, Label, Text } from '@/ui/components';
import { GlassTank } from '@/viz/GlassTank';
import { radius, space, useTheme } from '@/ui/theme';

type Mode = 'sign-in' | 'sign-up' | 'reset';

export default function SignInScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const auth = useAuth();

  const [mode, setMode] = useState<Mode>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const canSubmit =
    mode === 'reset' ? email.trim().length > 3 : email.trim().length > 3 && password.length >= 6 && (mode === 'sign-in' || name.trim().length > 0);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (err) {
      // An empty message means the user cancelled — not worth showing.
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  const submit = () =>
    run(async () => {
      if (mode === 'sign-in') {
        await auth.signInWithEmail(email, password);
      } else if (mode === 'sign-up') {
        await auth.signUpWithEmail(name, email, password);
      } else {
        await auth.sendPasswordReset(email);
        setNotice('Check your inbox for a reset link.');
        setMode('sign-in');
      }
    });

  const inputStyle = [
    styles.input,
    { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground },
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <GlassTank level={68} width={72} height={104} />
          <View style={styles.heroText}>
            <Text variant="display">AquaMind</Text>
            <Text variant="body" color="mutedForeground">
              {mode === 'sign-up'
                ? 'Create an account for your tanks.'
                : mode === 'reset'
                  ? 'We will email you a reset link.'
                  : 'Water level, wherever you are.'}
            </Text>
          </View>
        </View>

        <View style={styles.form}>
          {mode === 'sign-up' && (
            <View style={styles.field}>
              <Label>Name</Label>
              <TextInput
                style={inputStyle}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoComplete="name"
                placeholder="Your name"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="next"
              />
            </View>
          )}

          <View style={styles.field}>
            <Label>Email</Label>
            <TextInput
              style={inputStyle}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="next"
            />
          </View>

          {mode !== 'reset' && (
            <View style={styles.field}>
              <Label>Password</Label>
              <TextInput
                style={inputStyle}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                placeholder="At least 6 characters"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="go"
                onSubmitEditing={() => canSubmit && submit()}
              />
            </View>
          )}

          {!!error && (
            <Text variant="caption" color="crit">
              {error}
            </Text>
          )}
          {!!notice && (
            <Text variant="caption" color="ok">
              {notice}
            </Text>
          )}

          <Button
            title={mode === 'sign-up' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
            onPress={submit}
            disabled={!canSubmit}
            loading={busy}
          />

          {googleSignInAvailable() && mode !== 'reset' && (
            <>
              <View style={styles.orRow}>
                <View style={styles.line}><Divider /></View>
                <Text variant="label" color="mutedForeground" style={styles.or}>
                  OR
                </Text>
                <View style={styles.line}><Divider /></View>
              </View>
              <Button
                title="Continue with Google"
                variant="secondary"
                onPress={() => run(auth.signInWithGoogle)}
                disabled={busy}
              />
            </>
          )}

          <View style={styles.links}>
            <Pressable
              onPress={() => {
                setError('');
                setNotice('');
                setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
              }}
              hitSlop={8}
            >
              <Text variant="caption" color="primary">
                {mode === 'sign-in' ? 'Create an account' : 'I already have an account'}
              </Text>
            </Pressable>

            {mode !== 'reset' && (
              <Pressable onPress={() => { setError(''); setMode('reset'); }} hitSlop={8}>
                <Text variant="caption" color="mutedForeground">
                  Forgot password
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, gap: space.xxl, justifyContent: 'center', paddingHorizontal: space.xl },
  hero: { alignItems: 'center', flexDirection: 'row', gap: space.lg },
  heroText: { flex: 1, gap: space.xs },
  form: { gap: space.lg },
  field: { gap: space.xs },
  input: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: space.md,
  },
  orRow: { alignItems: 'center', flexDirection: 'row', gap: space.md },
  line: { flex: 1 },
  or: { width: 24, textAlign: 'center' },
  links: { alignItems: 'center', gap: space.md, marginTop: space.xs },
});
