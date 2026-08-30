import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import type { QueryClient } from '@tanstack/react-query'
import {
  Link,
  Outlet,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { ErrorView } from '#/components/error-view.tsx'
import { Button } from '#/components/forms/button.tsx'
import type { SessionStore } from '#/contexts/session.tsx'
import type { Api } from '#/lib/api.ts'

/**
 * Everything a route's `beforeLoad` or `loader` needs, none of which it can
 * reach through React. Supplied at `<RouterProvider context={…}/>`.
 */
export type RouterContext = {
  auth: SessionStore
  api: Api
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  errorComponent: ErrorView,
  notFoundComponent: NotFoundComponent,
})

function RootComponent() {
  return <Outlet />
}

function NotFoundComponent() {
  const { t } = useLingui()
  return (
    <ErrorView title={msg`Page not found`}>
      <Button>
        <Link to="/account">{t`Back`}</Link>
      </Button>
    </ErrorView>
  )
}
