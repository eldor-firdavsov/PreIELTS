import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, ErrorState } from '../design-system/index.ts';

/**
 * The end of every loading state that would otherwise never end.
 *
 * A `Suspense` fallback is a promise that content is coming. Two things break
 * that promise and neither was caught anywhere in this app: a lazy route chunk
 * that fails to download, which is the ordinary outcome of a dropped connection
 * mid-navigation, and a render that throws. The first left a skeleton pulsing
 * for ever, which is the most dishonest screen the product can show — it says
 * "still working" about something that has already failed. The second unmounted
 * the tree and left white.
 *
 * So every Suspense boundary in the router has one of these outside it. React
 * re-throws a rejected lazy import through the nearest boundary, which is this.
 *
 * Reset rather than reload where we can: `Try again` clears the error and lets
 * the subtree mount again, which re-attempts the failed chunk. A full reload is
 * offered alongside it, because a stale build whose chunks no longer exist on
 * the server can only be fixed by fetching the new index.
 */

interface Props {
  children: ReactNode;
  /** What the student was trying to reach, for the sentence they are shown. */
  what?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The console is the only place this can go: there is no error service, and
    // inventing one here would be a bigger decision than this file.
    console.error('unhandled render error:', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    // A failed dynamic import is a network problem, not a bug, and saying so is
    // the difference between a student retrying and a student giving up.
    const isChunkFailure =
      /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(
        error.message,
      );

    return (
      <div className="mx-auto w-full max-w-lg px-4 py-16">
        <ErrorState
          title={isChunkFailure ? 'This page could not be downloaded' : 'Something went wrong'}
          description={
            isChunkFailure
              ? `The connection dropped while loading ${this.props.what ?? 'this page'}. Nothing you have done has been lost.`
              : error.message
          }
          onRetry={() => this.setState({ error: null })}
        />
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
            Reload the page
          </Button>
        </div>
      </div>
    );
  }
}
