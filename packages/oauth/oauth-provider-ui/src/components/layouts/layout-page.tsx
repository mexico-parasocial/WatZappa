import { MessageDescriptor } from '@lingui/core'
import { useLingui } from '@lingui/react'
import { ArrowLeftIcon, IconProps } from '@phosphor-icons/react'
import {
  Link,
  RegisteredRouter,
  ToPathOption,
  useMatchRoute,
} from '@tanstack/react-router'
import { clsx } from 'clsx'
import { FunctionComponent, ReactNode } from 'react'
import { LayoutApp } from '#/components/layouts/layout-app.tsx'
import { AccountSelector } from '#/components/utils/account-selector.tsx'

export type LayoutPageLink = {
  to: ToPathOption<RegisteredRouter, '/', undefined>
  title: string | MessageDescriptor
  hidden?: boolean
  description?: string | MessageDescriptor
  icon?: FunctionComponent<IconProps>
}

export type LayoutPageProps = {
  basePath: ToPathOption<RegisteredRouter, '/', undefined>
  title?: string | MessageDescriptor
  links: ReadonlyArray<LayoutPageLink>
  children?: ReactNode
  prepend?: ReactNode
}

/**
 * Tests whether a navigation target is the page currently being shown.
 *
 * @NOTE `to` is a path *template* (`/account/u/$accountId/manage`), so it never
 * equals the resolved pathname — the comparison has to go through the router.
 */
function useIsCurrentTarget() {
  const matchRoute = useMatchRoute()
  return ({ to }: { to: ToPathOption<RegisteredRouter, '/', undefined> }) =>
    to != null && matchRoute({ to, exact: true }) !== false
}

export function LayoutPage({
  children,
  basePath,
  title,
  links,
  prepend,
}: LayoutPageProps) {
  const { _ } = useLingui()
  const isCurrent = useIsCurrentTarget()

  const atBase = isCurrent({ to: basePath })

  const currentLink = links.find(isCurrent)
  const pageTitle = currentLink?.title
  const pageTitleStr = typeof pageTitle === 'object' ? _(pageTitle) : pageTitle

  return (
    <LayoutApp
      title={title}
      header={<AccountSelector className="shrink-0" size="lg" />}
    >
      {prepend}

      <div className="flex w-full flex-1 flex-col md:flex-row">
        <aside
          className={`shrink-0 p-4 md:px-8 ${atBase ? 'w-full md:w-auto' : 'hidden max-w-xs md:block'}`}
          role="navigation"
        >
          <nav className="flex flex-col gap-2">
            {links
              .filter(({ hidden, to }) => !hidden || isCurrent({ to }))
              .map(({ to, title, description, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className={clsx(
                    'flex items-center justify-start',
                    'min-h-12 px-4',
                    'rounded-3xl transition-colors',
                    'whitespace-nowrap font-medium md:whitespace-normal',
                    'focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2',
                    'text-text-default',
                    'md:text-text-light md:[&.active]:text-text-default',
                    'hover:bg-slate-100 dark:hover:bg-slate-800',
                    '[&.active]:bg-slate-100 dark:[&.active]:bg-slate-800',
                    atBase && isCurrent({ to }) && 'hidden md:flex',
                  )}
                  activeOptions={{ exact: true, includeSearch: false }}
                  activeProps={{
                    className: 'active',
                    'aria-current': 'page' as const,
                  }}
                >
                  {Icon && (
                    <span
                      aria-hidden="true"
                      className="bg-primary text-primary-contrast -ml-2 mb-auto mr-2 mt-2 inline-flex size-8 shrink-0 grow-0 items-center justify-center rounded-full"
                    >
                      <Icon className="size-4" />
                    </span>
                  )}
                  <span className="my-1 min-w-0 flex-1">
                    <span className="block truncate">
                      {typeof title === 'object' ? _(title) : title}
                    </span>
                    {description && (
                      <span className="block whitespace-pre-wrap text-xs md:hidden">
                        {typeof description === 'object'
                          ? _(description)
                          : description}
                      </span>
                    )}
                  </span>
                </Link>
              ))}
          </nav>
        </aside>

        <main
          className={clsx(
            'w-4xl mx-auto flex min-w-0 max-w-full flex-col px-4 md:px-8',
            { '-order-1 md:order-1': atBase },
          )}
          role="main"
        >
          {!atBase && (
            <nav className="mb-4 flex flex-none items-center gap-2">
              <Link
                to={basePath}
                key="back"
                className="text-text-light rounded-full p-2 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 md:hidden dark:hover:bg-slate-800"
              >
                <ArrowLeftIcon className="size-6" />
              </Link>
              {pageTitleStr && (
                <h2 className="text-text-default text-2xl font-light">
                  <title>{pageTitleStr}</title>
                  <b>{pageTitleStr}</b>
                </h2>
              )}
            </nav>
          )}

          <div className="flex-auto">{children}</div>
        </main>
      </div>
    </LayoutApp>
  )
}
