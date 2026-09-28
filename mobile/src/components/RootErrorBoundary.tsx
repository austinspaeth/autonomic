/**
 * The app's one error boundary, around the whole root layout.
 *
 * Without it, a render error was the one failure the error log could not see.
 * React hands an error it caught but nobody handled to React Native's
 * `ReactFiberErrorDialog`, which calls `ExceptionsManager.handleException`
 * DIRECTLY — not through `ErrorUtils`, so `installErrorLogging`'s hook never
 * ran — and marks it non-fatal. React then unmounts the root. A release build
 * was left on a blank screen with nothing in the log, no fault report, and a
 * support dump that said nothing had gone wrong.
 *
 * So this does two things. It logs the error as `render.uncaught`, fatal (the
 * app was unusable), carrying the same where-were-you context as the global
 * hook (lib/diagnostics/crashContext) — the tag cannot say where, since every
 * render error lands here. And it replaces the blank screen with one sentence
 * and a Restart, which reloads the bundle rather than re-rendering the same
 * tree into the same error.
 *
 * The fallback reads no theme, store or font: it runs after something in that
 * tree already failed, so it depends on as little of it as possible.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { logError, uncaughtContext } from '../lib/diagnostics/errorLog';

interface State { failed: boolean }

export class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    logError('render.uncaught', error, { fatal: true, context: uncaughtContext() });
  }

  private restart = () => {
    // A dev client or a build with updates disabled cannot reload this way;
    // re-mounting the tree is the next best thing.
    Updates.reloadAsync().catch(() => this.setState({ failed: false }));
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>
          Something went wrong
        </Text>
        <Text style={{ color: '#9a9a9a', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>
          Your journal is safe. Restarting the app should fix this.
        </Text>
        <Pressable
          onPress={this.restart}
          accessibilityRole="button"
          style={{ backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 28, paddingVertical: 12 }}
        >
          <Text style={{ color: '#000', fontSize: 15, fontWeight: '700' }}>Restart</Text>
        </Pressable>
      </View>
    );
  }
}
