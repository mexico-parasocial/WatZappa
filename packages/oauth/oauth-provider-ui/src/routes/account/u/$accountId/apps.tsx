import { createFileRoute } from '@tanstack/react-router'
import { Trans } from '@lingui/react/macro'
import { Page } from '#/pages/account/(authenticated)/apps/page.tsx'
import { oauthSessionsQueryKey } from '#/data/oauth-sessions.ts'
import { Admonition, AdmonitionAction } from '#/components/utils/admonition.tsx'

export const Route = createFileRoute('/account/u/$accountId/apps')({
  loader: ({ context: { api, queryClient, auth }, params: { accountId } }) => {
    const session = auth.sessions.find(
      (s) => s.account.handle === accountId || s.account.did === accountId,
    )
    if (session) {
      return queryClient.ensureQueryData({
        queryKey: oauthSessionsQueryKey({ did: session.account.did }),
        queryFn: ({ signal }) =>
          api.oauthSessions({ did: session.account.did }, { signal }),
      })
    }
  },
  component: Page,
  errorComponent: ({ reset }) => (
    <Admonition
      role="status"
      action={
        <AdmonitionAction onClick={reset}>
          <Trans>Retry</Trans>
        </AdmonitionAction>
      }
    >
      <Trans>Failed to load connected apps</Trans>
    </Admonition>
  ),
})
