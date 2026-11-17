/** SCRUM-1-NFR-09: unobtrusive build identity (Jira key + short commit). */
export function BuildInfo() {
  const sha = __GIT_SHA__
  return (
    <small className="build-info" title={sha}>
      {__JIRA_KEY__} · {sha.slice(0, 7)}
    </small>
  )
}
