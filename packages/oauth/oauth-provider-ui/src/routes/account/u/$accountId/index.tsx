import { createFileRoute } from '@tanstack/react-router'
import { Page } from '#/pages/account/(authenticated)/page.tsx'

export const Route = createFileRoute('/account/u/$accountId/')({
  component: Page,
})
