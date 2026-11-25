/** SCRUM-13-AC-14, AC-26f: signed in, but without the application role — a clear message, no login loop. */
export function NoAccessPage({ username, onSignOut }: { username: string; onSignOut: () => void }) {
  return (
    <main className="auth-page">
      <h1>You do not have access to this application</h1>
      <p>
        Signed in as <strong>{username}</strong>. Your account has no access to the To-Do application. Ask for the
        To-Do user entitlement, or sign in with another account.
      </p>
      <button type="button" onClick={onSignOut}>
        Log out
      </button>
    </main>
  )
}
