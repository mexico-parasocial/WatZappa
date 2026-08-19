import { createFileRoute } from '@tanstack/react-router'
import { Page } from '#/pages/account/(authenticated)/about/page.tsx'

export const Route = createFileRoute('/account/u/$accountId/about')({
  component: Page,
})
