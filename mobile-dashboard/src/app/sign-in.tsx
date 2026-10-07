/* Email, then the 4-digit code from the (DiscoveryMark-branded) email. The
   magic link in that email will not sign you in here, so it is never mentioned. */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Auth from '../lib/auth';
import { C, num } from '../theme';

const CODE_LENGTH = 4;
const RESEND_COOLDOWN = 20;

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<TextInput>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await Auth.startChallenge(e);
      setStep('code');
      setCode('');
      setCooldown(RESEND_COOLDOWN);
      setTimeout(() => codeRef.current?.focus(), 100);
    } catch (err: any) {
      setError(err.message || 'Could not send a sign-in code.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    setBusy(true);
    setError('');
    try {
      await Auth.answerChallenge(value);
      // The root layout's guard swaps to the tabs on its own.
    } catch (err: any) {
      setCode('');
      if (err.code === 'NotAuthorizedException') {
        setError('That session expired. Enter your email to get a new code.');
        setStep('email');
      } else {
        setError(err.message || 'That code is not right.');
        codeRef.current?.focus();
      }
    } finally {
      setBusy(false);
    }
  };

  const onCode = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH && !busy) verify(digits);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[s.root, { paddingTop: insets.top + 80, paddingBottom: insets.bottom + 24 }]}
    >
      <Text style={s.brand}>Autonomic</Text>
      <Text style={s.title}>Master</Text>

      {step === 'email' ? (
        <View style={s.form}>
          <Text style={s.help}>Sign in with your email. We will send you a 4-digit code.</Text>
          <TextInput
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setError('');
            }}
            placeholder="you@example.com"
            placeholderTextColor={C.muted}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="go"
            onSubmitEditing={send}
            style={s.input}
            autoFocus
          />
          <Pressable onPress={send} disabled={busy} style={({ pressed }) => [s.button, (pressed || busy) && { opacity: 0.7 }]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Continue</Text>}
          </Pressable>
        </View>
      ) : (
        <View style={s.form}>
          <Text style={s.help}>
            Enter the code sent to <Text style={{ color: C.text }}>{email.trim().toLowerCase()}</Text>
          </Text>
          <Pressable onPress={() => codeRef.current?.focus()} style={s.codeRow}>
            {Array.from({ length: CODE_LENGTH }).map((_, i) => (
              <View key={i} style={[s.digit, code.length === i && s.digitOn]}>
                <Text style={[s.digitText, num]}>{code[i] || ''}</Text>
              </View>
            ))}
          </Pressable>
          <TextInput
            ref={codeRef}
            value={code}
            onChangeText={onCode}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            style={s.hidden}
            autoFocus
          />
          {busy ? <ActivityIndicator color={C.dim} /> : null}
          <View style={s.links}>
            <Pressable onPress={() => setStep('email')}>
              <Text style={s.link}>Use a different email</Text>
            </Pressable>
            <Pressable onPress={send} disabled={cooldown > 0 || busy}>
              <Text style={[s.link, cooldown > 0 && { color: C.muted }]}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {error ? <Text style={s.error}>{error}</Text> : null}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 24 },
  brand: { color: C.accent, fontSize: 15, fontWeight: '700', letterSpacing: 0.4 },
  title: { color: C.text, fontSize: 40, fontWeight: '800', letterSpacing: -1, marginBottom: 32 },
  form: { gap: 16 },
  help: { color: C.dim, fontSize: 15, lineHeight: 21 },
  input: {
    backgroundColor: C.surface,
    color: C.text,
    fontSize: 17,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  button: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  codeRow: { flexDirection: 'row', gap: 12 },
  digit: {
    flex: 1,
    aspectRatio: 0.9,
    backgroundColor: C.surface,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  digitOn: { borderColor: C.dim },
  digitText: { color: C.text, fontSize: 30, fontWeight: '700' },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  links: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { color: C.text, fontSize: 15, fontWeight: '500' },
  error: { color: C.down, fontSize: 14, marginTop: 16 },
});
