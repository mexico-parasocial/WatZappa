import { msg } from '@lingui/core/macro'
import {
  DevicesIcon,
  GlobeIcon,
  HouseSimpleIcon,
  QuestionIcon,
  UserIcon,
} from '@phosphor-icons/react'
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { FunctionComponent, useMemo } from 'react'
import { IconProps } from '@phosphor-icons/react'
import {
  LayoutPage,
  LayoutPageLink,
} from '#/components/layouts/layout-page.tsx'
import { ProvideAuthenticatedSession } from '#/contexts/authentication.tsx'
import { useSessionContext } from '#/contexts/session.tsx'

/**
 * The account manager's authenticated frame: the guard, the session the URL
 * names, and the shell every sub-page renders into.
 */
export const Route = createFileRoute('/account/u/$accountId')({
  beforeLoad: ({ context: { auth }, params: { accountId } }) => {
    const session = auth.sessions.find(
      (s) => s.account.handle === accountId || s.account.did === accountId,
    )

    // The URL names an account this device has no usable session for — either
    // it never did, or the user just signed out. The account entry decides
    // where they belong now.
    if (!session || session.loginRequired) {
      throw redirect({ to: '/account', replace: true })
    }

    // Everything below this route — including its loaders — reads the session
    // from here rather than resolving it again.
    return { session }
  },
  component: AccountLayout,
})

type SubPage = {
  title: string | ReturnType<typeof msg>
  icon?: FunctionComponent<IconProps>
  hidden?: boolean
  position?: number
  description?: string | ReturnType<typeof msg>
}

const DEFAULT_PAGES: Record<string, SubPage> = {
  '/': {
    icon: HouseSimpleIcon,
    position: 0,
    title: msg`Home`,
  },
  '/manage': {
    icon: UserIcon,
    position: 10,
    title: msg`Account`,
    description: msg`Manage your account`,
  },
  '/devices': {
    icon: DevicesIcon,
    position: 20,
    title: msg`Devices`,
    description: msg`Manage your active sessions`,
  },
  '/apps': {
    icon: GlobeIcon,
    position: 30,
    title: msg`Apps`,
    description: msg`Manage applications that have access to your account`,
  },
  '/about': {
    icon: QuestionIcon,
    position: 50,
    title: msg`About`,
    description: msg`What is an Atmosphere Account?`,
  },
}

function AccountLayout() {
  const { accountId } = Route.useParams()
  const { session } = Route.useRouteContext()
  const { sessions, api, canSwitchAccounts } = useSessionContext()

  const basePath = `/account/u/${accountId}` as const

  const links = useMemo<readonly LayoutPageLink[]>(() => {
    return Object.entries(DEFAULT_PAGES)
      .sort(([, a], [, b]) => {
        if (a.position != null && b.position != null) {
          const diff = a.position - b.position
          if (diff !== 0) return diff
        }
        return 0
      })
      .map(([subPath, page]): LayoutPageLink => ({
        to: subPath === '/' ? basePath : `${basePath}${subPath}`,
        title: page.title,
        description: page.description,
        hidden: page.hidden,
        icon: page.icon,
      }))
  }, [basePath])

  const value = useMemo(
    () => ({ session, sessions, canSwitchAccounts, api }),
    [session, sessions, canSwitchAccounts, api],
  )

  return (
    <ProvideAuthenticatedSession value={value}>
      <LayoutPage
        title={msg`My Atmosphere Account`}
        basePath={basePath}
        links={links}
      >
        <Outlet />
      </LayoutPage>
    </ProvideAuthenticatedSession>
  )
}
