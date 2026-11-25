import { useSession } from '../auth/session'

/** SCRUM-13-AC-12, NFR-10: who is signed in, and a keyboard-accessible Log out control. */
export function UserMenu() {
  const session = useSession()
  if (!session) return null
  const { user, signOut } = session
  return (
    <div className="user-menu">
      <span>
        Signed in as <strong title={user.email ?? undefined}>{user.username}</strong>
      </span>
      <button type="button" onClick={signOut}>
        Log out
      </button>
    </div>
  )
}
