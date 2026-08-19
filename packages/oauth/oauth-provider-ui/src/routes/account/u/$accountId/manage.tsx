import { createFileRoute } from '@tanstack/react-router'
import { Page } from '#/pages/account/(authenticated)/manage/page.tsx'

export const Route = createFileRoute('/account/u/$accountId/manage')({
  component: Page,
})
