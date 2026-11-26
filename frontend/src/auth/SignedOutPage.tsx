/** SCRUM-13-AC-12: public page after logout (post_logout_redirect_uri); no task data, no API call. */
export function SignedOutPage({ onSignIn }: { onSignIn: () => void }) {
  return (
    <main className="auth-page">
      <h1>You are signed out</h1>
      <p>You have been signed out of the To-Do application and of Corp SSO.</p>
      <button type="button" onClick={onSignIn}>
        Sign in again
      </button>
    </main>
  )
}
