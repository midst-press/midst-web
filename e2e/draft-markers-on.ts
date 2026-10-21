import { Locator, Page } from '@playwright/test'
import { expect } from './coverage'

// The draft markers are off until the reader turns them on, poem by poem (#324). A test about how they look or what
// they do turns them on first, with the switch, as a reader would.
export async function showDraftMarkers(scope: Page | Locator): Promise<void> {
  const switches = scope.locator('.draft-markers-switch')
  for (const each of await switches.all()) {
    if ((await each.getAttribute('aria-checked')) === 'false') await each.click()
    await expect(each).toHaveAttribute('aria-checked', 'true')
  }
}
